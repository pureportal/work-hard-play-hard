import { createHash, randomBytes } from "node:crypto";
import { SPOTIFY_SCOPES, SpotifyError } from "./spotify-client.js";
import type { SpotifyConfig } from "./spotify-config.js";

interface AuthorizationAttempt {
  userId: string;
  sessionHash: string;
  verifier: string;
  expiresAt: number;
}

export class SpotifyAuthorization {
  private readonly attempts = new Map<string, AuthorizationAttempt>();

  begin(userId: string, sessionToken: string, config: SpotifyConfig): { url: string; state: string } {
    for (const [state, attempt] of this.attempts) {
      if (attempt.expiresAt <= Date.now() || attempt.userId === userId) this.attempts.delete(state);
    }
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    this.attempts.set(state, {
      userId, verifier, sessionHash: createHash("sha256").update(sessionToken).digest("hex"),
      expiresAt: Date.now() + 10 * 60_000,
    });
    const url = new URL("https://accounts.spotify.com/authorize");
    url.search = new URLSearchParams({
      response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri,
      scope: SPOTIFY_SCOPES.join(" "), state, code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"), show_dialog: "true",
    }).toString();
    return { url: url.toString(), state };
  }

  consume(state: string, cookieState: string | undefined, userId: string, sessionToken: string): string {
    const attempt = this.attempts.get(state);
    if (!attempt || state !== cookieState || attempt.userId !== userId || attempt.expiresAt <= Date.now()
      || attempt.sessionHash !== createHash("sha256").update(sessionToken).digest("hex")) {
      throw new SpotifyError("SPOTIFY_STATE_INVALID", "Spotify connection expired. Try connecting again.", 400);
    }
    this.attempts.delete(state);
    return attempt.verifier;
  }

  cancel(userId: string): void {
    for (const [state, attempt] of this.attempts) {
      if (attempt.userId === userId) this.attempts.delete(state);
    }
  }
}
