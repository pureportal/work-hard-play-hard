const configuredServerOrigin = import.meta.env.VITE_SERVER_URL?.trim();

export const serverOrigin = configuredServerOrigin
  ? parseServerOrigin(configuredServerOrigin)
  : window.location.origin;

export function resolveServerUrl(path: string): string {
  return new URL(path, serverOrigin + "/").toString();
}

export function resolveRealtimeUrl(path: string): string {
  const url = new URL(path, serverOrigin + "/");
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function parseServerOrigin(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("VITE_SERVER_URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("VITE_SERVER_URL must be an origin without credentials, a path, a query, or a fragment.");
  }
  return url.origin;
}
