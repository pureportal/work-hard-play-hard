import { createHash, randomBytes } from "node:crypto";
import type { GitHubConfig } from "./github-config.js";
import { GitHubError } from "./github-error.js";

interface AuthorizationAttempt {
  userId: string;
  sessionHash: string;
  verifier: string;
  expiresAt: number;
}

export class GitHubAuthorization {
  private readonly attempts = new Map<string, AuthorizationAttempt>();

  begin(userId: string, sessionToken: string, config: GitHubConfig): { url: string; state: string } {
    for (const [state, attempt] of this.attempts) {
      if (attempt.expiresAt <= Date.now() || attempt.userId === userId) this.attempts.delete(state);
    }
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    this.attempts.set(state, { userId, verifier, expiresAt: Date.now() + 600_000,
      sessionHash: createHash("sha256").update(sessionToken).digest("hex") });
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, state,
      code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      prompt: "select_account" }).toString();
    return { url: url.toString(), state };
  }

  consume(state: string, cookie: string | undefined, userId: string, sessionToken: string): string {
    const attempt = this.attempts.get(state);
    if (!attempt || state !== cookie || attempt.userId !== userId || attempt.expiresAt <= Date.now()
      || attempt.sessionHash !== createHash("sha256").update(sessionToken).digest("hex")) {
      throw new GitHubError("GITHUB_STATE_INVALID", "GitHub connection expired. Connect again.", 400);
    }
    this.attempts.delete(state);
    return attempt.verifier;
  }

  cancel(userId: string): void {
    for (const [state, attempt] of this.attempts) if (attempt.userId === userId) this.attempts.delete(state);
  }
}
