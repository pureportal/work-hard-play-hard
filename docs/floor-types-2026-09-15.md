# Floor Types overhaul — September 15, 2026

Floor Types now contains **24 materials and 72 designs**, with four orientations per design. All models were created through the established Blockbench MCP workflow and rendered with the existing calibrated, pastel anime asset pipeline.

[Review gallery](../artifacts/floor-types-2026-09-15/index.html) · [Evidence manifest](../artifacts/floor-types-2026-09-15/verification.json)

## Collection

| Material | Designs |
| --- | --- |
| Ceramic tiles | Ivory glaze, Blue checker, Sage octagon |
| Stone tiles | Honed limestone, Split slate, White marble |
| Stone | Flagstone, River stone, Broken slate |
| Wood | Oiled oak, Narrow walnut, Wide whitewash |
| Parquet | Herringbone, Chevron, Basketweave |
| Laminate | Ash planks, Slate squares, Diagonal maple |
| Vinyl | Pastel chips, Ivory diamond, Honey parquet |
| PVC | Coin texture, Ribbed steel, Safety fleck |
| Linoleum | Marbled sage, Ochre inlay, Blue stripes |
| Carpet | Rose plush, Charcoal tiles, Oatmeal rib |
| Cork | Fine cork, Dark blocks, Cork mosaic |
| Concrete | Warm trowel, Cool slabs, Exposed aggregate |
| Resin | Pearl pour, Rose flake, Metallic smoke |
| Rubber | Charcoal studs, Blue crumb, Clay squares |
| Terrazzo | Chunky ivory, Fine seafoam, Brass charcoal |
| Bamboo | Natural stems, Carbonized strips, Woven bamboo |
| Sisal | Fine rib, Herringbone weave, Sage basket |
| Jute | Braided jute, Ivory loops, Coarse basket |
| Artificial grass | Short turf, Striped turf, Soft olive |
| Natural grass | Short spring, Meadow, Long golden |
| Gravel | River gravel, Crushed slate, Pea gravel |
| Paving stones | Ashlar, Sandstone basket, Cobblestone |
| Decking | Grooved cedar, Grey composite, Teak squares |
| Brick | Running bond, Cream herringbone, Smoked basket |

The designs change joint layouts, board widths, grain, aggregate size, weave, surface relief and grass density/length. Parquet includes three separate board arrangements. Every material has its own catalog entry, price, theme set, editable models and production atlases.

## Integration

- Build and Shop use the expanded Floor Types category. Rugs and mats remain in Floor Decor.
- Floors retain the existing 64 × 64 world-unit footprint, 16-unit placement grid and four rotations. Flooring stays walkable.
- Rugs can sit above flooring and below furniture. Rendering and selection give rugs precedence over the floor underneath, regardless of insertion order.
- Build keeps design and rotation controls visible while scrolling the material collection. Build and Shop keep the selected category visible when the panel resizes.
- A forward database migration replaces the old Floor Tile references in layouts, inventory and purchase records. It preserves position, rotation, ownership, purchase value and balances. Unplaced Floor Tiles become wood; placed wood, stone and grass become the corresponding materials. The three replacements retain the original 30-coin price.
- The superseded model, atlas and render files are archived under the review's `before/` directory. Production assets use the new catalog IDs.

Floor generation is divided by material family in [flooring/](../scripts/world-assets/blockbench/flooring/). The desktop MCP generator and existing generator share the same source modules and renderer. All 72 final models were reopened and compiled in Blockbench 5.1.6; element and texture counts matched the saved models. Other catalog entries, artwork metadata, source mappings, render manifests and categories match the snapshots taken before this task.

## Visual review

Reviewed **all 288 design/orientation combinations** in the running game's Pixi renderer at its default **0.78 zoom**. Each capture includes a 3 × 3 field of adjoining tiles. The gallery displays these crops at their captured size and links to 72 full game screenshots with an individual tile, repeated field and character for scale. The review used isolated layout data with the real server runtime and client renderer.

The manual review covered material readability, edge coverage, repeat seams, joint and grain alignment, and rotation. Several first versions needed revision:

- Strengthened wood grain and knots that disappeared at gameplay scale; replaced regular marble stripes with branching veins.
- Kept concrete surface variation within slab joints, softened bamboo banding, and made masonry basket patterns read as stone or brick.
- Separated fine sisal from coarse braided jute, added decking grooves and fasteners, and increased the silhouette and density differences between grass lengths.
- Rebuilt resin twice after striped and wave-like versions read poorly. The retained designs use organic tonal pools, flake and a fine metallic edge.

Recreated designs were captured and inspected again. The gallery retains the first-pass sheets for comparison. Technical success and native model round trips were checked separately from the visual assessment; no automated quality scores were used.

## Verification

| Check | Result |
| --- | --- |
| Blockbench final model round trips | 72 models |
| Gameplay visual coverage | 72 designs × four rotations; 288 repeated fields |
| Build interactions | Selected all 72 designs; placed, rotated, moved and removed each of the 24 materials |
| Shop interactions | 24 entries, category keyboard navigation, search, purchase, design selection, ownership, reload, rotation and return to inventory |
| Layering and mobile | Rug stacking, selection priority, walkability and 390 × 844 controls |
| Live server placement | Parquet at four rotations, grid alignment, reload persistence and cleanup; original objects preserved |
| Client tests | 93 focused tests passed; 14 relevant UI tests also rerun after the category visibility change |
| Server and database tests | 98 focused tests passed, including migration and economy integrity |
| Lint and workspace typechecks | Passed |
| Client and server production builds | Passed |
| Artwork validation | 110 catalog assets / 330 designs / 1,680 frames; three architecture assets / 12 frames passed |

The migration test uses PostgreSQL inside a rolled-back transaction. It covers all three previous designs, placed and unplaced ownership, unchanged purchase amounts and balances, repeat execution and layout revision handling. The live placement check initially encountered a temporary server connection failure; the retry passed with no recorded page or asset-loading errors and removed its temporary object.

### Reproduce the floor checks

With the client and server already running:

```sh
pnpm --filter @workhard/server exec tsx ../../scripts/world-assets/blockbench/playwright-floor-review.ts
pnpm --filter @workhard/server exec tsx ../../scripts/world-assets/blockbench/playwright-floor-interactions.ts
node scripts/world-assets/blockbench/playwright-live-check.mjs --asset=floor-parquet --output=artifacts/floor-types-2026-09-15/live-server
node scripts/world-assets/blockbench/floor-report.mjs
pnpm assets:world:check
pnpm lint
pnpm typecheck
pnpm --filter @workhard/client build
pnpm --filter @workhard/server build
```

For a subset of visual captures, append a quoted argument such as `"--assets=floor-parquet,floor-grass"`. The report builder checks saved evidence and model consistency; it does not replace manual visual review.

## Limits

- Browser checks used Chromium on desktop and a mobile viewport; other browser engines and physical mobile devices were not tested.
- Floors, including natural grass, are static. No floor animation was introduced.
- Matching tile orientations preserve directional patterns. Deliberately mixing orientations creates turns or breaks in plank, weave and masonry layouts.
- This was a focused asset and placement verification, not a rerun of the entire repository test suite.
