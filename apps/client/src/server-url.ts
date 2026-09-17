import { isNativeClient } from "./native-client";

const SERVER_ORIGIN_KEY = "northstar.serverOrigin";

export function getDefaultServerOrigin(): string | null {
  if (isNativeClient()) return null;
  const configuredServerOrigin = import.meta.env.VITE_SERVER_URL?.trim();
  return configuredServerOrigin
    ? normalizeServerOrigin(configuredServerOrigin)
    : window.location.origin;
}

export function getServerOrigin(): string | null {
  const storedServerOrigin = localStorage.getItem(SERVER_ORIGIN_KEY);
  if (storedServerOrigin) {
    try {
      return normalizeServerOrigin(storedServerOrigin);
    } catch {
      return null;
    }
  }
  return getDefaultServerOrigin();
}

export function setServerOrigin(value: string): string {
  const serverOrigin = normalizeServerOrigin(value);
  localStorage.setItem(SERVER_ORIGIN_KEY, serverOrigin);
  return serverOrigin;
}

export function clearServerOrigin(): string | null {
  localStorage.removeItem(SERVER_ORIGIN_KEY);
  return getDefaultServerOrigin();
}

export function resolveServerUrl(path: string): string {
  const origin = getServerOrigin();
  if (!origin) throw new Error("Enter your server URL to connect.");
  return new URL(path, origin + "/").toString();
}

export function resolveRealtimeUrl(path: string): string {
  const url = new URL(resolveServerUrl(path));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function normalizeServerOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a full server URL, such as https://office.example.com.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Server URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Server URL must be an origin without credentials, a path, a query, or a fragment.");
  }
  if (isNativeClient() && url.protocol !== "https:") {
    throw new Error("Use your server's HTTPS address to sign in from the installed app.");
  }
  return url.origin;
}
