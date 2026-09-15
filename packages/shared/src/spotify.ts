export interface SpotifyActivity {
  userId: string;
  trackId: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string | null;
  trackUrl: string;
  expiresAt: number;
  jamUrl: string | null;
}

export interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  sharing: boolean;
  needsReconnect: boolean;
  error: string | null;
  jamUrl: string | null;
}

export type SpotifyEvent =
  | { type: "spotify.snapshot"; serverTime: number; activities: SpotifyActivity[] }
  | { type: "spotify.activity"; serverTime: number; userId: string; activity: SpotifyActivity | null };

export function isSpotifyJamUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash
      && ((url.hostname === "spotify.link" && /^\/[a-zA-Z0-9]+$/.test(url.pathname))
        || (url.hostname === "open.spotify.com" && /^\/socialsession\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)));
  } catch {
    return false;
  }
}
