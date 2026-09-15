export interface SpotifyConfig {
  clientId: string;
  redirectUri: string;
  encryptionKey: Buffer;
}

export function readSpotifyConfig(environment = process.env): SpotifyConfig | undefined {
  const { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_REDIRECT_URI: redirectUri, SPOTIFY_TOKEN_KEY: tokenKey } = environment;
  if (!clientId && !redirectUri && !tokenKey) return undefined;
  if (!clientId || !redirectUri || !tokenKey) {
    throw new Error("Set SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI and SPOTIFY_TOKEN_KEY together.");
  }
  const url = new URL(redirectUri);
  const loopback = ["127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    || url.username || url.password || url.search || url.hash || url.pathname !== "/v1/spotify/callback") {
    throw new Error("SPOTIFY_REDIRECT_URI must be HTTPS (or an HTTP loopback IP) ending in /v1/spotify/callback.");
  }
  const encryptionKey = Buffer.from(tokenKey, "base64");
  if (encryptionKey.length !== 32 || encryptionKey.toString("base64") !== tokenKey) {
    throw new Error("SPOTIFY_TOKEN_KEY must be a base64-encoded 32-byte key.");
  }
  return { clientId, redirectUri, encryptionKey };
}
