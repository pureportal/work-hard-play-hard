# Asset expansion — September 15, 2026

Added six map objects and ten avatar customization choices through the existing Blockbench pipeline. The additions retain the refined anime faces, chibi proportions, cel shading, world scale and placement grid described in the [visual refinement](blockbench-visual-refinement-2026-09-15.md) and [avatar refinement](avatar-anime-refinement-2026-09-15.md) reports.

## Map additions

Each object has Sakura, Matcha and Indigo materials and four rotations. All six appear in Build and Shop and use the existing ownership and inventory flow.

| Object | Footprint | Behavior |
| --- | --- | --- |
| Reading bench | 4×2 cells | Two seats with a modeled backrest |
| Low tea table | 4×3 cells | Supports tabletop decorations |
| Bamboo planter | 2×3 cells | Scenery with a solid planter |
| Stone lantern | 2×2 cells | Carved lantern with a warm inset |
| Wind chimes | 2×2 cells | Native swaying chimes and paper sail |
| Desk pinwheel | 1×1 cell on a surface | Native spinning folded blades |

The catalog now contains **87 objects, 261 material designs and 1,404 rendered frames**. This expansion adds 18 native models/atlases and 432 directional animation samples. The new atlases total approximately 1.9 MB on disk and load on demand.

The chimes and pinwheel have 16-frame, 1.6-second Blockbench loops. Directional bounds cover the complete animation, so texture changes preserve the ground anchor, size and shadow alignment. The same world ticker handles these loops and existing water animation. Reduced motion freezes playback. Animated hit testing includes every pose. The new animation atlases stay below 4096px in both dimensions.

Geometry is in [courtyard.cjs](../scripts/world-assets/blockbench/courtyard.cjs); editable models and native directional renders remain alongside the existing Blockbench assets. The [workflow documentation](../scripts/world-assets/blockbench/README.md) describes generation and import.

## Avatar additions

- **Cocoa curls** and **Pearl braid** hairstyles.
- **Traveler jacket**, **Travel breeches** and **Travel boots**.
- **Festival haori**, **Indigo hakama** and **Tabi sandals**.
- **Blossom clip** and **Goggles**, fitted to all fourteen hairstyles.

The traveler scarf and pearl braid have independently animated bones in idle, walk, sit, listen and seated-listening clips. New clothes mix with existing pieces across both genders and all four body fits. The blossom clip uses a deeper rose material to remain visible on pale hair.

The additions produce **64 component atlases**, bringing the total to **220 atlases / 28,160 component frames**. The 120px source frame, 80-unit game sprite, foot/hip anchors, collision geometry and existing animation timing remain intact. Creator options, portraits and world players continue to use the same depth composition.

## Verification

- Validated every world/architecture atlas for textured native faces, complete variants and rotations, calibrated footprints, transparent borders and visible material differences. Animated frames also have fixed directional bounds and distinct poses in every rotation.
- Reopened all six new animated map models in Blockbench and verified their loops move and close. Reopened 15 representative character models and checked all five loops. All 220 character atlases passed frame/depth coverage, transparent-margin and body-fit checks.
- Reviewed all 72 new map material/direction views at one world unit per CSS pixel. Captured 16 mixed avatar appearances in all 20 motion/direction combinations at 80px and 120px. Captured all 112 hair/headwear pairings in four directions, with and without headphones; inspected new cuts and representative headwear/clothing combinations.
- Through the real running server, placed, selected and rotated all six new map objects, reloaded each saved placement, then removed the temporary objects. The pinwheel check also created and removed its supporting tea table. Original objects were preserved.
- In the gameplay fixture, passed 24 object selections, 80 collision approaches and bench seating in all four rotations. Both animated objects played all 16 frames with fixed bounds and synchronized shadows, froze with reduced motion and resumed after reload. Visual checks waited for camera movement and character positioning to settle.
- Through the real avatar creator/API, saved and reloaded eight hairstyles, including both new clothing sets and headwear choices. Matched every served character atlas with its source and compared the game texture with creator composition. Both live avatar checks restored the original appearance.
- Checked 208 directional creator option previews, all 20 animation/direction combinations, reduced motion and six compact theme/layout combinations. Exercised keyboard movement, sitting, standing, listening and seated listening with the expanded avatar and reading bench using the running client with isolated runtime data.
- Checked every Build and Shop category, 38px thumbnails, material selection and desktop placement controls. Purchased the animated chimes through Shop, selected them in Inventory and placed them with touch at 390×844, 320×568 and 844×390, in both themes.
- Passed **70 focused client/server tests**, workspace lint/typechecks and the production client build. All **484 built world, architecture and character atlases** match their source bytes.

All game browser checks used Playwright with the existing client on port 5173 and server on port 3001. No development servers were started or restarted. The interaction fixtures use isolated in-memory data through the running client.

## Screenshots and results

- [Reading bench materials](../artifacts/asset-expansion/maps/materials/catalog-sofa-reading-bench-01.png) · [Tea table](../artifacts/asset-expansion/maps/materials/catalog-table-chabudai-01.png) · [Bamboo](../artifacts/asset-expansion/maps/materials/catalog-plant-bamboo-01.png) · [Lantern](../artifacts/asset-expansion/maps/materials/catalog-light-stone-lantern-01.png)
- [Chimes](../artifacts/asset-expansion/maps/materials/catalog-decor-wind-chimes-01.png) · [Pinwheel](../artifacts/asset-expansion/maps/materials/catalog-decor-pinwheel-01.png) · [Live pinwheel after reload](../artifacts/asset-expansion/maps/live/decor-pinwheel/live-placement-reloaded.png)
- [Courtyard in game](../artifacts/asset-expansion/maps/gameplay/courtyard-0.png) · [Bench seating](../artifacts/asset-expansion/maps/gameplay/bench-seated-0.png) · [Side seating](../artifacts/asset-expansion/maps/gameplay/bench-seated-90.png) · [Rear seating](../artifacts/asset-expansion/maps/gameplay/bench-seated-180.png) · [Placement, collision and animation results](../artifacts/asset-expansion/maps/gameplay/courtyard-review.json)
- [Traveler creator](../artifacts/asset-expansion/avatars/live/creator-curls.png) · [Festival creator](../artifacts/asset-expansion/avatars/live/creator-longbraid.png) · [New hairstyles](../artifacts/asset-expansion/avatars/hairstyles.png) · [Clothing](../artifacts/asset-expansion/avatars/outfits.png)
- [Curly hair/headwear](../artifacts/asset-expansion/avatars/headwear-curls.png) · [Braided hair/headwear](../artifacts/asset-expansion/avatars/headwear-longbraid.png) · [Mixed animated outfit](../artifacts/asset-expansion/avatars/character-style-3.png) · [Seated listening in game](../artifacts/asset-expansion/avatars/gameplay/world-sit-listen.png)
- [Mobile Inventory](../artifacts/asset-expansion/maps/ui/mobile-390-designs.png) · [Compact avatar creator](../artifacts/asset-expansion/avatars/live/creator-light-320.png)
- [Native map animation results](../artifacts/asset-expansion/maps/native-animation-review.json) · [Creator and reload results](../artifacts/asset-expansion/avatars/live/creator-review.json) · [Character playback](../artifacts/asset-expansion/avatars/playback/character-playwright.json) · [Shop/Inventory results](../artifacts/asset-expansion/maps/ui/verification.json) · [Built inventory](../artifacts/asset-expansion/built-inventory.json)

## Repeatable checks

```sh
node scripts/world-assets/blockbench/generate.mjs sofa-reading-bench table-chabudai plant-bamboo light-stone-lantern decor-wind-chimes decor-pinwheel
node scripts/world-assets/blockbench/import.mjs sofa-reading-bench table-chabudai plant-bamboo light-stone-lantern decor-wind-chimes decor-pinwheel
pnpm assets:characters
pnpm assets:world:check
node scripts/world-assets/blockbench/review-animation.mjs
pnpm --filter @workhard/server exec tsx ../../scripts/world-assets/blockbench/playwright-courtyard.ts
node scripts/characters/blockbench/review.mjs --output=artifacts/asset-expansion/avatars
node scripts/characters/blockbench/headwear-review.mjs --output=artifacts/asset-expansion/avatars
node scripts/characters/blockbench/creator-review.mjs --output=artifacts/asset-expansion/avatars/live
node scripts/characters/blockbench/playwright-check.mjs --output=artifacts/asset-expansion/avatars/playback
```

Run live save/placement scripts sequentially because they temporarily use the same demo account. The world live check accepts any new asset ID via `--asset=` and an evidence directory via `--output=`.

## Limits

Verification used Chromium and emulated mobile viewports. Native applications/devices, other browser engines, server/database restart durability and external music playback were not tested. Complete customization combinations were sampled rather than exhaustively viewed. Real map and avatar saves survived browser reload; movement, injected music presence and Shop/Inventory interaction checks used isolated runtime data.
