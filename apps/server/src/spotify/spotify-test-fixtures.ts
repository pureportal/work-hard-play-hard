import type { SpotifyConfig } from "./spotify-config.js";
import { encryptTokens } from "../security/encrypted-tokens.js";
import type { SpotifyConnectionRecord } from "./spotify-record.js";

export const spotifyTestConfig: SpotifyConfig = {
  clientId: "test-client", redirectUri: "http://127.0.0.1:3001/v1/spotify/callback", encryptionKey: Buffer.alloc(32, 7),
};
export const testTrackId = "4iV5W9uYEdYUVa79Axb7Rh";

export function spotifyRecord(userId = "user-maya", sharing = true, expiresAt = Date.now() + 86_400_000): SpotifyConnectionRecord {
  return {
    userId, sharing, encryptedTokens: encryptTokens(JSON.stringify({
      accessToken: `test-access-${userId}`, refreshToken: `test-refresh-${userId}`, expiresAt,
    }), userId, spotifyTestConfig.encryptionKey),
  };
}

export function playbackBody(trackId = testTrackId) {
  return {
    is_playing: true, currently_playing_type: "track", progress_ms: 12_000,
    device: { is_private_session: false },
    item: {
      type: "track", id: trackId, is_local: false, name: "Test song", duration_ms: 210_000,
      artists: [{ name: "Test artist" }],
      album: { name: "Test album", images: [{ url: "https://i.scdn.co/image/test-artwork" }] },
    },
  };
}
