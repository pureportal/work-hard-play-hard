Game presentation review — 2026-09-13

Falling Blocks, Chess, and all three Tic-Tac-Toe variants now share the application's light and dark surfaces, typography, violet controls, and restrained shading. Gameplay rules, commands, saved matches, and world placement data were not changed.

The review covered the game components, shared buttons and dialogs, avatar rendering, game equipment atlases, their source frames, and the running world. The actual cabinet and table artwork still has coarse outlines, noisy panels, and inconsistent directional proportions. The cleaner avatar source art and rendered portraits do not establish that the world artwork overhaul is complete.

Changes made:

- Unified game headers, dialog layering, panel colors, spacing, and action buttons. Game styles now live in focused stylesheets instead of separate theme overrides in the global stylesheet.
- Replaced Chess's platform-dependent font glyphs with six scalable, shaded SVG piece designs in ivory and plum. The same pieces appear in the board, promotion picker, and Chess mark. Move targets, selection, check, coordinates, and both board orientations remain intact.
- Refined Falling Blocks' palette, block shading, hold/next previews, statistics, and controls. The board sizes itself to the available content space, including exit prompts and results. Command buttons remain at least 40px in the reviewed layouts.
- Added the existing avatar portraits to Tic-Tac-Toe player rows. Classic and Ultimate marks use the same coral/violet colors as the Stacking pieces, with clearer active-board and selected-piece states. The small-phone Stacking layout keeps its reserve controls visible.
- Kept Chess's board and result actions visible together on desktop. Compact Chess content scrolls without overlapping player bars and actions. Rules remain behind the existing Rules control; no explanatory interface copy was added.

Both supplied endpoints responded with HTTP 200 before and after the review: the client at `http://127.0.0.1:5173` and the backend session endpoint at `http://127.0.0.1:3001/v1/auth/session`. No additional development servers were started.

Verification:

- Playwright exercised 1440×1000, 390×844, 320×568, and 844×390 in both themes. The production client was also reviewed through the same port 5173 URL, using route interception to serve the compiled files. The production review records 120 captures; the final compact-layout rerun adds explicit checks for overlapping Chess sections.
- Falling Blocks: lobby selection, solo controls by keyboard and buttons, hold/drop, pause/resume, cancel/confirm exit, multiplayer participation, and completed-round results. Active rounds were closed before switching games.
- Tic-Tac-Toe: bot replies in Classic, Ultimate, and Stacking; rules panels; forfeit; a two-player Classic win with its highlighted line; Stacking placement, covering, movement, and revealing the underlying piece.
- Chess: legal move selection, bot replies, close/reopen, resignation and replay, invitations, rapid clocks, both player orientations, promotion at all four sizes, touch promotion selection, and declining/accepting draws. SVG pieces and avatar portraits were visually inspected at their actual displayed sizes.
- All 323 client tests passed with `--maxWorkers=2`. The first unrestricted run had one timeout; that test passed individually and the complete run then passed. jsdom emits canvas implementation warnings; browser rendering was checked separately.
- `pnpm lint`, `pnpm typecheck`, `pnpm build:client`, `pnpm release:validate`, and `pnpm assets:world:check` passed. Asset validation covered 73 assets, 219 designs, and 876 directional frames. Final browser runs reported no page, console, or game-command errors.

The browser game tests use isolated `DemoStore`/`WorldRuntime` fixtures through intercepted HTTP and WebSocket traffic. They exercise the current client and server game implementations without changing existing workspace data. Live authentication, database persistence, actual backend multiplayer sessions, and native applications remain unverified. The existing 8×8 and 9×9 boards retain compact cells on narrow phones; this round does not add zoom or change gameplay interactions.

PixelLab was checked again before and after a 512px Pro edit of the Falling Blocks cabinet. It reports an active Pixel Artisan subscription, 31 generation units, $0 credits, and a reset date of 2026-10-12. The edit was refused with `no generations or credits remaining for editing an image`; the balance did not change. No regenerated raster artwork was accepted. The Falling Blocks cabinet and the Chess and Tic-Tac-Toe world tables still need an anime artwork pass. Their atlases, rotations, footprints, and placement behavior remain unchanged.

| View | Before | Updated |
| --- | --- | --- |
| Falling Blocks, desktop | [Before](../artifacts/game-presentation/before/1440x1000-light-falling-blocks.png) | [Updated](../artifacts/game-presentation/production/1440x1000-light-falling-blocks.png) |
| Chess, desktop | [Before](../artifacts/game-presentation/before/1440x1000-light-chess.png) | [Updated](../artifacts/game-presentation/production/1440x1000-light-chess.png) |
| Stacking, desktop | [Before](../artifacts/game-presentation/before/1440x1000-light-stacking.png) | [Updated](../artifacts/game-presentation/production/1440x1000-light-stacking.png) |
| Falling Blocks, phone | [Before](../artifacts/game-presentation/before/390x844-light-falling-blocks.png) | [Updated](../artifacts/game-presentation/production/390x844-light-falling-blocks.png) |
| Stacking, 320px phone | — | [Updated](../artifacts/game-presentation/production/320x568-light-stacking.png) |
| Chess, landscape dark | — | [Updated](../artifacts/game-presentation/production/844x390-dark-chess.png) |
| Chess promotion, 320px phone | — | [Updated](../artifacts/game-presentation/interactions/chess-promotion-320x568.png) |
| Chess draw response, phone | — | [Updated](../artifacts/game-presentation/interactions/chess-draw-mobile.png) |

Reproduce the browser checks against the existing client:

```powershell
pnpm --filter @workhard/server exec tsx ../../scripts/arcade-playwright-check.ts
pnpm --filter @workhard/server exec tsx ../../scripts/arcade-interactions-playwright-check.ts
```

Set `ARCADE_PRODUCTION=1` after building to inspect compiled files. `ARCADE_SCREENSHOTS` selects the output directory, and `ARCADE_VIEWPORTS=390x844,320x568` restricts the layout script to those sizes. Full results and screenshots are in [artifacts/game-presentation](../artifacts/game-presentation).
