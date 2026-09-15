import { z } from "zod";
import type { SpotifyActivity } from "@workhard/shared";
import type { SpotifyConfig } from "./spotify-config.js";

export const SPOTIFY_SCOPES = ["user-read-playback-state", "user-modify-playback-state"];
const tokenResponse = z.object({
  access_token: z.string().min(1), refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive(), scope: z.string().optional(),
});
export const spotifyTokensSchema = z.object({
  accessToken: z.string().min(1), refreshToken: z.string().min(1), expiresAt: z.number(),
});
export type SpotifyTokens = z.infer<typeof spotifyTokensSchema>;

const playbackSchema = z.object({
  is_playing: z.boolean(), currently_playing_type: z.string(),
  progress_ms: z.number().nonnegative().nullable(),
  device: z.object({ is_private_session: z.boolean() }).nullable(),
  item: z.unknown().nullable(),
});
const trackSchema = z.object({
  type: z.literal("track"), id: z.string().regex(/^[a-zA-Z0-9]{22}$/),
  is_local: z.literal(false), name: z.string().min(1).max(1000),
  duration_ms: z.number().positive(),
  artists: z.array(z.object({ name: z.string().min(1).max(1000) })).min(1),
  album: z.object({ name: z.string().max(1000), images: z.array(z.object({ url: z.string().url() })) }),
});

export class SpotifyError extends Error {
  constructor(readonly code: string, message: string, readonly status = 502) {
    super(message);
  }
}

export class SpotifyClient {
  retryAt = 0;

  constructor(private readonly config: SpotifyConfig, private readonly fetcher: typeof fetch = fetch) {}

  async exchange(code: string, verifier: string): Promise<SpotifyTokens> {
    return this.requestTokens(new URLSearchParams({
      grant_type: "authorization_code", code, code_verifier: verifier,
      redirect_uri: this.config.redirectUri, client_id: this.config.clientId,
    }));
  }

  async refresh(tokens: SpotifyTokens): Promise<SpotifyTokens> {
    return this.requestTokens(new URLSearchParams({
      grant_type: "refresh_token", refresh_token: tokens.refreshToken, client_id: this.config.clientId,
    }), tokens.refreshToken);
  }

  private async requestTokens(body: URLSearchParams, refreshToken?: string): Promise<SpotifyTokens> {
    const response = await this.request("https://accounts.spotify.com/api/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body,
    });
    const data = await response.json();
    if (!response.ok) {
      if (typeof data === "object" && data !== null && "error" in data && data.error === "invalid_grant") {
        throw new SpotifyError("SPOTIFY_RECONNECT", "Connect Spotify again to continue.", 409);
      }
      throw new SpotifyError("SPOTIFY_AUTH_FAILED", "Spotify could not connect. Try connecting again.");
    }
    const tokens = tokenResponse.parse(data);
    if ((!refreshToken && tokens.scope === undefined)
      || (tokens.scope !== undefined && SPOTIFY_SCOPES.some((scope) => !tokens.scope!.split(" ").includes(scope)))) {
      throw new SpotifyError("SPOTIFY_SCOPES", "Connect Spotify again and allow listening activity and playback control.", 409);
    }
    const nextRefreshToken = tokens.refresh_token ?? refreshToken;
    if (!nextRefreshToken) throw new SpotifyError("SPOTIFY_AUTH_FAILED", "Spotify could not connect. Try connecting again.");
    return { accessToken: tokens.access_token, refreshToken: nextRefreshToken, expiresAt: Date.now() + tokens.expires_in * 1000 };
  }

  async playback(accessToken: string, userId: string): Promise<SpotifyActivity | null> {
    const response = await this.api("/me/player", accessToken);
    if (response.status === 204) return null;
    const playback = playbackSchema.parse(await response.json());
    if (!playback.is_playing || playback.currently_playing_type !== "track"
      || !playback.device || playback.device.is_private_session) return null;
    const track = trackSchema.safeParse(playback.item);
    if (!track.success) return null;
    const item = track.data;
    const remainingMs = item.duration_ms - (playback.progress_ms ?? item.duration_ms);
    if (remainingMs <= 0) return null;
    const artwork = item.album.images.find(({ url }) => {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === "i.scdn.co" && !parsed.username && !parsed.password && !parsed.port;
    });
    return {
      userId, trackId: item.id, title: item.name, artist: item.artists.map(({ name }) => name).join(", "),
      album: item.album.name, artworkUrl: artwork?.url ?? null,
      trackUrl: `https://open.spotify.com/track/${item.id}`,
      expiresAt: Date.now() + Math.min(30_000, remainingMs), jamUrl: null,
    };
  }

  async play(accessToken: string, trackId: string): Promise<void> {
    await this.api("/me/player/play", accessToken, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
    });
  }

  private async api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.request(`https://api.spotify.com/v1${path}`, {
      ...init, headers: { ...init.headers, authorization: `Bearer ${token}` },
    });
    if (response.ok) return response;
    if (response.status === 401) throw new SpotifyError("SPOTIFY_ACCESS_EXPIRED", "Connect Spotify again to continue.", 409);
    if (response.status === 403) {
      throw new SpotifyError("SPOTIFY_FORBIDDEN", path.endsWith("/play")
        ? "Spotify requires Premium and a device that allows playback control. Open this song in Spotify."
        : "Spotify denied access. Check the app’s allowed users, then reconnect.", 403);
    }
    if (response.status === 404) throw new SpotifyError("SPOTIFY_NO_DEVICE", "Open Spotify and play something on your device, then try again.", 409);
    throw new SpotifyError("SPOTIFY_UNAVAILABLE", "Spotify is unavailable. Try again shortly.");
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    if (Date.now() < this.retryAt) throw new SpotifyError("SPOTIFY_RATE_LIMITED", "Spotify is busy. Try again later.", 429);
    let response: Response;
    try {
      response = await this.fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(8_000) });
    } catch {
      throw new SpotifyError("SPOTIFY_UNAVAILABLE", "Spotify is unavailable. Try again shortly.");
    }
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"));
      const body = await response.json().catch(() => null) as { error?: { reason?: string } } | null;
      const quota = body?.error?.reason === "QUOTA_EXCEEDED";
      const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : quota ? 3_600_000 : 60_000;
      this.retryAt = Math.max(this.retryAt, Date.now() + delay);
      throw new SpotifyError("SPOTIFY_RATE_LIMITED", quota
        ? "Spotify’s app quota is exhausted. Try again later."
        : "Spotify is busy. Try again later.", 429);
    }
    return response;
  }
}
