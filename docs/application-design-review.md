# Application design review

Reviewed the web application on 13 September 2026 using the existing client at `http://127.0.0.1:5173` and backend at `http://127.0.0.1:3001`. No additional development servers were started. The checklist came from the implementation and navigation; earlier completion reports were not used as verification.

## Improvements

- Made authentication forms scroll correctly on short screens, including registration with the server controls expanded.
- Increased small text and control sizes across People, Settings, Messages, Meetings, Build, Shop, Inventory, and room settings. Improved spacing, wrapping, focus indicators, and dark-theme borders and error contrast.
- Put the invitation form inside the People panel's scrolling area and added a clear search-empty state.
- Made meeting tiles fill the available space, kept compact meeting headers from colliding with controls, and moved media errors away from participant portraits. Removed the redundant Live badge inside the meeting.
- Made the entire avatar editor content scroll on short phones, while keeping Save and Cancel accessible. Simplified the artwork failure presentation.
- Positioned selected-object menus within the scene's usable space, below the floor bar and above the dock, including after resizing. Nearby actions give way to an explicit object/player selection. Moved nearby panels below the floor controls.
- Moved the artwork error and Reload button out from behind the floor bar. Kept carrying controls and the dock inside narrow viewports.

World artwork, footprints, renderer geometry, collisions, gameplay rules, and server behavior were not changed. Existing 38×38 asset previews remain intact.

## Browser coverage

Playwright drove the actual application with Chromium/Edge. The main matrix was 1440×1000, 390×844, 320×568, and 844×390 in light and dark themes. Resizing a selected menu also exercised 300×538. Touch placement was checked in separate mobile contexts.

**Live** means real sign-in and requests to the running backend. Owner (Maya), admin (Leo), member (Jonas), and guest (Owen) were reviewed at desktop and 390px widths in both themes: 436 recorded captures. **Isolated** means the same running client with requests routed to an in-memory instance of the application's HTTP handlers and/or world runtime. This allowed configuration changes, invitations, messages, purchases, and failures to be exercised without changing shared data or contacting other people. Controlled event injection is identified below.

| Area | Inspected states and interactions | Environment |
| --- | --- | --- |
| Authentication | Sign-in/out; password visibility; invalid credentials; split/centered layouts; registration and invitation-code form; server disclosure and URL validation; registration disabled; loading/submitting; expired link; connection error and Retry; first-owner creation; email link/redemption; invitation registration producing a guest account | Live sign-in/out; isolated remaining flows. Account creation/redemption at desktop/390px; form/error layouts at four sizes |
| Workspace | Every navigation panel; Studio and Rooftop; floor selector; themes; avatar entry; availability/DND; zoom, pan, Follow; selected-player/object menus and resizing | Live four roles; isolated scene interactions |
| People | Online/offline rows; expanded details and available/disabled actions; search/no matches; invitation roles; create/revoke invitation; member role change; compact invitation scrolling | Live and isolated |
| Messages | Team, room, direct, and meeting tabs; empty threads; drafts/sends; long history; Jump to latest; keyboard tab navigation; image upload/pending/error; uploaded image and opening its browser tab; invalid file type | Live browsing/drafts; isolated sends/uploads |
| Meetings | Live/scheduled cards; empty list; joining; full/minimized windows; video/chat tabs; participant tiles; chat submission; camera-permission failure; reactions; switching confirmation/cancel; expand and leave | Live lists; isolated interactions |
| Calls and notifications | Outgoing/incoming/accepted calls, pending response, cancellation/end; knock acceptance/denial/pending; proximity group with extra-participant count; carrying/carried and stop; toast; camera denied; expired session | Isolated, with controlled events for call/knock/carry/session states |
| Settings | Role visibility; identity name/colors/layout controls; name-empty disabled save; save identity; logo upload/pending/remove/validation; registration defaults/toggles/domains/error/add/remove/save; kidnapping policies and allow/block lists | Live visibility; isolated changes |
| Build catalog | Every category; rarity filters/empty result; asset selection; keyboard/pointer variants; four rotations; placement preview/confirmation; selected asset move/rotate/remove | Live catalog; isolated mutations |
| Structural tools | Every tool; wall preview/creation; selected wall; door/window previews, insertion and selection; invalid window placement near a corner; removal and wall erasure; 32px coordinate assertions | Isolated desktop/390px, both themes |
| Rooms | Every live room disclosure; name/color/access controls; no-assignee validation and disabled save; assignee/knocking controls; save; player-asset placement setting | Live disclosure; isolated changes at four sizes |
| Personal build | Empty/populated inventory; every shop category; rarity/no matches; prices and purchase controls; daily claim/claimed; purchase, variants, four rotations, placement, removal, sitting/standing | Live member/guest browsing; isolated desktop/mobile/touch actions |
| Avatar | Six categories; gender/body options; four directions; idle/walk/randomize; keyboard categories; lower options reached by scrolling; save/cancel; save failure/retry; failed artwork, disabled Save and successful artwork retry | Live edits cancelled; isolated saves/errors |
| World scenes | Selected players/objects; top-edge/narrow resized menus; gong/ringing/cooldown; nearby selector; private door Knock/Waiting/Enter; seating/standing; floor portals and arrival on the destination floor | Isolated real scene interactions; controlled access/pending-knock data |
| Work boards | Empty/populated whiteboard/checklist; edit/save/complete/remove; unsaved close, Keep editing/Discard; saving/error; concurrent changes, Latest notes, Keep draft/Use latest; removed-board state; full checklist/recovery | Isolated; real two-user edits plus controlled failure/capacity/removal states |
| Falling Blocks | Solo/multiplayer lobbies; hold/drop/movement; pause/resume; exit/cancel; two-player result | Isolated game runtime; active games closed before subsequent static navigation |
| Tic-Tac-Toe | Classic/Ultimate/Stacking; bot play; turns/disabled cells; rules; exit/forfeit; Classic multiplayer win; Stacking covering/moving/uncovering | Isolated game runtime |
| Chess | Bot lobby/play/replies; multiplayer invitation setup/joining; clocks; selected squares/moves/captures; promotion at four sizes; draw offer/decline/accept/result; resign/result; close/resume/replay | Isolated game runtime with two players |

The game matrix samples meaningful interface states; it does not exhaust every legal position, terminal outcome, timeout, or draw-rule combination. No standalone spectator screen, Falling Blocks bot selector, or Chess color selector was exposed by the inspected navigation; these are not claimed as tested features.

## Evidence

Each suite stores screenshots and measurements in `artifacts/application-design-review/`. `results.json` describes the latest completed run; names distinguish role, viewport, theme, and state. Earlier failed attempts and temporary loading captures are not counted as successful coverage.

| Finding | Before | Revisited |
| --- | --- | --- |
| Short authentication form | [Registration/server](../artifacts/application-design-review/before/auth/320-light-registration-server.png) | [Top reachable](../artifacts/application-design-review/after/edges/320-light-registration-top.png), [Connect reachable](../artifacts/application-design-review/after/edges/320-light-registration-bottom.png) |
| Selected object behind floor controls | [Top-edge menu](../artifacts/application-design-review/before/world/320-light-top-selection.png) | [Positioned menu](../artifacts/application-design-review/after/world/320-light-top-selection.png) |
| Hidden artwork recovery | [Covered banner](../artifacts/application-design-review/before/edges/390-light-world-artwork-error.png) | [Visible Reload](../artifacts/application-design-review/after/edges/320-dark-world-artwork-error.png) |
| Dark room settings | [Small controls and dim error](../artifacts/application-design-review/before/rooms/1440-dark-room-fields.png) | [Updated controls](../artifacts/application-design-review/after/rooms/1440-dark-room-fields.png) |
| Meeting layout | [Desktop meeting](../artifacts/application-design-review/before/interactions/1440-light-meeting.png) | [Desktop grid](../artifacts/application-design-review/after/interactions/1440-light-meeting.png), [compact header](../artifacts/application-design-review/after/interactions/320-dark-meeting.png) |
| Nested states | [Work-board conflict](../artifacts/application-design-review/after/boards/320-dark-latest-notes.png) | [Gong controls](../artifacts/application-design-review/after/scenes/320-light-gong.png), [carrying controls](../artifacts/application-design-review/after/notices/320-light-carried.png) |

Additional scene evidence: [portal controls](../artifacts/application-design-review/after/portals/320-dark-portal.png), [destination arrival](../artifacts/application-design-review/after/portals/320-dark-arrived.png), [selected window](../artifacts/application-design-review/after/layout-tools/390-light-selected-window.png), and [300px resized controls](../artifacts/application-design-review/after/scenes/320-dark-player-actions-resized.png).

Reproducible scripts live in `scripts/application-review/`. Run one with `pnpm --filter @workhard/server exec tsx ../../scripts/application-review/<name>.ts`; comparison scripts use `REVIEW_PHASE=after`. They reuse the running client and do not listen on additional ports.

The existing Playwright game, multiplayer, world-asset, addition, and work-board scripts were also rerun. Output is under `after/arcade`, `after/multiplayer`, `after/build`, `artifacts/world-assets/additions/ui`, and `artifacts/work-features`.

## Verification

- Client tests: **324 passed**, across 47 files. The jsdom suite still emits its existing missing-canvas diagnostics; actual canvas rendering was exercised in Playwright.
- Repository lint and workspace type checks passed.
- Client production build passed.
- Final Playwright review suites completed with no recorded browser errors, blockers, or layout issues.
- Artwork validation passed: **74 assets, 222 designs, 888 directional frames**, counted by the current validator.
- Asset checks passed for 38px previews, 16px raster placement, four rotations, overlap rejection, move/remove, touch confirmation, and seating. Structural checks verified 32px wall coordinates.
- Reviewed state measurements showed no page-wide horizontal overflow. Selected-menu bounds, resized controls, authentication scroll reachability, and game/board dialog geometry received targeted checks.

## Limits

- Physical microphone/camera capture, multi-device WebRTC media, native desktop/Android shells, Safari/Firefox, and real device keyboards were not verified. Browser runs used Chromium and viewport/touch emulation.
- The separate landing service was stopped and was not started; its implementation was inspected, but its rendered pages were not reviewed in this run.
- Live authentication and role visibility were verified. Shared-server configuration writes, invitation/email delivery, purchases, and message persistence were exercised only with isolated data. External SMTP, remote custom servers, and persistence across a real backend restart remain unverified.
- Exceptional states were deliberately induced rather than waiting for organic failures: artwork/server failures, pending notifications, removed/full boards, and session expiry. Their presentation/recovery controls were inspected; this does not certify external-service behavior.
