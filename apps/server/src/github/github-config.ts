import { z } from "zod";
import { decryptTokens, encryptTokens } from "../security/encrypted-tokens.js";
import type { GitHubAppSettingsRecord } from "./github-record.js";

export interface GitHubConfig {
  clientId: string;
  clientSecret: string;
  appSlug: string;
  redirectUri: string;
  encryptionKey: Buffer;
}

export const githubAppSettingsSchema = z.object({
  clientId: z.string().trim().max(128).regex(/^[a-zA-Z0-9._-]*$/, "Enter a valid Client ID."),
  clientSecret: z.string().trim().min(1, "Enter a client secret.").max(4096).optional(),
  appSlug: z.string().trim().max(100).regex(/^[a-z0-9-]*$/, "Enter the app name from its GitHub URL."),
  redirectUri: z.string().trim().max(2048),
}).strict().superRefine(({ clientId, clientSecret, appSlug, redirectUri }, context) => {
  if (!clientId) {
    if (clientSecret || appSlug || redirectUri) context.addIssue({ code: "custom", message: "Enter a Client ID or clear all fields to disable GitHub." });
    return;
  }
  if (!appSlug) context.addIssue({ code: "custom", path: ["appSlug"], message: "Enter the app name from its GitHub URL." });
  const url = URL.parse(redirectUri);
  if (!url || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname)))
    || url.username || url.password || url.search || url.hash || url.pathname !== "/v1/github/callback") {
    context.addIssue({ code: "custom", path: ["redirectUri"], message: "Enter an HTTPS redirect URI ending in /v1/github/callback, or use an HTTP loopback IP." });
  }
});

export function readGitHubConfig(environment = process.env): GitHubConfig | undefined {
  const { GITHUB_CLIENT_ID: clientId, GITHUB_CLIENT_SECRET: clientSecret, GITHUB_APP_SLUG: appSlug,
    GITHUB_REDIRECT_URI: redirectUri, GITHUB_TOKEN_KEY: tokenKey } = environment;
  if (![clientId, clientSecret, appSlug, redirectUri].some(Boolean)) {
    if (tokenKey) readGitHubEncryptionKey(tokenKey);
    return undefined;
  }
  if (!clientId || !clientSecret || !appSlug || !redirectUri || !tokenKey) {
    throw new Error("Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_APP_SLUG, GITHUB_REDIRECT_URI and GITHUB_TOKEN_KEY together.");
  }
  const parsed = githubAppSettingsSchema.safeParse({ clientId, clientSecret, appSlug, redirectUri });
  if (!parsed.success) throw new Error("Check the GitHub Client ID, app slug and callback URL.");
  return { ...parsed.data, clientSecret: parsed.data.clientSecret!, encryptionKey: readGitHubEncryptionKey(tokenKey) };
}

export function readGitHubEncryptionKey(tokenKey: string): Buffer {
  const encryptionKey = Buffer.from(tokenKey, "base64");
  if (encryptionKey.length !== 32 || encryptionKey.toString("base64") !== tokenKey) {
    throw new Error("GITHUB_TOKEN_KEY must be a base64-encoded 32-byte key.");
  }
  return encryptionKey;
}

export function storeGitHubConfig(config: GitHubConfig): GitHubAppSettingsRecord {
  return {
    clientId: config.clientId, appSlug: config.appSlug, redirectUri: config.redirectUri,
    encryptedClientSecret: encryptTokens(config.clientSecret, "github:app", config.encryptionKey),
    connectionsResetPending: false,
  };
}

export function resolveGitHubConfig(settings: GitHubAppSettingsRecord | null, encryptionKey: Buffer | undefined): GitHubConfig | undefined {
  if (!settings?.clientId || !settings.encryptedClientSecret || !encryptionKey) return undefined;
  return {
    clientId: settings.clientId, appSlug: settings.appSlug, redirectUri: settings.redirectUri, encryptionKey,
    clientSecret: decryptTokens(settings.encryptedClientSecret, "github:app", encryptionKey),
  };
}
