# Chess, Falling Blocks and celebration gong

Recreated the three requested assets through the connected Blockbench MCP in Blockbench 5.1.6. Nine editable models produce 36 transparent directional renders and nine production atlases.

[Before/after gallery](../artifacts/blockbench-games-2026-09-15/index.html) · [Gameplay overview](../artifacts/blockbench-games-2026-09-15/after/live-world/gameplay-01.png) · [Individual scores](../artifacts/blockbench-games-2026-09-15/scorecard.json)

## Changes

| Asset | Rebuild | Footprint | Initial score | Final score |
| --- | --- | --- | --- | --- |
| Chess table | Distinct sculpted pieces, a complete set in an opening position, inlaid board, walnut legs and lacquer aprons | 96 × 96 | 6–6.5 | 8.5 |
| Falling Blocks table | Cocktail cabinet, framed playfield, colored pieces, preview panel, joystick, buttons and side grilles | 96 × 112 | 5.5–6 | 8.5 |
| Celebration gong | Diagonal braced stand, shaped bronze rim and boss, suspension cords, mallet and tassel | 80 × 80 | 2.5–6 | 8.5 |

The original gong became almost invisible from the west and east. Its stand now sits diagonally inside the same square footprint, so the bronze face remains visible in every cardinal view. This was an artwork issue; no loading repair was needed.

All assets retain Graphite, White and Violet materials and South/West/North/East rotations. Catalog definitions, collisions, interaction ranges and gameplay behavior are unchanged. The six-pixel render scale and ground projection are unchanged. Geometry stays inside each original footprint.

Persistent geometry lives in [game-tables.cjs](../scripts/world-assets/blockbench/game-tables.cjs) and [celebration-gong.cjs](../scripts/world-assets/blockbench/celebration-gong.cjs), integrated into the existing generator. The old geometry was removed. Native models are in `scripts/world-assets/blockbench/models/`; the rendering manifest and client atlas metadata were updated for these three assets only.

## Visual review

Reviewed all 36 replacements individually in screenshot crops from the running game at its default 0.78 zoom, plus the full-size catalog views. Ratings consider appeal, clarity, style, proportions and visible defects. The [scorecard](../artifacts/blockbench-games-2026-09-15/scorecard.json) records each material and rotation, its initial issue, final assessment and before/after evidence. Scores are visual judgments.

The chess pieces and board remain distinct at gameplay size. Falling Blocks has a recognizable control deck and finished side panels. The gong has a readable bronze face and grounded stand in every direction. No missing textures, clipped exports or frame-selection defects were observed. All 36 requested views are validated.

## Verification

- **Native generation:** [MCP generation record](../artifacts/blockbench-games-2026-09-15/mcp-generation.json): nine models, 36 renders, all faces textured and geometry inside the original footprints.
- **Model reopen:** [Native round-trip record](../artifacts/blockbench-games-2026-09-15/native-roundtrip.json): all nine saved models reopened through MCP with identical element counts, complete texture references and the gong's diagonal transform intact.
- **Running game:** [36-view capture record](../artifacts/blockbench-games-2026-09-15/after/live-world/coverage.json), with no browser or artwork loading errors. These captures use the running client with isolated review data.
- **Live server:** Each asset passed placement, selection, four rotations and reload through `playwright-live-check.mjs`. Temporary objects were removed; existing objects were preserved. Records are in `after/live-chess`, `after/live-falling-blocks` and `after/live-gong` under the gallery directory.
- **Scope and alignment:** [Verification record](../artifacts/blockbench-games-2026-09-15/verification.json): catalog unchanged, unrelated artwork metadata unchanged, nine new atlases, unchanged footprint dimensions and grounded geometry.
- **Artwork validation:** `pnpm assets:world:check` passed for 87 catalog assets / 261 materials / 1,404 frames and the three architecture assets / 12 frames.
- **Asset regression tests:** 27 client tests and 32 server tests passed across nine test files.
- **Lint:** `pnpm lint` passed.
- **Client build and typecheck:** `pnpm --filter @workhard/client build` passed. Standalone production bundling also passed.

No development server was started.

## Verification limit

Browser verification used Chromium; other browser engines were not tested. No requested asset views remain unvalidated.
