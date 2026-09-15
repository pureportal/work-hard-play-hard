# Spotify

Players connect Spotify in **Settings → Spotify**. Sharing starts off. When enabled, a playing song adds animated notes above the avatar. Select the player, then the music action to see the song, artist and artwork beside them.

## Setup

1. Create a Web API application in the [Spotify developer dashboard](https://developer.spotify.com/dashboard). Register the exact callback URL:
   - Production: `https://your-app.example/v1/spotify/callback`
   - Local browser development: `http://127.0.0.1:3001/v1/spotify/callback`
2. Set these server environment variables. For local development, put them in `.env.local` at the repository root; `pnpm --filter @workhard/server dev` loads that Git-ignored file. Variables already set in the Server task take precedence. Compose passes the Spotify values through from `.env` and uses `NORTHSTAR_PUBLIC_URL` for `CLIENT_URL`.

   | Variable | Value |
   | --- | --- |
   | `SPOTIFY_CLIENT_ID` | The application's client ID |
   | `SPOTIFY_REDIRECT_URI` | The registered callback URL |
   | `SPOTIFY_TOKEN_KEY` | A persistent, base64-encoded 32-byte random encryption key |
   | `CLIENT_URL` | The browser app's URL, used after authorization |

   Generate the encryption key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Keep it in the deployment's secret store. Losing or changing this key requires users to reconnect.
3. Restart the server with those variables. Its normal migrations create `spotify_connections` in PostgreSQL. Use the same hostname for the browser and callback in development; use `127.0.0.1` rather than `localhost`. Spotify requires HTTPS except for explicit loopback IPs. [Redirect requirements](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).
4. Add test accounts to the dashboard allowlist. Development mode currently requires Premium for the app owner and permits five authenticated users. Wider deployment requires Spotify's extended access approval. Quotas are also shared across the developer account's development apps. [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), [July 2026 quota update](https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates).

Authorization uses [Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), with `user-read-playback-state` and `user-modify-playback-state`. No client secret is needed. A single-use state value, an HttpOnly cookie and the exact signed-in application session bind the callback. The browser never receives Spotify tokens. OAuth state and authorization codes are excluded from application request logs; configure reverse-proxy access logs to omit callback query strings too.

Access and refresh tokens are stored together using AES-256-GCM, bound to the application user ID. Refreshes are serialized per account. Expired or revoked refresh tokens are discarded and require reconnection. Spotify introduced a six-month refresh-token lifetime in June 2026; refreshing access does not extend it. [Refresh-token expiration](https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration).

## Listening activity

- The server polls `GET /me/player` once per online sharing account, normally every 15 seconds while playing and 20 seconds while idle. Near a track's end, the next poll can occur after five seconds. Multiple tabs and observers share the same sample.
- Results travel through the existing authenticated WebSocket connection. Late joiners receive an activity snapshot. Song data is held in memory only.
- Pause, no playback, private sessions, ads, episodes, local files, unusable track data and provider errors clear the indicator and song details. Sharing off, Spotify disconnect and the last workspace socket closing clear activity immediately.
- Samples expire after at most 30 seconds, or at the estimated track end. The client translates server deadlines to its own clock and removes stale details independently; losing the workspace connection clears its view. Polling means pause/skip changes can take roughly one interval to appear.
- Spotify publishes no universal requests-per-second allowance. Its rate limit uses a rolling 30-second window; development quotas are separate. HTTP 429 clears current activity and pauses provider calls globally for `Retry-After`. Without that header, rate errors wait one minute and `QUOTA_EXCEEDED` waits one hour. Timeouts and other failures retry after a minute. [Rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits).

## Listening actions and platform limits

| Action | Behavior |
| --- | --- |
| Play on my Spotify | Starts the selected song on the requesting user's active Spotify device. Requires a connected account, Premium, an active controllable device and access to that track. Device and account failures provide recovery at the action. It does not synchronize positions, queues or future songs. |
| Open in Spotify | Opens the track's Spotify page. Playback and track availability are handled by Spotify. |
| Join Jam | Opens a host-supplied Spotify invite. Hosts add or remove the link in Settings while sharing a playing song. The invite expires locally after an hour and clears on pause, privacy/error states, disconnect or sharing off. |

Spotify's [playback API](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback) controls an existing device; this application does not stream audio or create a Spotify playback device. Playback stays personal to the requesting account and may fail for restricted devices, account plans or regional track availability.

Remote Jam is real, but Spotify's public Web API has no documented Jam creation, discovery, membership or liveness endpoint. A user must create the Jam in Spotify and paste its invitation. Short links cannot be verified as active Jams here; Spotify handles validation and joining when opened. Hosting and remote listening require Premium. There is no automatic “join this person's session” action without an invite. [Spotify Jam support](https://support.spotify.com/pk-en/article/jam/), [Web API reference](https://developer.spotify.com/documentation/web-api).

Account connection is implemented in the web app. Desktop and Android clients use the same account connection and sharing controls after linking through the web app; they direct unconnected users there rather than opening Spotify authorization inside an embedded webview. Native external-link handoff has not been verified on devices.

Disconnect deletes this application's stored credentials and sharing preference. It does not revoke the grant in Spotify's account settings. No listening history is retained.

**Deployment restriction:** Spotify's Developer Policy restricts games, business-targeted applications, commercial streaming, broadcasting and synchronization with visual media. This workspace includes office and game features; implementing these endpoints does not establish permission to deploy this use case. Confirm eligibility with Spotify before enabling it for a public or business deployment. The integration remains unavailable until explicitly configured. [Spotify Developer Policy, sections II–IV](https://developer.spotify.com/policy).

## Verification

- `pnpm --filter @workhard/server exec vitest run src/spotify`
- `pnpm --filter @workhard/client exec vitest run src/spotify/spotify.test.tsx src/components/WorldCanvas.test.tsx`
- `pnpm --filter @workhard/server exec vitest run tests/spotify-persistence.test.ts` uses temporary PostgreSQL tables and rolls back its transaction.
- `pnpm build:client`, then `pnpm --filter @workhard/server exec tsx ../../scripts/spotify-browser-check.ts`. This runs the production client against an isolated in-memory test server with mocked Spotify responses, real application sessions and two browser contexts. Screenshots go to `artifacts/spotify/`.

The automated checks exercise state/PKCE/session binding and replay protection; encrypted storage; opt-in sharing; refresh and invalid grants; stale, paused and private playback; rate limits; disconnect races; two-player delivery; playback-account isolation; Jam links; song details; and reduced motion.

No real Spotify client ID or account was supplied. Spotify-hosted consent, token issuance, actual device playback, live quotas, regional restrictions and opening a real Jam still require an end-to-end check with allowlisted accounts. The browser harness simulates Spotify consent and provider responses; it does not establish real-account access.
