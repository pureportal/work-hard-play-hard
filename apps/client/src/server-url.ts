const SERVER_ORIGIN_KEY = "northstar.serverOrigin";
const configuredServerOrigin = import.meta.env.VITE_SERVER_URL?.trim();

export function getDefaultServerOrigin(): string {
  return configuredServerOrigin
    ? normalizeServerOrigin(configuredServerOrigin)
    : window.location.origin;
}

export function getServerOrigin(): string {
  const storedServerOrigin = localStorage.getItem(SERVER_ORIGIN_KEY);
  if (storedServerOrigin) {
    return normalizeServerOrigin(storedServerOrigin);
  }
  return getDefaultServerOrigin();
}

export function setServerOrigin(value: string): string {
  const serverOrigin = normalizeServerOrigin(value);
  localStorage.setItem(SERVER_ORIGIN_KEY, serverOrigin);
  return serverOrigin;
}

export function clearServerOrigin(): string {
  localStorage.removeItem(SERVER_ORIGIN_KEY);
  return getDefaultServerOrigin();
}

export function resolveServerUrl(path: string): string {
  return new URL(path, getServerOrigin() + "/").toString();
}

export function resolveRealtimeUrl(path: string): string {
  const url = new URL(path, getServerOrigin() + "/");
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function normalizeServerOrigin(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Server URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Server URL must be an origin without credentials, a path, a query, or a fragment.");
  }
  return url.origin;
}
