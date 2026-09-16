# Garden, food and toys — September 16, 2026

Added 40 distinct Blockbench assets, with 120 selectable designs and four orientations per design. The catalog now contains 271 assets and 813 designs. The additions are available in Build and Shop.

## Collection

| Group | Additions |
| --- | --- |
| Indoor plants · 10 | Snake plant, fern, rubber plant, calathea, orchid, peace lily, string of pearls, jade, citrus, aloe |
| Outdoor vegetation · 10 | Maple, pine, birch, willow, apple tree, hydrangea, rose hedge, lavender, agave, woodland mushrooms |
| Food · 12 | Ramen, sushi, bento, dim sum, curry, poke, pho, pretzel, bratwurst, schnitzel, burger, pancakes |
| Animated props · 4 | Kinetic mobile, jellyfish lamp, rocking bird, garden windmill |
| Interactive toys · 4 | Confetti cannon, bubble machine, fortune dispenser, break wheel |

Indoor plants have terracotta, porcelain and woven planters with different geometry and surface detail. Outdoor plants use spring, summer and autumn designs. Food uses celadon, indigo and clay tableware. Animated props and toys use sakura, mint and sunshine palettes.

The plants include upright blades, broad leaves, trailing foliage, flowers, succulents, layered conifers, narrow birch trunks and drooping willow branches. Food has distinct serving shapes and ingredients; dishes are tabletop decorations. Orchid, jade, aloe and the three indoor animated props also use supporting surfaces.

| Catalog category | Before | After |
| --- | ---: | ---: |
| Plants | 10 | 20 |
| Outdoor | 10 | 21 |
| Decor | 30 | 33 |
| Equipment | 10 | 14 |
| Food | 0 | 12 |
| Entire catalog | 231 | 271 |

Outdoor includes the windmill, Decor includes the other three animated props, and Equipment includes the four toys. Other categories are unchanged. Rotations and designs do not count as distinct assets.

## Animation and interaction

The mobile rotates, jellyfish float, bird rocks and windmill turns. Each has a native 1.6-second Blockbench loop exported as 16 frames per direction. All twelve animated model designs were reopened in Blockbench and checked for movement and matching loop endpoints.

Selecting a toy offers its action or walking to it. Confetti and bubbles produce temporary world effects. The fortune dispenser shares a playful fortune; the break wheel chooses a short break activity. People on the same floor receive the same outcome. A six-second cooldown is shared per object. Fortune and break results remain visible for six seconds; particle effects last 3.2 seconds. Reduced motion keeps props and effects still.

The server validates object visibility, floor, proximity and player activity before use. Meeting participants do not receive toy effects. Selection uses the existing artwork and footprint targeting.

## Artwork and placement

Created and rendered in the running Blockbench desktop editor using the established native model pipeline. Editable files are in `scripts/world-assets/blockbench/models/`; source geometry lives in `garden/`, `food.cjs` and `playful.cjs`. The additions produced 120 native models, 1,200 directional frame images and 120 packed atlases.

The existing projection calibration and 16-unit placement raster are preserved. Assets use their catalog footprints and the existing support-height placement system. The artwork importer supplies four-direction bounds without stretching images to collision boxes.

Reviewed every new design in all four orientations at the game's default zoom of 0.78. Revisions included thicker leaf silhouettes, a denser trailing-plant crown, more distinct tree canopies, clearer apple placement, contrasting dim-sum rim details, and angled wheel/windmill mounts. Revised designs were regenerated and captured again.

## Verification

- 120 design captures cover 480 gameplay orientation views. All eleven unscaled contact sheets were visually inspected.
- Animation sheets cover all three designs and four orientations for each animated prop. Native checks confirm twelve moving, closed loops; browser checks confirm playback and reduced motion in all four orientations.
- 40 Build checks cover category/design selection, placement, four rotations, raster alignment, movement and removal. Tabletop additions use supporting furniture.
- 21 toy/animation browser checks cover all four toys in four rotations, cooldown controls, visible effects and reduced motion.
- Seven Shop checks cover all 40 new listings, buying ramen, selecting its indigo design, placing it on a table, retained ownership after browser reload, and Food navigation at a 390 × 844 viewport.
- 94 focused tests passed: 37 client tests and 57 server tests covering catalog artwork/placement, targeting, Build controls, toy behavior, shared outcomes, cooldowns, proximity, meeting isolation and protocol regression checks.
- `pnpm lint`, `pnpm typecheck`, client build and server build passed.
- `pnpm assets:world:check` passed for the complete catalog: 271 assets, 813 designs, 4,332 frames, plus three structural assets. It validates directional metadata, calibrated footprints, atlas content and transparent borders.

Browser checks used the production client build and real in-memory world runtime through Playwright request/WebSocket routing. No development servers were started. Browser reload retention was verified against that fixture; deployed multiplayer networking and database persistence were not exercised. Browser coverage is Chromium with emulated mobile sizing, not physical devices or other browsers. The client build retains its bundle-size warning for the artwork metadata chunk.

## Evidence

- [Review gallery](../artifacts/garden-food-2026-09-16/index.html)
- [Every gameplay design](../artifacts/garden-food-2026-09-16/gameplay/index.html)
- [Gameplay coverage](../artifacts/garden-food-2026-09-16/gameplay/coverage.json)
- [Build checks](../artifacts/garden-food-2026-09-16/interactions/checks.json)
- [Toy and animation checks](../artifacts/garden-food-2026-09-16/specials/checks.json)
- [Shop checks](../artifacts/garden-food-2026-09-16/shop/checks.json)
- [Native animation checks](../artifacts/garden-food-2026-09-16/native-animation-review.json)
- [Artwork audit](../artifacts/garden-food-2026-09-16/artwork-check.log)

```powershell
pnpm build:client
$assetIds = ((Get-Content artifacts/garden-food-2026-09-16/assets.json | ConvertFrom-Json) -join ',')
pnpm --filter @workhard/server exec tsx ../../scripts/world-assets/blockbench/category-review.ts --built "--assets=$assetIds" --output=artifacts/garden-food-2026-09-16/gameplay
pnpm --filter @workhard/server exec tsx ../../scripts/world-assets/blockbench/category-interactions.ts --built "--assets=$assetIds" --output=artifacts/garden-food-2026-09-16/interactions
node scripts/world-assets/blockbench/category-sheets.mjs --output=artifacts/garden-food-2026-09-16
pnpm --filter @workhard/server exec tsx ../../scripts/world-assets/blockbench/playwright-special-props.ts
pnpm --filter @workhard/server exec tsx ../../scripts/world-assets/blockbench/playwright-food-shop.ts
pnpm assets:world:check
pnpm lint
pnpm typecheck
pnpm build:server
```
