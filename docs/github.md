# GitHub PR mailroom

Players connect GitHub in Settings or in a PR tray. The tray is a desk decoration in Build: 35 coins, the same footprint and price as the book stack. Existing placement, ownership, room and movement rules apply.

The shared tray opens a personal view of a selected repository. Open, Mine, Review requests and Merged tabs show PR titles, authors, draft/review state and direct GitHub links. Repository selection lasts for the current game session and is never saved in a world object. Each viewer uses their own GitHub connection.

The open tray refreshes once a minute while visible. Hiding the tab cancels pending PR requests and clears the results; returning starts a fresh request. A newly observed merge gets one small paper-plane motion and a link in the Merged tab. Initial loads, page changes and returning to the tab do not replay celebrations; batches produce one notice. The effect uses the existing icon system, has no sound, and respects reduced motion. No GitHub activity is broadcast to the room. The world tray artwork has a fixed stack; exact matching counts appear in the panel.

Chat, meeting chat and whiteboard card notes render pasted HTTP(S) links. Links do not fetch previews or copy PR metadata. Users explicitly choose the URLs they post. Shared PR cards and live whiteboard status are deferred: the current messages and board documents are shared state, so storing imported private metadata there would bypass GitHub access checks.

## GitHub App setup

1. Register a **GitHub App**, with repository **Pull requests: Read-only** and **Metadata: Read-only**. Request no code, write, organization-member, email or account permissions.
2. Enable expiring user access tokens. Non-expiring tokens and OAuth Apps with broad `repo` scopes are rejected.
3. Set the callback URL to the externally reachable server URL ending in `/v1/github/callback`. HTTPS is required except for HTTP loopback IPs. Local example: `http://127.0.0.1:3001/v1/github/callback`. Use the same hostname when opening the web client so the session/state cookies reach the callback.
4. Leave **Request user authorization (OAuth) during installation** off. Players begin authorization with Connect GitHub in the game. No webhook endpoint or subscriptions are required for this version.
5. Set `GITHUB_TOKEN_KEY` on the server to a base64-encoded random 32-byte encryption key, then restart the server. Generate it with `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"` and preserve it across restarts.
6. Open **Server settings → GitHub** as a server administrator. Enter the Client ID, client secret, app slug (the name in `github.com/apps/<name>`) and exact registered Redirect URI, then select **Save GitHub**. Changes apply immediately and disconnect existing GitHub accounts. Leave **Replace client secret** empty to keep the saved secret; changing the Client ID requires a new secret. Clear the Client ID and save to disable GitHub.

The client secret is encrypted in PostgreSQL and is never returned to the browser. The encryption key stays in the server environment. Losing or changing it requires restoring the key to read the saved secret and account credentials.

For initial provisioning, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_SLUG` and `GITHUB_REDIRECT_URI` can be supplied together with `GITHUB_TOKEN_KEY`. They initialize settings only when none have been saved. Saved settings take precedence on subsequent starts, including when GitHub is disabled. `.env.example` and Compose include these variables.

Keep callback query strings out of reverse-proxy access logs; the application suppresses logging on GitHub callback and data routes.

Install the app for selected repositories, including organization approval where required. Players can use Manage repositories on GitHub from the tray; the picker reloads when they return. Organization SAML sessions and installation policies can still prevent access and need verification against the real organization.

The migration creates `github_connections`; normal server startup applies migrations. Disconnect removes the game's credentials. Full revocation of the app authorization is also available in GitHub account settings. Browser connection is implemented; native clients connect through the web app first.

## Access and failure handling

- Authorization uses PKCE S256 and a ten-minute, single-use state bound to the signed-in player, session and HttpOnly/SameSite cookie. Session changes and disconnect cancel in-flight completion.
- Access and refresh tokens are encrypted with AES-256-GCM, bound to both the provider and player. The client receives neither token. Spotify now uses the same encryption primitive while retaining its existing credential format.
- Only GitHub user access tokens are used. Their access is the intersection of the user's access and the app's installation/permissions. No installation token is used to grant a player broader access.
- Each PR request checks game proximity and the room before and after GitHub responds, then reads repository access using the requesting player's token. There is no shared PR cache, shared repository configuration or GitHub websocket payload.
- Refreshes are serialized per player. Timeouts, rate limits, revoked tokens, malformed responses and partial GraphQL errors fail closed. HTTP responses use `no-store`; PR details disappear after a failed refresh, disconnect, hiding the tab or leaving the tray.
- Read access can change between refreshes. Data already delivered to a viewer cannot be recalled. This version polls while a tray is open; it does not provide immediate webhook invalidation or a durable event history.
- PR search uses GitHub's search index and pagination, so counts and results reflect that index and its result limits. Mergeability, CI checks, reviewer rosters and write actions are outside this first version.
- OAuth attempts, request queues and connection records are held in one application process, with encrypted credentials persisted in PostgreSQL. Multiple server replicas require shared authorization/refresh coordination before deployment.

## Verification

Verified locally: workspace typechecks and lint, the client production build, 453 client tests, 21 GitHub service/routes/world tests, PostgreSQL credential persistence, all 81 asset definitions, and the browser fixture. The refined client build completes without the large-chunk warning. Measurements and refinement checks are recorded in [refinement-performance.md](refinement-performance.md).

Run from the repository root:

```sh
pnpm --filter @workhard/server exec vitest run src/github src/spotify src/world/world-runtime.work-objects.test.ts
pnpm --filter @workhard/server exec vitest run tests/github-persistence.test.ts tests/github-settings-persistence.test.ts
pnpm --filter @workhard/client exec vitest run src/github src/components/LinkedText.test.tsx src/components/ChatPanel.test.tsx src/components/MeetingChat.test.tsx src/components/whiteboard
pnpm assets:world:check
pnpm --filter @workhard/client build
pnpm --filter @workhard/server build
pnpm --filter @workhard/server exec tsx ../../scripts/github-browser-check.ts
```

The browser check uses production client assets, the real application routes and runtime, an in-memory database, and simulated GitHub responses. Playwright routes requests without opening a development server. It exercises frontend app configuration, OAuth redirects/cookies, tray interaction, filters, failed-page recovery, mobile and dark layouts, scrolling, reduced motion, access loss and disconnect. Screenshots go to `artifacts/github/`. This does not verify real GitHub consent, installation permissions, organization policies or token refresh against GitHub.

The PostgreSQL test creates its tables in a temporary schema inside a rolled-back transaction; it does not alter the live workspace. New artwork is generated in Blockbench 5.1.6, saved as three editable `.bbmodel` files and imported as twelve calibrated views:

```sh
node scripts/world-assets/blockbench/generate.mjs decor-pr-tray
node scripts/world-assets/blockbench/import.mjs decor-pr-tray
```

References: [GitHub user tokens and PKCE](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [token refresh](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens), [repository access](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user).
