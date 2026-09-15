# Asset improvement pass — September 15, 2026

Improved **17 existing map assets** and **Pearl braid**, using the native Blockbench sources. No catalog entries or customization options were added.

## Findings and changes

The review began in Playwright against the running game, then checked the [expansion report](asset-expansion-2026-09-15.md), [avatar refinement](avatar-anime-refinement-2026-09-15.md), and [Blockbench workflow](../scripts/world-assets/blockbench/README.md). The complete catalog was captured in four rotations. The selected assets received material, gameplay, and animation reviews.

| Assets | Finding | Improvement |
| --- | --- | --- |
| Office, dining and lounge chairs; padded stool; beanbag; ottoman; garden bench; straight, corner, loveseat and tufted sofas | Pale cushion, arm and back edges disappeared against light floors. | Added cushion piping, back/arm seams, rounded cushion welts and slat edges across all three materials. |
| Potted palm | Small disconnected leaflets formed a tangled silhouette. | Rebuilt seven tapered, curved fronds with continuous midribs and a clearer trunk. |
| Marble table | Five parallel strips read as scratches. | Replaced them with branching, tapered veins. |
| Bamboo planter | Sparse flat leaf clusters nearly disappeared sideways. | Distributed fuller leaf clusters around each stem; kept foliage green across planter colors. |
| Stone lantern | Boxy proportions and strong pink surfaces obscured the lantern shape. | Rebuilt the footing, pedestal, chamber and swept roof; separated stone from colored trim. |
| Wind chimes | The paper sail became a thin line sideways; the pale stand lacked definition. | Folded the paper into two faces and added a base inlay. |
| Desk pinwheel | Edge-on blades nearly vanished during side-view playback. | Mounted the rotor diagonally and widened the folded blades with clearer alternating colors. |
| Pearl braid | A large exposed dark nape patch interrupted the gathered hair in rear views, including animated poses. | Rebuilt the gathered crown and sweeps, refined braid highlights, and separated the pearl hair color from the face. All eight headwear atlases were regenerated. |

The sign-in illustration was regenerated from the updated production seating. Persistent edits live in `furniture.cjs`, `botanical.cjs`, `courtyard.cjs`, `catalog-models.cjs`, and the character `hair.cjs` / `customization.cjs`. Editable models, directional renders, production atlases and artwork metadata were regenerated through Blockbench.

## Before and after

These comparisons retain the captured pixel sizes. Catalog sheets use one world unit per CSS pixel; the gameplay captures use the running game's default zoom. Character sheets include 80px game frames and 120px source frames.

- [Palm and seating comparison](../artifacts/asset-improvement/maps-comparison.png)
- [Courtyard gameplay comparison](../artifacts/asset-improvement/courtyard-comparison.png)
- [Pearl braid comparison](../artifacts/asset-improvement/braid-comparison.png)
- [Corner sofa materials and rotations](../artifacts/asset-improvement/after/details/catalog-sofa-corner-01.png) · [Palm](../artifacts/asset-improvement/after/details/catalog-plant-palm-01.png) · [Marble](../artifacts/asset-improvement/after/details/catalog-table-marble-01.png)
- [Bamboo](../artifacts/asset-improvement/after/details/catalog-plant-bamboo-01.png) · [Stone lantern](../artifacts/asset-improvement/after/details/catalog-light-stone-lantern-01.png)
- [Chime animation samples](../artifacts/asset-improvement/after/animation/decor-wind-chimes.png) · [Pinwheel animation samples](../artifacts/asset-improvement/after/animation/decor-pinwheel.png)
- [Pearl braid with every headwear option](../artifacts/asset-improvement/after/avatars/headwear-longbraid.png) · [Live creator](../artifacts/asset-improvement/after/avatars/live/creator-longbraid.png)

## Verification

- Validated **87 map assets / 261 materials / 1,404 frames**, plus three architecture atlases and 12 frames: material coverage, scale calibration, transparent borders, corner openings, animation bounds and atlas limits passed. This pass regenerated **51 map atlases / 564 frames** and **eight character atlases / 1,024 component frames**.
- Matched and decoded all **484 served atlases** against the complete public inventory. Every built atlas and the built illustration also match their source bytes.
- Captured all 87 catalog assets in four directions; checked all 51 changed material designs in four rotations and all 17 changed map objects through the actual world renderer.
- Passed **80 gameplay collision approaches**, 24 object selections and reading-bench seating in four rotations. Both animated map objects played all 16 frames in every rotation with fixed bounds and matching shadows, froze with reduced motion, and resumed after reload. All six animated native map models reopened with moving, closed loops.
- Passed **32 seating cases** across office chairs, corner sofas, beanbags and ottomans: four rotations on desktop and an emulated mobile viewport, including entry, exit, four-frame playback and stable seated anchors.
- Placed the corner sofa, palm, bamboo, stone lantern, chimes and pinwheel through the running server. All six passed four rotations and reload, then were removed; the pinwheel's temporary support table was also removed. Original objects were preserved. [Live results](../artifacts/asset-improvement/verification.json) · [Pinwheel after reload](../artifacts/asset-improvement/after/live/decor-pinwheel/live-placement-reloaded.png).
- Checked all 112 hair/headwear combinations with and without headphones, 320 mixed motion/direction views, 208 creator option views, and six compact theme/layout combinations. Reviewed the refined braid in the live creator and world, all five clips in four directions, walking, sitting, listening, and seated listening. Real avatar saves survived reload; both save checks restored the original appearance.
- Passed **37 focused client tests**, **618 server tests**, workspace lint/typechecks and the production client build. The client unit run emitted JSDOM canvas warnings; real canvas rendering passed in Playwright.

The catalog, placement implementation, character dimensions/anchors, seat heights, backrest flags, support heights and animation timing are unchanged. Geometry and rendered bounds were updated without changing placement footprints, collision rules or interactions. See the [integrity results](../artifacts/asset-improvement/integrity.json), [gameplay results](../artifacts/asset-improvement/after/gameplay/courtyard-review.json), and [seating results](../artifacts/asset-improvement/after/seating/results.json).

The browser scripts now accept separate evidence directories, derive current inventory counts, accept animated texture frames, and avoid overly long multi-asset filenames. The live selection check now samples visible artwork: its old center-based click landed inside the corner sofa's transparent opening. The temporary object from that failed attempt was removed while preserving the original objects.

## Repeatable checks

Use the existing client on port 5173 and server on port 3001. None of these checks starts a development server.

```sh
pnpm assets:world:check
node scripts/world-assets/blockbench/playwright-review.mjs --catalog --base --output=artifacts/asset-improvement/after/maps
node scripts/world-assets/blockbench/playwright-animation-review.mjs
node scripts/world-assets/blockbench/review-animation.mjs --output=artifacts/asset-improvement/after/animation
pnpm --filter @workhard/server exec tsx ../../scripts/world-assets/blockbench/playwright-courtyard.ts --output=../../artifacts/asset-improvement/after/gameplay
node scripts/characters/blockbench/review.mjs --output=artifacts/asset-improvement/after/avatars
node scripts/characters/blockbench/headwear-review.mjs --output=artifacts/asset-improvement/after/avatars
node scripts/characters/blockbench/playwright-check.mjs --output=artifacts/asset-improvement/after/avatars/playback
```

Run real avatar-save and placement checks sequentially because they temporarily use the demo account. Preserve the `before` directory; regenerated artwork cannot reproduce the original screenshots.

## Limits

Verification used Chromium and emulated mobile viewports. Native applications/devices, other browser engines, server/database restart durability and every complete customization combination were not verified. Gameplay interaction fixtures use isolated in-memory data through the running client; live saves use the running server. No outstanding visual defect was identified in the changed assets after the final review.
