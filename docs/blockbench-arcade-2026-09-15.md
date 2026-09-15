# Arcade cabinet

Rebuilt the Arcade cabinet through Blockbench MCP in Blockbench 5.1.6: three editable models, twelve directional renders and three production atlases.

[Before/after gallery](../artifacts/blockbench-arcade-2026-09-15/index.html) · [Gameplay captures](../artifacts/blockbench-arcade-2026-09-15/after/live-world/gameplay-01.png)

## Changes

The previous textures loaded successfully. The artwork had large blank surfaces, a sparse screen and side walls that obscured the controls.

- Taller enclosed housing with a recessed CRT and space-game artwork.
- Compact control deck with a joystick, six colored buttons and start buttons.
- Framed marquee, roof emblem, side starfighter graphics, coin door and rear service panel.
- Graphite, White and Violet materials across South, West, North and East views.
- Refreshed the derived sign-in illustration.

Persistent geometry and materials live in [arcade-cabinet.cjs](../scripts/world-assets/blockbench/arcade-cabinet.cjs). The previous arcade geometry was removed from `equipment.cjs`; the existing generator now uses the new model. The native Graphite model is open in Blockbench for editing.

The 64 × 96 footprint, 24 solid cells and six-pixel render scale are preserved. Model geometry stays inside the footprint, and the ground projection matches the previous rendering in all rotations. Catalog entries, gameplay behavior and unrelated artwork metadata are unchanged.

## Verification

- [MCP generation](../artifacts/blockbench-arcade-2026-09-15/mcp-generation.json): 155 elements per model, complete texture references and geometry bounds inside the footprint.
- [Native reopen](../artifacts/blockbench-arcade-2026-09-15/native-roundtrip.json): all three saved models reopened with matching element and texture counts.
- [Running-game captures](../artifacts/blockbench-arcade-2026-09-15/after/live-world/coverage.json): all twelve views inspected at the default 0.78 zoom, with no artwork loading or browser errors. Full catalog views were also inspected.
- [Movement and selection](../artifacts/blockbench-arcade-2026-09-15/after/interactions/arcade-interactions.json): all four rotations selected successfully; sixteen approaches stopped 13–14.5 world units from the collision boundary. Reload passed.
- [Live placement](../artifacts/blockbench-arcade-2026-09-15/after/live-placement/live-placement-report.json): placement, four rotations and persistence passed against the running server. The temporary object was removed and existing objects were preserved.
- [Scope and alignment](../artifacts/blockbench-arcade-2026-09-15/verification.json): catalog and unrelated metadata unchanged; calibrated footprints preserved.
- `pnpm assets:world:check`: 87 catalog assets, 261 materials and 1,404 frames passed, plus three architecture assets and twelve frames.
- Asset regression tests: 27 client tests and 32 server tests passed across nine files.
- `pnpm lint`, client build/typecheck and the final production bundle passed.
- Before/after gallery controls and the gameplay-size toggle passed Playwright checks.

No development servers were started. Browser verification used Chromium; other browser engines were not tested.

The backend stopped accepting connections after the live placement checks had completed. A later sign-in recheck received HTTP 502 from the client proxy, so the refreshed sign-in illustration was inspected as a local image; its final sign-in-page display could not be verified.
