import { vi } from "vitest";
import { encryptTokens } from "../security/encrypted-tokens.js";
import type { GitHubConfig } from "./github-config.js";
import type { GitHubConnectionRecord } from "./github-record.js";

export const githubTestConfig: GitHubConfig = {
  clientId: "Iv1.test", clientSecret: "test-client-secret", appSlug: "test-mailroom",
  redirectUri: "http://127.0.0.1:3001/v1/github/callback", encryptionKey: Buffer.alloc(32, 17),
};

export function githubRecord(userId = "user-maya", expired = false): GitHubConnectionRecord {
  return { userId, login: userId === "user-maya" ? "maya" : "leo", encryptedTokens: encryptTokens(JSON.stringify({
    accessToken: `ghu_${userId}`, refreshToken: `ghr_${userId}`,
    expiresAt: Date.now() + (expired ? -1000 : 3_600_000), refreshExpiresAt: Date.now() + 86_400_000,
  }), `github:${userId}`, githubTestConfig.encryptionKey) };
}

export function tokenBody() {
  return { access_token: "ghu_new", refresh_token: "ghr_new", expires_in: 28800, refresh_token_expires_in: 15897600, token_type: "bearer", scope: "" };
}

export function searchBody() {
  return { data: { search: { issueCount: 1, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{
    number: 12, title: "Private launch", author: { login: "maya" }, isDraft: false, state: "OPEN",
    reviewDecision: "REVIEW_REQUIRED", updatedAt: "2026-09-15T10:00:00Z", mergedAt: null,
    repository: { nameWithOwner: "team/private" },
  }] } } };
}

export function githubFetcher() {
  return vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input));
    if (url.pathname === "/login/oauth/access_token") return Response.json(tokenBody());
    if (url.pathname === "/user") return Response.json({ login: "maya" });
    if (url.pathname === "/user/repos") return Response.json([{ full_name: "team/private", private: true }]);
    if (url.pathname === "/repos/team/private") {
      return new Headers(options?.headers).get("authorization")?.includes("user-leo")
        ? Response.json({ message: "Not found" }, { status: 404 })
        : Response.json({ full_name: "team/private", private: true });
    }
    if (url.pathname === "/graphql") return Response.json(searchBody());
    throw new Error(`Unexpected GitHub fixture path: ${url.pathname}`);
  });
}
