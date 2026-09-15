export interface GitHubConfig {
  clientId: string;
  clientSecret: string;
  appSlug: string;
  redirectUri: string;
  encryptionKey: Buffer;
}

export function readGitHubConfig(environment = process.env): GitHubConfig | undefined {
  const { GITHUB_CLIENT_ID: clientId, GITHUB_CLIENT_SECRET: clientSecret, GITHUB_APP_SLUG: appSlug,
    GITHUB_REDIRECT_URI: redirectUri, GITHUB_TOKEN_KEY: tokenKey } = environment;
  if (![clientId, clientSecret, appSlug, redirectUri, tokenKey].some(Boolean)) return undefined;
  if (!clientId || !clientSecret || !appSlug || !redirectUri || !tokenKey) {
    throw new Error("Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_APP_SLUG, GITHUB_REDIRECT_URI and GITHUB_TOKEN_KEY together.");
  }
  const url = new URL(redirectUri);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname)))
    || url.username || url.password || url.search || url.hash || url.pathname !== "/v1/github/callback") {
    throw new Error("GITHUB_REDIRECT_URI must use HTTPS (or an HTTP loopback IP) and end in /v1/github/callback.");
  }
  if (!/^[a-z0-9-]{1,100}$/.test(appSlug)) throw new Error("GITHUB_APP_SLUG must be the GitHub App URL name.");
  const encryptionKey = Buffer.from(tokenKey, "base64");
  if (encryptionKey.length !== 32 || encryptionKey.toString("base64") !== tokenKey) {
    throw new Error("GITHUB_TOKEN_KEY must be a base64-encoded 32-byte key.");
  }
  return { clientId, clientSecret, appSlug, redirectUri, encryptionKey };
}
