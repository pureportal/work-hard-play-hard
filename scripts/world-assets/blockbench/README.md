# Blockbench world assets

The production catalog uses one native Blockbench generation/import pipeline with four calibrated views per material.

```sh
pnpm assets:world
pnpm assets:world:check
pnpm assets:world:review
```

- `model-kit.cjs`: native cubes, meshes, materials and rounded forms.
- `lounge-models.cjs`: approved shoji screen, tea cart and sakura planter.
- `furniture.cjs`, `botanical.cjs`, `objects.cjs`, `equipment.cjs`: catalog geometry by family.
- `game-tables.cjs`, `celebration-gong.cjs`: sculpted chess set, tabletop Falling Blocks cabinet and cardinal-facing gong with a hollow bronze bowl, including their material palettes.
- `arcade-cabinet.cjs`: enclosed upright cabinet, CRT playfield, controls and side artwork.
- `courtyard.cjs`: reading bench, low tea table, bamboo, stone lantern, native wind chimes and pinwheel animations.
- `architecture.cjs`: wall, open threshold and window geometry and dimensions.
- `catalog-models.cjs`: catalog footprints, theme materials and model selection.
- `flooring/`: ceramic, mineral, timber, woven, resilient and landscape floor models; 30 materials with three designs each.
- `expansion/`: category-specific furniture, fixtures, equipment, plants and rug models, with shared joinery.
- `surfaces.cjs`: rugs and mats in Floor Decor.
- `source-files.cjs`, `generate-native.cjs`: shared model sources and generation in the desktop editor through Blockbench MCP.
- `render.cjs`: orthographic rendering, ground calibration and model export.
- `generate.mjs`: full or selected-asset generation in Blockbench.
- `import.mjs`: transparent atlas packing, explicit bounds, support/cushion heights and backrest metadata.
- `playwright-review.mjs`: actual-size catalog review through the running client.
- `playwright-animation-review.mjs`: directional animation samples at world scale and twice that size.
- `playwright-audit.ts`: in-game rotations, movement collisions, elevated placement, selection and erasing with isolated runtime data.
- `playwright-live-check.mjs`: temporary placement, rotation, reload and cleanup through the running server.
- `playwright-floor-review.ts`: every floor design and rotation repeated in the running game at the default zoom.
- `playwright-floor-interactions.ts`: Build and Shop navigation, designs, placement, rug layering, ownership and narrow-screen controls.
- `category-review.ts`, `category-sheets.mjs`: every design and cardinal view in the running game at its default zoom, with unscaled review sheets.
- `category-interactions.ts`, `category-occupancy.ts`: catalog selection, placement, rotation, movement, removal, seating and pergola clearance.
- `floor-report.mjs`: saved floor evidence checks and the gameplay review gallery.
- `review-animation.mjs`: animated model round trips and closed-loop checks in Blockbench.
- `playwright-courtyard.ts`: new map objects, collisions, seating, animation, shadows and reduced motion in the running game.
- `render-office-preview.mjs`: static sign-in illustration composed from production furniture, architecture and character atlases; run with `pnpm assets:world:preview` after changing its artwork.
- `playwright-inventory.mjs`: complete served-file inventory, native character materials and four-direction creator previews.
- `playwright-arcade.ts`: arcade materials, selection and movement collision checks in four rotations.

Open files in `models/` directly in Blockbench. The `renders/` directory contains native directional images; `renders/manifest.json` records their projected footprints. Regeneration overwrites these outputs, so make persistent changes in the source modules. The generator accepts catalog IDs; the importer accepts the same IDs. Both default to the complete catalog.

Pass `--architecture` to generate/import the structural set in `architecture/models` and `architecture/renders`. The root generation and validation commands include both sets.

Both ground axes map to six pixels per world unit after each rotation. Negative native Y rotation matches the shared clockwise footprint transform. The importer preserves scale without stretching furniture to collision boxes. See [world asset documentation](../../../docs/world-assets.md) and the [September 15 audit](../../../docs/blockbench-asset-audit-2026-09-15.md).

The live placement check accepts `--asset=<catalog-id>` and `--output=<directory>`. Surface assets receive a temporary low tea table, and both objects are removed after the check. The catalog review accepts comma-separated IDs and an output directory. These browser checks reuse the running client. See the [expansion report](../../../docs/asset-expansion-2026-09-15.md) for evidence and commands.

The audit accepts `--catalog`, `--asset=<comma-separated-ids>` and `--output=<directory>` for focused world-renderer captures. The inventory and courtyard checks also accept an output directory. See the [asset improvement report](../../../docs/asset-improvement-2026-09-15.md) for the latest before/after review.

The [gong rebuild](../../../docs/blockbench-gong-2026-09-15.md) includes the cardinal-view correction, native model checks and live placement evidence.

The [Floor Types overhaul](../../../docs/floor-types-2026-09-15.md) covers all 24 materials, 72 designs and four orientations, with the review gallery and verification commands.

The [category expansion audit](../../../docs/category-expansion-2026-09-15.md) records the 231-asset catalog, category targets, artwork corrections and gameplay verification. Category review, interaction and occupancy checks accept `--assets=<comma-separated-ids>` and `--output=<directory>`. Without an asset filter, they use the complete applicable catalog.
