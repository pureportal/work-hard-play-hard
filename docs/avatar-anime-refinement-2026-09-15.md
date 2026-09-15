# Player avatar refinement — September 15, 2026

This review builds on the [migration](blockbench-migration.md) and [visual refinement audit](blockbench-visual-refinement-2026-09-15.md). Inspection confirmed that player sprites, portraits and creator options already shared the native Blockbench pipeline. The remaining weaknesses were in character design: similar hair shells, broken highlight patches, generic clothing shapes and cropped long-hair previews.

## Design changes

- Rebuilt faces with shaped anime lashes, layered irises and catchlights, expression-specific brows, softer cheeks and small mouth shapes. Retained the cute chibi proportions.
- Rebuilt hair with separate fringes, temple locks, napes, waves and tied sections. Highlight meshes follow the locks. Short cuts expose the face; long cuts and tied styles have distinct silhouettes from the side and back.
- Added **Ash pixie, Chestnut curtains, Ink hime cut, Silver tousle, Peach buns and Copper side sweep**. All twelve cuts work with the six headwear choices and headphones.
- Refined the six clothing families with bomber facings, ranger pockets and straps, moon armor piping and brooches, sailor collars, knit edging, and kimono sleeves and obi. Added trouser folds, hems and boot cuffs. Garment details receive the same body-fit transforms as their underlying clothing.
- Rebalanced the palette with warm highlights, cooler fill and stronger cel shadows. Widened the creator's hair crop to show long silhouettes.
- Refreshed the sign-in illustration's embedded characters from the updated production atlases.

The generation code is separated into face, hair, headwear, clothing, material/fit and rig modules. The production inventory now has **156 component atlases and editable models**, including **36 added hair/headwear atlases**. Each atlas carries 128 frames: **19,968 component frames** in total.

The 120px source frame, 80-unit world sprite, foot and seated-hip anchors, directional camera angles, animation timing, positioning, collision geometry and interaction logic remain unchanged. Creator options, portraits and world players use the same depth composition.

## Screenshots

[Before/after comparison](../artifacts/avatar-anime/comparison.png) preserves the creator's displayed pixel sizes and the 80px/120px directional review frames. Compared with the baseline, eyes stay clearer in side views, hair highlights form continuous shapes, and clothing details remain legible without the old scattered bright patches.

[Creator before](../artifacts/avatar-anime/before/creator-mixed.png) · [Creator after](../artifacts/avatar-anime/after/creator-mixed.png) · [World before](../artifacts/avatar-anime/before/saved-world.png) · [World after](../artifacts/avatar-anime/after/saved-world.png)

[Twelve hairstyles](../artifacts/avatar-anime/after/hairstyles.png) · [Faces](../artifacts/avatar-anime/after/faces.png) · [Clothing](../artifacts/avatar-anime/after/outfits.png) · [New creator options](../artifacts/avatar-anime/after/creator-pixie.png) · [Small-screen creator](../artifacts/avatar-anime/after/creator-light-320.png) · [Landscape creator](../artifacts/avatar-anime/after/creator-dark-844.png)

## Verification

- Generated and validated all **156 atlases / 19,968 frames** for visible artwork, transparent margins, matching depth data and closed animation loops. Every native model has materials on every face. Reopened **11 models** in Blockbench and verified all five animated loops after loading.
- Reviewed **12 mixed appearances across all 20 motion/direction combinations**, at 80px and 120px. Captured and inspected all **72 hair/headwear combinations** in four directions, idle and listening: **576 views**. Corrected the ranger strap's intersection with the shirt and removed the exposed shared shirt from the kimono during this review.
- Matched every served character atlas against its source bytes, and every built atlas against the final source. No character texture was missing or failed to decode. The live client briefly served its cached six-style enum; refreshing the source file's watch notification made the expanded enum available without starting an additional development server. The final checks used the actual twelve-option creator.
- Selected and saved **each of the six added hairstyles** through the real creator/API. After each reload, verified the stored appearance, compared every pixel of the in-game atlas with the creator composition, and checked the unchanged 80-unit sprite and foot anchor. At the running world's default zoom the sprite canvas occupied 62.4 CSS pixels. Both live checks restored the original saved appearance and verified the restoration.
- Checked **168 directional option previews**, all five creator animations in four directions, reduced motion, and all new choices. Six compact layout checks covered 390×844, 320×568 and 844×390 in both themes, including scrolling to the new hair options and using playback controls.
- Exercised real keyboard movement in all four directions, sitting/standing, listening while standing and seated, walking priority and music stopping with the existing isolated runtime fixture. Checked seat entry/exit, four-frame playback and stable hip anchors on an office chair and stool in every rotation on desktop and mobile: **16 seating cases**.
- Passed **37 focused client/server tests**, workspace lint/typechecks and the production client build. The final build contains all 156 matching atlases and the refreshed illustration. Focused checks were rerun after the garment/crop corrections.

[Live creator, inventory and reload results](../artifacts/avatar-anime/after/creator-review.json) · [Animation and cleanup results](../artifacts/avatar-anime/after/character-playwright.json) · [Native model results](../artifacts/avatar-anime/after/character-model-review.json) · [Headwear results](../artifacts/avatar-anime/after/headwear-review.json) · [World state results](../artifacts/avatar-anime/after/world-animation-review.json) · [Seating results](../artifacts/avatar-anime/after/seating/results.json)

The review scripts use the existing client on port 5173 and server on port 3001. Native generation and model round trips open Blockbench in a headless browser. They start no development servers.

### Repeatable checks

```sh
pnpm assets:characters
node scripts/characters/blockbench/review.mjs --output=artifacts/avatar-anime/after
node scripts/characters/blockbench/headwear-review.mjs --output=artifacts/avatar-anime/after
node scripts/characters/blockbench/appearance-review.mjs
node scripts/characters/blockbench/playwright-check.mjs --output=artifacts/avatar-anime/after
node scripts/characters/blockbench/creator-review.mjs
pnpm --filter @workhard/server exec tsx ../../scripts/characters/blockbench/world-check.ts --output=../../artifacts/avatar-anime/after
node scripts/characters/blockbench/comparison.mjs
```

Run the two live save checks sequentially because they temporarily use the same demo account. The original before captures are retained; regeneration cannot recreate them.

## Limits

Verification used Chromium and emulated viewport sizes. Native applications/devices, WebKit, live server/database restart durability and external music playback were not tested. In-memory persistence/restart tests passed, and real saved appearances survived browser reload. Representative mixed outfits and every hair/headwear pairing were visually reviewed; all 746,496 complete appearance combinations were not individually inspected. Movement and seating checks used isolated data through the running client; appearance saves used the real running server.
