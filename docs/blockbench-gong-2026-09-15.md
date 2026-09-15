# Celebration gong

Recreated the gong through Blockbench MCP with front, side, back and opposite-side views. The previous model had a fixed 45° yaw, making every rotation diagonal. That transform is removed.

[Before/after gallery](../artifacts/blockbench-gong-2026-09-15/index.html) · [Gameplay-size views](../artifacts/blockbench-gong-2026-09-15/after/live-world/gameplay-01.png)

## Changes

- A hollow bronze bowl with a raised front striking boss and a recessed back.
- A narrower crossbeam, visible suspension cords, braced runners, mallet and tassel.
- Graphite, White and Violet models, with four cardinal renders each.
- The original 80 × 80 footprint, 25 solid cells and six-pixel render scale are preserved.

The source is [celebration-gong.cjs](../scripts/world-assets/blockbench/celebration-gong.cjs). Three editable models, twelve renders, three production atlases and the gong's artwork metadata were regenerated. Catalog definitions and unrelated artwork are unchanged. This replaces the diagonal gong described in the earlier [games rebuild](blockbench-games-2026-09-15.md).

## Verification

| Check | Result |
| --- | --- |
| [MCP generation](../artifacts/blockbench-gong-2026-09-15/mcp-generation.json) | Three models, 80 elements each, complete texture coverage, zero group rotation and geometry inside the footprint |
| [Native reopen](../artifacts/blockbench-gong-2026-09-15/native-roundtrip.json) | All three saved models reopen with matching element counts and cardinal orientation |
| [Running client](../artifacts/blockbench-gong-2026-09-15/after/live-world/coverage.json) | All twelve views captured and visually inspected at the default 0.78 zoom; no artwork loading or browser errors |
| [Selection and collisions](../artifacts/blockbench-gong-2026-09-15/after/interactions/gong-interactions.json) | Four rotations selected, sixteen movement approaches blocked at the existing footprint, reload passed |
| [Live placement](../artifacts/blockbench-gong-2026-09-15/after/live-placement/live-placement-report.json) | Placement, four rotations and persistence passed against the running server; the temporary object was removed |
| [Scope and alignment](../artifacts/blockbench-gong-2026-09-15/verification.json) | Only three gong atlases changed; catalog, other artwork and projected footprints match the baseline |
| Artwork validation | 87 assets, 261 materials and 1,404 frames passed; architecture validation also passed |
| Asset regression tests | 27 client tests and 32 server tests passed |
| Build | Lint, client typecheck and production build passed |
| [Gallery](../artifacts/blockbench-gong-2026-09-15/gallery-check.json) | Images, before/after controls and gameplay-size toggle passed |

One catalog test initially exceeded its five-second limit while concurrent checks were running; it passed unchanged on an isolated rerun. The collision review was adjusted to wait for camera movement to finish and click clear floor beyond the tall side-view artwork. The final review passed.

Blockbench paused during an export while minimized. Restoring the editor allowed the export to finish; the final files were imported and independently reopened afterward. No development servers were started.

Browser verification used Chromium. Other browser engines were not tested.
