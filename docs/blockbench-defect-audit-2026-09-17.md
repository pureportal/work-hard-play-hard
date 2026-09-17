# Desktop prop asset audit

Reviewed the default finish of all 295 catalogue assets from the front and side, then rebuilt eight desktop props in Blockbench 5.1.6. Each redesign retains its catalogue ID, placement footprint, price and three finishes.

| Asset | Defect addressed | Redesign |
| --- | --- | --- |
| Laptop | Display disconnected from the base; sparse keys and compressed screen | Connected hinges, tilted display, larger screen, complete keyboard and trackpad |
| Headphone stand | Stem stopped below the headband | Fitted cradle, connected ear-cup yokes and smaller round base |
| Globe | Flat continent blobs protruded from the sphere | Land shapes follow the sphere, with a tilted axis and supported meridian |
| Hourglass | Solid blue bulbs and broad top cap concealed the sand | Glass contours, open crown and visible sand reservoirs and stream |
| Tea set | Handle lay in the wrong plane and appeared detached | Connected loop handle, curved open spout, hollow cups and handles |
| Origami cranes | Separate triangles lacked a coherent folded body | Connected bodies, folded wings, necks, beaks and tails |
| Model sailboat | Floating hull and sails that vanished in side views | Display cradles, tapered hull, inset deck and bowed sails |
| Desk fan | Flat guard and blades lacked a convincing support and motor | Motor, axle, support yoke and a guard with depth |

The persistent geometry is in `tabletop-electronics.cjs` and `tabletop-ornaments.cjs`. Superseded builders were removed from `objects.cjs` and `expansion/decor.cjs`. The generated files include 24 editable `.bbmodel` models, 96 directional renders, 24 PNG atlases and their lossless WebP delivery files and previews.

## Review and verification

- Reopened all 24 saved models in Blockbench and checked textured faces, finite geometry, placement bounds, surface contact and the redesigned part connections. Contact checks use bounding-box overlap; the rendered views were also inspected.
- Captured all 96 finish/rotation combinations through the running game's renderer at its normal 0.78 zoom.
- Checked purchase, all three finish previews, placement, four rotations, movement and storage in a separate isolated personal-room fixture for each asset.
- `pnpm assets:world:check` passed for the complete catalogue, architecture and seating artwork.
- `pnpm assets:optimize:check` passed for all 1,823 source images and their delivery copies and previews.
- All 30 focused client tests passed for artwork, placement, textures and orientation. Source lint and whitespace checks passed.
- Compared all 885 original catalogue atlas hashes: exactly the 24 intended atlases changed. Catalogue data and other artwork entries are unchanged, including the previously redesigned monitor.

The placement fixture uses an enclosed room owned by the test player so the current direct-placement flow applies. Browser requests use an isolated in-memory workspace; no live purchases or placements are made. No development servers were started.

The desktop Blockbench connection stopped responding, so generation and model reopening used the project's Blockbench web pipeline. Gameplay checks used Chromium; the native game applications and other browser engines were not tested. The catalogue overview is a front/side inspection of the default finishes, not an exhaustive review of every finish and animation frame outside the eight redesigned assets.

## Evidence

- [Before and after](../artifacts/blockbench-defect-audit-2026-09-17/before-after.png)
- [Review gallery](../artifacts/blockbench-defect-audit-2026-09-17/index.html)
- [Catalogue overview sheets](../artifacts/blockbench-defect-audit-2026-09-17/overview/)
- [Blockbench model checks](../artifacts/blockbench-defect-audit-2026-09-17/roundtrip.json)
- [Gameplay coverage](../artifacts/blockbench-defect-audit-2026-09-17/after/gameplay/coverage.json)
- [Scope verification](../artifacts/blockbench-defect-audit-2026-09-17/scope.json)
- [Verification summary](../artifacts/blockbench-defect-audit-2026-09-17/verification.json)
