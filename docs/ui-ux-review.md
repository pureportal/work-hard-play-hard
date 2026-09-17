# Application UI/UX review

Scope: all web-client views, sidebars, dialogs, embedded editors, notices, and the landing page. Existing uncommitted improvements were preserved and rechecked. No development servers were started or restarted. The duplicate migration snapshot was left untouched.

## Coverage ledger

The browser review uses the running client at `http://127.0.0.1:5173`. Authenticated workspace scenarios use an isolated in-memory `WorkspaceStore` and `WorldRuntime`, routed through Playwright. Individual component scenarios use the real client modules with isolated props and API responses. Neither establishes authenticated end-to-end coverage of the running backend.

| Surface | Review and verification |
| --- | --- |
| Sign-in and server selection | Real running application; light/dark, desktop, 390px, 320px, landscape |
| Registration, invitation, first-account setup, email-link sign-in | Component fixture: registration, setup, email-link form and sent state; invitation validation and submission errors in unit tests |
| Initial loading, connection error, retry, session expiry | Component fixture: loading and connection failure; retry and expired-session behavior in unit tests |
| Office canvas, navigation rail, top bar, floor selector, dock, zoom and placement controls | Workspace fixture; responsive layouts and theme support |
| People, expanded person, access controls, invite form, pending invites, search | Workspace fixture; narrow layouts and keyboard reveal of person actions |
| Messages, conversation tabs, attachments, composer, empty history | Workspace fixture and component tests |
| Meeting list, empty list, joining state | Workspace fixture and component tests |
| Full meeting, minimized meeting, chat, media settings, invitation controls | Component fixture; keyboard tabs and tablet breakpoint checks |
| Calls, proximity media, room knocks, meeting invitations, reactions | Component fixtures for notices and proximity controls; reaction source and component tests; no real media hardware |
| Organisation tree, unit create/edit/move, people/ranks, CEO promotion and removal votes | Workspace fixture and component tests; form actions and touch targets |
| Settings: Spotify, GitHub, branding/logo, registration/domains, kidnapping policies | Workspace fixture; grouped sections, scrolling and save actions |
| Personal build: shop, inventory, placed assets, daily reward, variants, rarity filters | Workspace fixture; earlier pass rechecked |
| Shared build: tools, catalog, floor materials, selected item, project toolbar | Workspace fixture; earlier pass rechecked |
| Room access inspector | Workspace fixture; player selector and room status list |
| Room settings: directory, room editor, assignments, access/build grants, preview | Component fixture and permission tests |
| Room defaults | Component fixture; narrow layouts and keyboard tabs |
| Funds: votes, proposal details/history, donations, shared inventory, transactions, settings | All five tabs in workspace fixtures; donation pending/error/retry and private/public separation in regression fixture; proposal operations in unit tests |
| Donation, sale, promotion and meeting-switch confirmations | Shared dialog source, focus tests and workspace scenarios |
| Avatar: all six appearance categories, motion, direction, randomize, saving/error | Workspace fixture and editor tests; compact preview controls |
| Object/player actions, doors, meeting entry, special props, floor navigation | Source and existing workspace regression scenarios |
| Checklist: items, progress, add/edit/remove, saving/error, stale draft, discard | Component fixture and tests; fixed header/footer and touch targets |
| Whiteboard: canvas, board, notes, card editor, images, stickers, history, conflicts, discard | Component fixture and tests; all view layouts, saved state and scrolling |
| PR tray: connection, repository picker, filters, refresh, pagination, empty/error | Component fixture and tests; shared header and scrolling body |
| Spotify song details, playback feedback, Jam invite | Component fixtures: song details, playback failure and invalid Jam URL; connection operations in unit tests |
| Falling Blocks: lobby, modes/settings, controls, pause, scores, results, exit | Game browser matrix and two-player fixture, including touch controls and results |
| Chess: lobby, setup/invitations, game, moves, promotion, draw, resign, results | Game browser matrix and two-player fixture, including locked invitations, clocks, promotion and draw decline/accept |
| Tic-Tac-Toe: lobby, Classic, Ultimate overview/focus, Stacking, rules, results, exit | Game browser matrix; Classic win and Stacking cover/move/reveal in two-player fixture |
| Deferred sidebar/dialog loading and failure | Component fixtures: both loading shells and recoverable failure states |
| Landing page | Source and static HTML/CSS fixture in both themes and four viewport sizes; landing service remains stopped |

## Improvements

- Shared dialog headers for avatar, checklists, whiteboards and PR tray, including disabled close actions while saving.
- Clearer settings sections and organization forms; consistent placement of cancel/create/save actions.
- Meeting chat remains reachable between 701px and 760px. Compact meeting controls wrap instead of shrinking below usable sizes.
- Keyboard navigation and a single tab stop for account and mobile meeting tabs; visible focus for textareas, links and summaries.
- Avatar motion and direction selectors leave space for appearance choices on narrow screens.
- Text empty states for messages and meetings; larger touch targets in work-object and music surfaces.
- PR tray keeps its header visible while its contents scroll; filters wrap into two columns on small screens.
- Whiteboards and minimized meetings share short screens without collapsing the editor. Whiteboard controls respond to the panel's width, including when another panel occupies part of the screen.

Previously changed build, room access, funds, confirmation, modal focus and sidebar headers were rechecked. The review did not identify a reason to change game rules, economy behavior or room access rules.

## Verification

- Client tests: **81 files, 752 tests passed**, including keyboard tab focus regressions. Existing jsdom canvas warnings remain in test output.
- Server regression tests: **11 files, 71 tests passed**, covering building, room boundaries/access, public economy, player assets, meetings, seating, permissions and work objects.
- Lint and all-workspace type checks passed. Client production build passed; Vite retains its large-chunk warning.
- Final application browser review: **368 layout/state captures, no detected overflow or browser errors**: 9 real unauthenticated, 108 workspace fixtures, 243 component fixtures and 8 static landing captures. The matrix covers desktop, 390px and 320px portrait, and 844px landscape in light and dark themes. Meeting chat also checked at 701px, 730px and 760px. Whiteboard editing beside a meeting additionally checked at 667×375 and 568×320.
- A separate component/static rerun passed **251 captures**. Bounds checks include dialog footers and meeting controls; screenshots were also inspected, since bounds checks alone do not prove usability.
- Game browser matrix: **230 captures** across seven viewport sizes and both themes, with no recorded issues. Additional two-player checks passed for Falling Blocks results, Classic wins, Stacking interactions, Chess invitations, clocks, promotion and draw responses.
- Object-action regression fixture passed: selecting an action dismisses the dialog immediately; rejected meeting and door requests restore it; retries succeed. Donation failure restores an actionable confirmation.
- Building/economy regressions passed: wall previews remain uncommitted drafts, private-room boundary removal is rejected without changing layout or balances, and public assets/refunds stay separate from private money. Server tests also cover private-room demolition/division, inherited access, stale spending approvals and forged free-building requests.

Browser scripts use Playwright with the locally installed Chromium against port 5173. Source-module requests include a cache key to avoid stale Vite transformations. No development servers were started or restarted.

Reports and screenshots:

- `artifacts/ui-review/results.json`: application, component and static landing scenarios, each labelled by data source.
- `artifacts/ui-review/components-results.json`: final component rerun.
- `artifacts/sidebar-dialog-review/results.json`: action recovery, keyboard/modal behavior, funds and wall regressions.
- `artifacts/ui-review-games/results.json`: game layout matrix.
- `artifacts/ui-review-game-interactions/results.json`: two-player commands and results.

The UI/browser scripts are `scripts/ui-review-browser-check.ts`, `scripts/sidebar-dialog-browser-check.ts`, `scripts/arcade-playwright-check.ts` and `scripts/arcade-interactions-playwright-check.ts`. The game scripts used `ARCADE_PRODUCTION=1`, serving built client assets through Playwright interception with an in-memory runtime.

## Limits and remaining verification

The real running application's unauthenticated sign-in and server picker were checked. Valid local credentials were unavailable, so authenticated browser scenarios used isolated data and intercepted API/WebSocket responses. These checks exercise real client components and, for workspace/game scenarios, the actual in-memory server domain implementation; they do not verify the running backend's authentication, persistence or transport.

External GitHub/Spotify OAuth, actual playback, camera/microphone/screen-sharing, native builds and deployment were not verified. The stopped landing service was not started; its static layout was reviewed separately. Organization mutations, whiteboard conflict/sticker edge cases, and some permission/error combinations have source and unit coverage rather than browser coverage of every combination. No known blocking layout issue remains within the tested matrix.
