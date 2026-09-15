import { z } from "zod";
import type { GitHubConfig } from "./github-config.js";
import { GitHubError } from "./github-error.js";

export const githubTokensSchema = z.object({
  accessToken: z.string().min(1), refreshToken: z.string().min(1),
  expiresAt: z.number().finite(), refreshExpiresAt: z.number().finite(),
});
export type GitHubTokens = z.infer<typeof githubTokensSchema>;
const tokenResponseSchema = z.object({
  access_token: z.string().startsWith("ghu_"), refresh_token: z.string().startsWith("ghr_"),
  expires_in: z.number().int().positive(), refresh_token_expires_in: z.number().int().positive(),
  token_type: z.literal("bearer"), scope: z.literal(""),
});

export class GitHubClient {
  constructor(private readonly config: GitHubConfig, private readonly fetcher: typeof fetch = fetch) {}

  exchange(code: string, verifier: string): Promise<GitHubTokens> {
    return this.tokenRequest({ code, code_verifier: verifier, redirect_uri: this.config.redirectUri });
  }

  refresh(refreshToken: string): Promise<GitHubTokens> {
    return this.tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  async request(token: string, path: string, body?: object): Promise<unknown> {
    return this.fetchJson(`https://api.github.com${path}`, {
      method: body ? "POST" : "GET",
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2026-03-10", "user-agent": "work-hard-play-hard",
        ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  private async tokenRequest(parameters: Record<string, string>): Promise<GitHubTokens> {
    const data = await this.fetchJson("https://github.com/login/oauth/access_token", {
      method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, ...parameters }),
    });
    const failure = z.object({ error: z.string() }).safeParse(data);
    if (failure.success) {
      if (["bad_refresh_token", "bad_verification_code", "expired_token"].includes(failure.data.error)) {
        throw new GitHubError("GITHUB_RECONNECT", "Connect GitHub again.", 401);
      }
      throw new GitHubError("GITHUB_AUTH_FAILED", "GitHub could not connect. Try again.", 502);
    }
    const parsed = tokenResponseSchema.safeParse(data);
    if (!parsed.success) throw new GitHubError("GITHUB_APP_REQUIRED", "GitHub connection is not configured correctly. Contact the workspace owner.", 503);
    const token = parsed.data;
    return { accessToken: token.access_token, refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000, refreshExpiresAt: Date.now() + token.refresh_token_expires_in * 1000 };
  }

  private async fetchJson(url: string, options: RequestInit): Promise<unknown> {
    try {
      const response = await this.fetcher(url, { ...options, redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (response.status === 401) throw new GitHubError("GITHUB_RECONNECT", "Connect GitHub again.", 401);
      const limited = response.status === 429 || (response.status === 403
        && (response.headers.has("retry-after") || response.headers.get("x-ratelimit-remaining") === "0"));
      if (limited) {
        const retry = Number(response.headers.get("retry-after"));
        const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
        const seconds = Math.ceil(retry > 0 ? retry : reset > Date.now() ? (reset - Date.now()) / 1000 : 60);
        throw new GitHubError("GITHUB_RATE_LIMITED", "GitHub is busy. Try again later.", 429, Math.min(3600, seconds));
      }
      if (response.status === 403 || response.status === 404) {
        throw new GitHubError("GITHUB_ACCESS_DENIED", "Repository unavailable. Check GitHub access or choose another repository.", 403);
      }
      if (!response.ok) throw new GitHubError("GITHUB_UNAVAILABLE", "GitHub is unavailable. Try again shortly.", 502, 30);
      return await response.json();
    } catch (error) {
      if (error instanceof GitHubError) throw error;
      throw new GitHubError("GITHUB_UNAVAILABLE", "GitHub could not be reached. Try again shortly.", 502, 30);
    }
  }
}
