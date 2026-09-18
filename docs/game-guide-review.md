# Game guide review — September 18, 2026

## Automatic startup follow-up

The guide now starts automatically the first time a player is ready to play. The invitation was removed. Every tooltip has a visible Skip button, and the loading state also offers Skip guide. Escape and overlay dismissal still work, and How to play replays the guide.

Startup waits for the existing connection, activity, editing, and panel checks. The attempt is remembered per server and player in this browser when it starts, so skipping, completion, an interrupted connection, or a missing target does not repeatedly reopen it. Previously remembered visits remain remembered. Clearing browser storage or using another browser permits automatic startup again.

Startup is scheduled after rendering and canceled when unavailable or unmounted. Guards prevent duplicate starts from React Strict Mode or a simultaneous manual start. Changing the player or server resets the component's session state. Unmounting aborts pending target work and ignores late tour events. Guide storage failures are logged without blocking play; the attempt is still remembered for the mounted session, but cannot be retained across reloads when storage cannot be written.

### Verification for this follow-up

- Added ten lifecycle cases covering automatic startup, Strict Mode, deferred availability, disconnect/reconnect, canceled startup, manual-start races, player/server isolation, storage failures, missing targets, and replay. Together with step-selection tests, all 17 guide tests pass.
- Updated existing Workspace test fixtures to represent players who have already seen the guide. The wider App/Workspace/guide run passed 94 of 96 cases; the avatar and registration-panel lookup failures both passed on focused reruns. Existing jsdom canvas warnings remain in the meeting tests.
- Client production build, TypeScript check, scoped lint, and tracked-file whitespace checks pass. The existing large-chunk warning remains. The earlier shop-price failure was not rerun in this follow-up.
- The Playwright startup checks directly passed delayed realtime connection, disconnect during the guide, no automatic restart after reconnect, replay after reconnect, guide storage read/write failures, and skipping during initial target loading followed by reload and replay. No browser errors occurred in those checks.
- A complete fresh Playwright run passed all nine scenarios listed below, now starting without clicking an invitation, plus all recovery and startup checks. It verified remembered completion and skipping, replay, keyboard/touch claims, target placement, both themes, portrait/landscape, CEO/restricted access, empty floors, screen restoration, resizing, and missing-target recovery. The final run reported no browser errors or unintended game commands. Fresh desktop, mobile, and landscape screenshots were visually inspected. An earlier run timed out at a mobile transition while work was still ongoing; the complete run with stable source passed that check.

Results are recorded in `artifacts/guide/results.json`, with screenshots alongside it. The startup checks can also be run alone with `pnpm --filter @workhard/server exec tsx ../../scripts/guide-browser-check.ts startup`.

The browser checks continue to use the running Vite client and isolated real-server fixtures. No development servers were started or persisted player data changed. Native webviews, physical devices, other browser engines, and cross-device persistence remain outside this verification.

## Previous improvement pass

This second pass reviewed the previous report, reread the guide and mechanics, reran the original Playwright checks, and inspected fresh game screenshots. The original checks passed, but additional keyboard and overlap checks exposed issues they did not cover.

## Improvements

- Fixed keyboard claiming: Tab and Shift+Tab cycle through Claim and the tooltip controls. Previously focus stayed trapped away from the action the guide described. Claim remains optional, and the copy updates afterward. The interactive step no longer declares a modal that excludes the external Claim button.
- Combined the repeated room-call steps. The usual tour has seven steps: coins, daily bonus, items, approvals, shared rooms, a room call, and movement. Restricted rooms add an explanation; empty floors have five steps.
- Attached the call step to an accessible room's Start/Join button and named the room in the tooltip. The previous placement covered Start in landscape.
- Tightened the wallet highlight to the coin amount instead of the full header width, which caused overlap at 667 × 375.
- Moved progress into the footer and reduced short-screen padding, removing overlap with item tabs in landscape. Mobile and touch tooltip buttons have 44px minimum targets.
- Shortened repeated navigation and room copy. Explained the daily bonus ceiling, distinguished entering from building access, included tap-to-move, and gave empty floors useful placement guidance.
- Preserved the optional invitation, dismissal, replay, and restoration of the previous panel. No gameplay mechanics changed.

## Mechanics checked

- `packages/shared/src/economy.ts`, `EconomyStore`, and game handlers/tests: completed Falling Blocks rounds and human multiplayer Tic-Tac-Toe award coins within a shared 100-coin daily cap. Bot Tic-Tac-Toe does not award coins. Daily bonuses are separate, reset at midnight UTC, grow to 50 coins, and lose the streak after a missed day.
- `PublicEconomyStore` and `SpendingProposals`: proposals require a majority of their electorate, then a separate Apply action. Construction charges the shared fund; CEO status does not make it free.
- `PlayerBuildPanel` and room permission helpers: purchases enter inventory; placement needs building access or the player's personal area. Temporary entry grants do not grant building access. CEOs only enter restricted rooms when the room rules grant access.
- Starting-house data, room meetings, and nearby interactions: room calls use Meetings and relocate the player when opened; shared rooms support nearby chats/calls. The guide itself does not start calls or move players.

## Direct Playwright verification

```sh
pnpm --filter @workhard/server exec tsx ../../scripts/guide-browser-check.ts
```

The check uses installed Edge through the workspace's `playwright-core`, the already-running Vite client at `127.0.0.1:5173`, and isolated instances of the real server store/runtime through intercepted authentication, bootstrap, and WebSocket routes. No servers were started and no persisted player data was changed. Screenshots and JSON results are in `artifacts/guide/`.

| Scenario | Viewport | Additional coverage |
| --- | --- | --- |
| Desktop, light | 1440 × 1000 | Pending proposal, backward navigation through every step, keyboard claim |
| Desktop, dark | 1440 × 1000 | Full tour in dark theme |
| Mobile, light | 390 × 844 | Touch progression and daily claim |
| Mobile, dark | 390 × 844 | Touch progression, already-claimed bonus |
| Restricted player | 360 × 640 | Restricted rooms/building, room-access step, omitted call step |
| CEO, light landscape | 844 × 390 | Explicit CEO room grants, hierarchical mode, touch progression |
| Mobile, dark landscape | 667 × 375 | Touch progression/claim, tight highlight and tooltip spacing |
| Restricted CEO | 1440 × 1000 | CEO cannot bypass room access; inaccessible call omitted |
| Empty floor | 1440 × 1000 | Five applicable steps, no room targets, appropriate placement copy |

Checks cover exact step order, forward/back navigation, target visibility and viewport intersection, spotlight alignment, tooltip bounds and horizontal text overflow, keyboard focus in both directions, and unobscured wallet/daily/assets/call controls. Touch scenarios use Playwright tap input. Fresh screenshots were visually inspected in both themes, portrait, and landscape.

Every scenario checks completion, replay after reload, remembered invitation state, close-button dismissal, Escape from the map and a dialog, overlay dismissal, and return to the original map. Command/balance assertions detect unintended movement, building, spending, votes, or calls; deliberate claims credit exactly 10 coins.

Recovery checks cover dismissed invitations, active building tools, restoration of the previous Shared build view after completion and dismissal, cancellation while loading, missing-target errors, replay after recovery, and portrait/landscape resizing during the daily step.

## Project checks and limits

- Client production build and TypeScript check pass. The build retains the existing large world-asset chunk warning.
- Scoped lint and whitespace checks pass.
- Focused guide, Meetings panel, and room-permission editor suites: 12 tests pass.
- Server economy, public-economy, and game-reward suites: 32 tests pass.
- The combined client regression run passed 74 of 76 tests. One meeting-entry test failed in that run; all 33 meeting-entry tests passed when rerun alone with the same 15-second timeout.
- The remaining reproducible client failure is the previously reported `PlayerBuildPanel` shop-price assertion: it expects “Need 850 more coins for Crystal floor lamp”; the working-tree catalog produces “Need 1400 more coins”. This pass does not change prices or the assertion.
- The live, unmodified service was also opened with Playwright and showed sign-in. Authenticated game checks therefore use isolated server fixtures rather than a persisted account. Native webviews, physical mobile devices, screen-reader behavior, and other browser engines were not exercised.
- The packaged browser-tool launcher could not resolve its own `playwright-core`; running Playwright directly from this workspace worked and supplied the browser evidence above.
