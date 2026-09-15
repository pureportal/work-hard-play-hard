# Blockbench asset audit — September 15, 2026

The subsequent [visual refinement audit](blockbench-visual-refinement-2026-09-15.md) checks this report, replaces the old sign-in illustration, removes obsolete character metadata, and refines arcade and avatar rendering. Its wider inventory includes artwork outside the public catalog directories.

Catalog coverage was complete, but the world migration still had gaps. The audit compared source models, exported files, loaded textures and actual game interactions.

## Findings and changes

| Inventory | Result |
| --- | --- |
| 81 catalog assets, 243 atlases, 972 views | Artwork existed and loaded. Every native model face has a material. |
| Walls, doors and windows | Previously drawn as flat primitives with no artwork. Created three native Blockbench designs, atlases and 12 views. |
| 120 character component atlases | Present; frame coverage, clipping and mixed composition checks passed. |

The new architecture uses cream plaster, oak molding, brass thresholds and pastel glass. Walls and windows retain their collision thickness; open thresholds remain walkable. No missing texture requests or decode failures were found in the audited catalog. Several apparent artwork problems came from rendering and placement instead:

- East and west exports used the opposite rotation from the shared footprints. Corrected native Y rotation and regenerated all 81 assets. Corner desk and sofa openings now match their empty grid cells in every view.
- Decorations appeared at floor height. Exported supporting surface heights and applied them to artwork, previews and pointer placement. Selection and erasing now hit visible pixels above the footprint.
- The arc lamp had a disconnected stem and blocked its entire overhead reach. Rebuilt the continuous arch and aligned its physical collision cells with the base, retaining placement clearance beneath the canopy.
- Clamped cubby book heights to stop shelf clipping. Reworked the drafting desk into a clear, flat drawing surface with paper and ruler details.

The approved shoji screen, tea cart and sakura planter keep their geometry, materials and calibrated ground scale. Directional exports changed with the shared correction. The 16-unit placement grid, 32-unit structural grid and six source pixels per world unit remain unchanged.

## Verification

- Validated all 984 furniture/architecture views: model provenance, textured faces, material coverage, dimensions, ground calibration and transparent borders. Pixel sampling checks the rotated corner holes and lamp base against actual footprint cells.
- Captured all 81 catalog assets in all four rotations inside the game, plus every material at actual world scale. Reviewed the final drafting desk in all 12 material/direction combinations.
- Used real pointer movement and keyboard input to enter each rotated corner-desk opening, walk under each lamp canopy and collide with each base. Tested horizontal/vertical walls and windows blocking movement, door traversal, selection, both themes and reload.
- Placed, selected and reloaded a laptop in all four rotations on a desk; duplicate placement was rejected. Erasing the elevated artwork removed the laptop and preserved its desk.
- Rechecked Build, Shop and Inventory at desktop and three mobile viewport sizes, including touch purchase/placement, moving, rotation and removal. Rechecked office chair, corner sofa and stool seating in four rotations on desktop/mobile: 24 cases.
- The real running server accepted a temporary lamp, preserved all four rotation positions on the grid and returned the saved object after browser reload. The lamp was removed afterward and all original objects were preserved.
- Passed artwork validation, workspace lint/typechecks, client production build, 95 focused client tests, 27 placement/runtime server tests and two character-atlas tests.

Browser checks reused the client on port 5173 and server on port 3001. Collision and exhaustive catalog scenarios used the existing isolated in-memory runtime fixture; the temporary lamp save/reload used the real API and WebSocket connection. No development processes were started.

### Evidence

[Live placement/reload report](../artifacts/blockbench-audit/live-placement-report.json) · [Catalog and interaction report](../artifacts/blockbench-audit/browser-report.json) · [Rotated catalog](../artifacts/blockbench-audit/world-catalog-1-90.png) · [Tabletop selection](../artifacts/blockbench-audit/supported-selected-270.png) · [Architecture](../artifacts/blockbench-audit/architecture-vertical.png) · [Seating](../artifacts/blockbench-audit/seating/seating-contact-sheet.png)

### Repeatable checks

Run from the workspace root with the existing frontend/server running:

```sh
pnpm assets:world:check
pnpm assets:world:ui
node scripts/world-assets/blockbench/playwright-review.mjs --catalog
pnpm --filter @workhard/server exec tsx ../../scripts/world-assets/blockbench/playwright-audit.ts
pnpm --filter @workhard/server exec tsx ../../scripts/world-assets/blockbench/playwright-audit.ts --architecture
node scripts/world-assets/blockbench/playwright-live-check.mjs
```

The audit also accepts `--interactions` or `--decorations` to rerun those checks while retaining unrelated catalog/architecture results. The live check uses the existing Maya demo account and removes its temporary object in cleanup.

## Limits

No missing artwork remains in the audited inventory. Browser verification used Chromium, including emulated touch layouts; native mobile/WebKit behavior and physical-device performance were not tested. Browser reload verified server-held placement, not durability across a server or database restart. The running services were not restarted. Every catalog view was captured, but not every possible arrangement of overlapping objects or avatar appearance was visually reviewed.
