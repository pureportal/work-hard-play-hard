import { getServerOrigin } from "../../server-url";

export function getRecommendedRedirectUri(provider: "github" | "spotify"): string | null {
  const origin = getServerOrigin();
  if (!origin) return null;
  const url = new URL(`/v1/${provider}/callback`, origin);
  if (url.hostname === "localhost" || url.protocol !== "https:"
    && !(url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname))) return null;
  return url.href;
}
