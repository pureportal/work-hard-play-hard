Project review — 2026-09-13

The review inspected the current implementation, scripts, tests, dependency audit, and available runtime diagnostics before making changes. Existing workspace changes were preserved. No additional development servers were started.

Confirmed fixes:

- Seat interactions could bypass walls, room access, and room capacity because the final seating step checked distance alone. Direct seating and approach completion now require an unobstructed route within the same room boundaries. Movement into a room goes through the existing collision and access checks. Regression tests cover nearby and distant requests, permitted entry, full rooms, and a partition added during approach.
- Opening another connection reset the user's movement state. Existing keyboard movement and destination paths now continue; disconnecting the controlling connection still stops movement.
- Failed character atlases could leave an invisible avatar with only a console error. The existing artwork error and Reload flow now handles these failures and ignores failures belonging to superseded appearances.
- A missing preview canvas context left the creator blank with saving disabled. It now displays an error through the existing Retry flow. Saving becomes available only after a successful preview.
- At 568×320, Classic and Ultimate boards extended beyond the dialog and the Stacking board collapsed to its border. The compact landscape layout now covers this size. Boards use the content's remaining height, including when result buttons appear, and Stacking controls also remain visible in the completed 320×568 view.
- Production UI checks still expected wrapping asset categories and removed Falling Blocks effects. They now exercise every scrolling category and the actual line-clear fade. Tic-Tac-Toe checks detect collapsed cells and content hidden behind the result bar.
- The Playwright application fixture's custom close handler left browser sockets in `CLOSING`. It now acknowledges closure after disconnecting the runtime peer. The connection regression waits for synchronization and closure with bounded timeouts.
- The build dependency override updates tsup's esbuild from 0.27.7 to 0.28.2, addressing the Windows development-server traversal advisory. [esbuild advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr)

The path search now rejects unsuitable interaction destinations before performing collision and pathfinding work. This removes searches for candidates that cannot satisfy the interaction; no performance benchmark was taken.

Verification:

| Check | Result |
| --- | --- |
| `pnpm -r --workspace-concurrency=1 --if-present test --maxWorkers=2` | 332 client and 439 server tests passed, including 12 added regressions |
| `pnpm --filter @workhard/server test:database --maxWorkers=1` | 6 PostgreSQL tests passed using temporary tables and rolled-back transactions |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed; client rebuilt after the responsive game fix |
| Post-update focused client/server tests | 52 client and 18 server tests passed |
| `pnpm release:validate`, `pnpm assets:world:check` | Passed; 74 assets, 222 designs, 888 directional frames |
| `pnpm test:ui` | Production application and landing passed; game layouts also checked at 568×320 |

Playwright verified the changed access, connection, and character error/retry flows at 1440×1000 and 390×844. Character review covered 24 mixed appearances in four directions, creator save/reload/cancel in isolated state, idle/walk/sit frame sequences over time, four-direction movement, touch controls, and 24 seating cases across office chairs, stools, and benches. Carrying and reaction rendering used injected states. Artwork was visually inspected and retained. Evidence: [bug regressions](../artifacts/bug-review/browser/results.json), [character captures](../artifacts/bug-review/characters), [seating captures](../artifacts/bug-review/seats), [transition captures](../artifacts/characters/state-review/after/transitions).

Tic-Tac-Toe was inspected with Playwright in active and completed states at 1440×900, 320×568, 844×390, and 568×320. The production suite exercised actual move rules and verified completed boards, reserves, and result controls remain inside their visible containers. [Collapsed board before](../artifacts/bug-review/tic-before-Stacking-568.png), [active landscape after](../artifacts/bug-review/tic-after-Stacking-568.png), [completed landscape](../artifacts/tic-tac-toe-stacking-568.png), [completed portrait](../artifacts/tic-tac-toe-stacking-320.png).

Limits and remaining findings:

- The production dependency audit reported no advisories. The full audit still reports two high-severity advisories in Puppeteer's development-only `extract-zip` dependency, with no patched release listed. This dependency extracts browser downloads and is not used by application uploads. [Symlink target traversal](https://github.com/advisories/GHSA-jmr9-qjv8-65gv), [write through symlink entries](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3), [local audit](../artifacts/bug-review/final-audit.json).
- Front-facing seated artwork still reads close to standing without the furniture context; the side poses show the bent knees more clearly. Right-facing artwork remains mirrored. Source artwork was retained. [Front seated frames](../artifacts/bug-review/characters/sit-front-frames.png), [side seated frames](../artifacts/bug-review/characters/sit-left-frames.png).
- Unrestricted test concurrency produced three Stockfish timeouts. Those tests passed in isolation and in the complete suite with two workers. Existing jsdom canvas warnings remain; real browser rendering was checked separately.
- Two early mobile runs timed out while loading a second full page during movement. The final regression separates connection lifecycle checks from page loading; the exact cause of the earlier timeouts was not established.
- Live sign-in and creator inspection passed on desktop and mobile before and after the fixes, with drafts cancelled. Both supplied endpoints responded successfully, and backend readiness confirmed the database connection. Mutation and failure tests used isolated runtimes. Native applications, a controlled restart of the live database-backed service, prolonged network load, and a live two-person carry interaction were not verified. [Final live check](../artifacts/characters/state-review/after/live/results.json)
- Server logs showed the existing watcher restarting after the runtime edit, followed by a successful listen. Vite reported a transient refused connection during that restart. The final recent-log view still contained partial frontend socket stack traces without their error header; their cause remains unverified. Both processes remained running without reported crashes, and live flows passed. Passing checks do not establish that the project is bug-free or secure.

Logs, initial reproductions, and before/after evidence are in [artifacts/bug-review](../artifacts/bug-review). The focused browser regressions can be rerun with `pnpm --filter @workhard/server exec tsx ../../scripts/bug-review-playwright-check.ts` against the existing application.
