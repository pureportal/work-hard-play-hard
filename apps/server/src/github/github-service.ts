import { z } from "zod";
import type { GitHubMailroomView, GitHubStatus } from "@workhard/shared";
import type { ApplicationDatabase } from "../persistence/application-database.js";
import { decryptTokens, encryptTokens } from "../security/encrypted-tokens.js";
import { GitHubAuthorization } from "./github-authorization.js";
import { GitHubClient, githubTokensSchema, type GitHubTokens } from "./github-client.js";
import type { GitHubConfig } from "./github-config.js";
import { GitHubError } from "./github-error.js";
import { listGitHubRepositories, readGitHubMailroom } from "./github-mailroom.js";
import type { GitHubConnectionRecord } from "./github-record.js";

export class GitHubService {
  readonly authorization = new GitHubAuthorization();
  private readonly records = new Map<string, GitHubConnectionRecord>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly revisions = new Map<string, number>();
  private readonly retryAt = new Map<string, number>();
  private readonly client: GitHubClient | undefined;
  private stopped = false;

  private constructor(private readonly database: ApplicationDatabase, private readonly config: GitHubConfig | undefined, fetcher?: typeof fetch) {
    this.client = config ? new GitHubClient(config, fetcher) : undefined;
  }

  static async create(database: ApplicationDatabase, config: GitHubConfig | undefined, fetcher?: typeof fetch): Promise<GitHubService> {
    const service = new GitHubService(database, config, fetcher);
    for (const record of await database.loadGitHubConnections()) service.records.set(record.userId, record);
    return service;
  }

  status(userId: string): GitHubStatus {
    const record = this.records.get(userId);
    return { configured: Boolean(this.config), connected: Boolean(record?.encryptedTokens),
      needsReconnect: Boolean(record && !record.encryptedTokens), login: record?.login ?? null,
      installationUrl: this.config ? `https://github.com/apps/${this.config.appSlug}/installations/new` : null };
  }

  beginConnection(userId: string, sessionToken: string): { url: string; state: string } {
    if (!this.config) throw new GitHubError("GITHUB_NOT_CONFIGURED", "GitHub has not been set up for this workspace.", 503);
    this.revisions.set(userId, (this.revisions.get(userId) ?? 0) + 1);
    return this.authorization.begin(userId, sessionToken, this.config);
  }

  async completeConnection(userId: string, code: string, verifier: string, sessionIsActive: () => boolean): Promise<void> {
    const revision = this.revisions.get(userId);
    await this.enqueue(userId, async () => {
      if (!this.client || !this.config) throw new GitHubError("GITHUB_NOT_CONFIGURED", "GitHub has not been set up for this workspace.", 503);
      const tokens = await this.client.exchange(code, verifier);
      const profile = z.object({ login: z.string().min(1).max(100) }).parse(await this.client.request(tokens.accessToken, "/user"));
      this.assertCurrent(userId, revision, sessionIsActive);
      const record = { userId, login: profile.login, encryptedTokens: this.encrypt(userId, tokens) };
      await this.database.saveGitHubConnection(record);
      if (!sessionIsActive() || this.stopped || this.revisions.get(userId) !== revision) {
        await this.database.removeGitHubConnection(userId);
        this.assertCurrent(userId, revision, sessionIsActive);
      }
      this.records.set(userId, record);
      this.retryAt.delete(userId);
    });
  }

  async disconnect(userId: string): Promise<GitHubStatus> {
    this.authorization.cancel(userId);
    this.revisions.set(userId, (this.revisions.get(userId) ?? 0) + 1);
    this.records.delete(userId);
    this.retryAt.delete(userId);
    await this.enqueue(userId, () => this.database.removeGitHubConnection(userId));
    return this.status(userId);
  }

  repositories(userId: string, page: number) {
    return this.withToken(userId, (token) => listGitHubRepositories(this.client!, token, page));
  }

  mailroom(userId: string, repository: string, view: GitHubMailroomView, cursor?: string) {
    return this.withToken(userId, (token) => readGitHubMailroom(this.client!, token, repository, view, cursor));
  }

  async close(): Promise<void> {
    this.stopped = true;
    await Promise.allSettled(this.queues.values());
  }

  private withToken<T>(userId: string, operation: (token: string) => Promise<T>): Promise<T> {
    const revision = this.revisions.get(userId);
    return this.enqueue(userId, async () => {
      this.assertCurrent(userId, revision);
      if (!this.client || !this.config) throw new GitHubError("GITHUB_NOT_CONFIGURED", "GitHub has not been set up for this workspace.", 503);
      const record = this.records.get(userId);
      if (!record?.encryptedTokens) throw new GitHubError("GITHUB_RECONNECT", "Connect GitHub to open the tray.", 401);
      const wait = (this.retryAt.get(userId) ?? 0) - Date.now();
      if (wait > 0) throw new GitHubError("GITHUB_RATE_LIMITED", "GitHub is busy. Try again later.", 429, Math.ceil(wait / 1000));
      try {
        let tokens: GitHubTokens;
        try { tokens = githubTokensSchema.parse(JSON.parse(decryptTokens(record.encryptedTokens, `github:${userId}`, this.config.encryptionKey))); }
        catch { throw new GitHubError("GITHUB_RECONNECT", "Connect GitHub again.", 401); }
        if (tokens.expiresAt <= Date.now() + 60_000) {
          if (tokens.refreshExpiresAt <= Date.now()) throw new GitHubError("GITHUB_RECONNECT", "Connect GitHub again.", 401);
          tokens = await this.client.refresh(tokens.refreshToken);
          this.assertCurrent(userId, revision);
          const updated = { ...record, encryptedTokens: this.encrypt(userId, tokens) };
          await this.database.saveGitHubConnection(updated);
          this.assertCurrent(userId, revision);
          this.records.set(userId, updated);
        }
        const result = await operation(tokens.accessToken);
        this.assertCurrent(userId, revision);
        return result;
      } catch (error) {
        if (this.revisions.get(userId) === revision && error instanceof GitHubError) {
          if (error.code === "GITHUB_RECONNECT") {
            const invalid = { ...record, encryptedTokens: null };
            this.records.set(userId, invalid);
            await this.database.saveGitHubConnection(invalid);
          }
          if (error.retryAfter) this.retryAt.set(userId, Date.now() + error.retryAfter * 1000);
        }
        if (error instanceof z.ZodError) throw new GitHubError("GITHUB_RESPONSE_INVALID", "GitHub returned an invalid response. Try again later.", 502);
        throw error;
      }
    });
  }

  private encrypt(userId: string, tokens: GitHubTokens): string {
    return encryptTokens(JSON.stringify(tokens), `github:${userId}`, this.config!.encryptionKey);
  }

  private assertCurrent(userId: string, revision: number | undefined, sessionIsActive = () => true): void {
    if (this.stopped || this.revisions.get(userId) !== revision || !sessionIsActive()) {
      throw new GitHubError("GITHUB_CANCELLED", "GitHub connection changed. Open the tray again.", 409);
    }
  }

  private enqueue<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    const settled = next.then(() => undefined, () => undefined).finally(() => {
      if (this.queues.get(userId) === settled) this.queues.delete(userId);
    });
    this.queues.set(userId, settled);
    return next;
  }
}
