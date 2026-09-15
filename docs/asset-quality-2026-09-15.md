# Game asset quality audit

**437 of 437 current asset files visually validated. Every final score is at least 8/10. No assets remain unvalidated.**

- [Searchable scorecard and visual index](../artifacts/asset-quality-2026-09-15/index.html)
- [Complete CSV scorecard](../artifacts/asset-quality-2026-09-15/scorecard.csv)
- [Full review record, source hashes and evidence](../artifacts/asset-quality-2026-09-15/scorecard.json)

## Inventory and coverage

The inventory was rebuilt from the current catalog, artwork manifests, character options and files on disk. Every public asset and every image in the client asset directory is accounted for. Initial and final inventories have identical asset IDs and customization options.

| Family | Current inventory | Visual coverage | Final scores |
|---|---:|---|---:|
| World objects | 87 assets, 261 designs | Every design at 0°, 90°, 180° and 270° in the running game | 8–8.5 |
| Architecture | Wall, door and window; plaster | All 12 stored views; connected layouts in both gameplay orientations and themes | 8–8.5 |
| Characters | 172 layer atlases | Every layer, all four directions and all 128 frames per atlas | 8–8.5 |
| Office illustration | 1 | Actual sign-in page | 8.5 |

Character coverage includes 112 hair/headwear atlases, 12 gender/face atlases, and 16 each for upper clothing, lower clothing and shoes. The review covers all current options; removed options were not restored.

The 140 composed character sheets cover all 22,016 source-layer frames: idle, walk, sit, listen and sit-listen. Each composition was also exercised inside the actual game in all four directions, producing 560 additional game captures. World verification produced 1,044 design/direction captures and 132 full scene screenshots.

Wind chimes and pinwheels were inspected through all 16 native animation frames for every design and direction. Recorded playback confirmed every frame appeared. Pools, fountains and koi ponds were reviewed at eight animation times for every design and direction, with additional gameplay motion and reduced-motion checks.

## Scoring

Every initial and final review used the same five criteria: visual appeal, clarity, style consistency, proportions, and visible defects. Scores are visual judgments, not automated quality measurements.

- **0–4:** broken appearance, severe seams or unclear artwork.
- **5–6.5:** recognizable but unfinished, poorly shaped or visually noisy.
- **7–7.5:** usable, with visible issues requiring another pass.
- **8–8.5:** clear, coherent and appealing at gameplay scale, with intact textures, silhouettes and joins.
- **9–10:** exceptional polish beyond the acceptance threshold.

Scores use normal zoom **0.78**, the existing **16-unit grid**, and **62.4-pixel character frames**. Every directional view was reviewed; each design's score reflects its weakest view. The CSV and JSON include the initial reason, changes, final reason and exact evidence for each file.

## Changes

Recreated **81 catalog assets across all 243 designs**, plus the plaster wall: **244 native Blockbench models**. The six catalog assets that already passed retained their native artwork. Their atlases were repacked along with the rest of the catalog. The passing character models and atlases remained byte-for-byte unchanged.

- Furniture now has softer upholstery, fitted cushions, finished rims, grain, joinery and clearer supports.
- Plants have proportionate glazed pots, visible soil, clearer leaf shapes and less mechanical flower arrangements.
- Storage, appliances and desktop props have finished side/rear surfaces and clearer small details.
- The arcade cabinet has continuous side panels closing the exposed housing.
- Lamps have clearer stems, shades, bases and crystal facets.
- Floors and rugs have rebuilt patterns and clean adjacent edges.
- The office illustration was regenerated from the resulting assets.

The first botanical replacements still failed for the garden bed, bonsai, monstera and topiary. Their intermediate scores and screenshots are retained in the scorecard. They were rebuilt again and passed the final game review. The arc lamp's recreated foot also failed footprint calibration; its native geometry was corrected and re-exported before the final checks.

All artwork changes used the established native Blockbench generation, model export and atlas import workflow. Catalog footprints, grid size, supported directions, seating/surface anchors, animation timing and gameplay definitions were preserved.

## Rendering defects

The audit distinguished valid files from poor rendering. Both initial and final browser sweeps decoded all 436 public atlases and matched the served bytes to disk. Native face checks found no missing material references.

The apparent defects had two main causes:

1. **Artwork:** unfinished geometry, overly flat surfaces, tangled or repetitive plants, and exposed arcade side cavities.
2. **Sampling and crop edges:** transparent floor edges and fine details lost when large atlas frames were reduced to gameplay size.

The renderer now generates mipmaps for minification. Ground artwork fills its exact calibrated crop, and copied edge gutters keep transparent atlas spacing out of reduced tile edges. Wall backing and trim extend beyond the crop so adjacent segments join continuously. The artwork checker now rejects transparent rectangular floor pixels and incorrect edge gutters.

## Repeated floors

Every floor and rug design was inspected individually and in adjacent repeated fields in all four directions. The final in-game fields contain 12–30 adjacent tiles or rugs, depending on footprint and orientation. Seams, repetition, pattern alignment and appearance at normal zoom all pass.

| Type | Initial | Final | Evidence |
|---|---:|---:|---|
| Wood | 4 | 8.5 | [Before](../artifacts/asset-quality-2026-09-15/before/floor-floor-tile-wood.png) · [Game field](../artifacts/asset-quality-2026-09-15/after/live-floors/floor-tile-wood.png) |
| Stone | 3 | 8 | [Before](../artifacts/asset-quality-2026-09-15/before/floor-floor-tile-stone.png) · [Game field](../artifacts/asset-quality-2026-09-15/after/live-floors/floor-tile-stone.png) |
| Grass | 5 | 8 | [Before](../artifacts/asset-quality-2026-09-15/before/floor-floor-tile-grass.png) · [Game field](../artifacts/asset-quality-2026-09-15/after/live-floors/floor-tile-grass.png) |
| Woven rug, all 3 designs | 6 | 8 | [All repeated layouts](../artifacts/asset-quality-2026-09-15/index.html#floors) |
| Round rug, all 3 designs | 5.5 | 8 | [All repeated layouts](../artifacts/asset-quality-2026-09-15/index.html#floors) |
| Tatami, all 3 designs | 5.5 | 8.5 | [All repeated layouts](../artifacts/asset-quality-2026-09-15/index.html#floors) |

The round rugs preserve their circular footprint; the spaces between neighboring circles are intentional.

## Verification

All browser work used the existing client at `127.0.0.1:5173`. The live persistence check used the existing server at `127.0.0.1:3001`. No development servers were started. Exhaustive visual layouts used isolated browser fixtures and the production game renderer; they did not replace the user's saved layout.

| Check | Result |
|---|---|
| World native artwork, atlas frames and calibrated footprints | Passed: 87 assets, 261 designs, 1,404 frames |
| Architecture artwork | Passed: 3 models, 12 frames |
| Native character models | Passed: all 172 models checked; 15 reopened in Blockbench with all five animation loops |
| Complete served inventory | Passed: all 436 atlases decoded and matched disk hashes |
| Creator previews | Passed: 208 previews, four directions, both themes and compact layouts |
| World visual review | Passed: 1,044 game views; all designs and directions |
| Character visual review | Passed: all 172 layers and 22,016 source frames; 560 game views |
| Repeated ground layouts | Passed: all 12 designs, all four directions |
| Collision and selection | Passed: corner-desk openings, arc-lamp base/canopy, walls, windows and door traversal |
| Supported props | Passed: placement, artwork selection, overlap rejection, reload and erasure at every rotation |
| Character gameplay | Passed: four-direction movement, sitting, listening, seated listening and motion priority |
| Water gameplay | Passed: all rotations and reduced-motion behavior |
| Existing server placement | Passed: placement, four rotations, grid alignment, reload and removal; original objects preserved |
| Lint | Passed |
| Workspace typechecks | Passed |
| Production builds | Passed |
| Server asset, layout, movement and character tests | Passed: 75 tests across 11 files |
| Client suite | 480 passed; 1 unrelated player-inventory UI test failed |

The client failure is `Workspace.player-assets.test.tsx:68`: it cannot find a button named **Place**. The same failure reproduced when that file ran alone (3 passed, 1 failed), with the world canvas mocked. No player-inventory UI code was changed for this audit. [Failure log](../artifacts/asset-quality-2026-09-15/after/client-player-asset-test.log).

[Interaction results](../artifacts/asset-quality-2026-09-15/after/interactions/browser-report.json) · [Server placement results](../artifacts/asset-quality-2026-09-15/after/server-placement/live-placement-report.json) · [Animation coverage and video path](../artifacts/asset-quality-2026-09-15/after/animations/coverage.json) · [Build log](../artifacts/asset-quality-2026-09-15/after/build.log) · [Server test log](../artifacts/asset-quality-2026-09-15/after/server-asset-tests.log).

## Limits

No asset remains unvalidated. Visual acceptance was performed in Chromium at the current default gameplay zoom. Other browser engines and physical display/GPU combinations were not exercised. The unrelated client test failure remains open.

The repository already contained substantial uncommitted changes before this task. This audit preserves that work; its scorecard compares the files against the inventory captured at the start of this audit, rather than treating the Git baseline or previous completion reports as evidence.
