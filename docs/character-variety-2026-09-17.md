# Character variety

Added 66 selectable pieces: ten everyday faces, hairstyles and headwear pieces, plus three crazy and three sexy styles in each of the six categories.

| Category | Added | Total assets | Feminine | Masculine | Neutral |
| --- | ---: | ---: | ---: | ---: | ---: |
| Faces | 16 | 22 | 5 | 5 | 12 |
| Hair | 16 | 30 | 12 | 12 | 6 |
| Tops | 6 | 24 | 7 | 7 | 10 |
| Bottoms | 6 | 24 | 7 | 7 | 10 |
| Shoes | 6 | 24 | 5 | 5 | 14 |
| Headwear | 16 | 23 | 7 | 7 | 9 |
| Total | 66 | 147 | 43 | 43 | 61 |

The headwear control also includes None. Hair/headwear combinations are counted as their individual choices, not as additional designs.

## Styling audit

These counts are subjective art-direction judgments about the particular artwork, not a classification of the people who can wear it. The audit considers the silhouette, tailoring, facial hair, makeup and ornament together, rather than color alone. Many of these styles can read differently when combined. All assets remain selectable and interchangeable; no gender field or filtering was added.

| Category | Before feminine | Before masculine | Before neutral |
| --- | ---: | ---: | ---: |
| Faces | 0 | 0 | 6 |
| Hair | 8 | 4 | 2 |
| Tops | 5 | 4 | 9 |
| Bottoms | 4 | 6 | 8 |
| Shoes | 4 | 4 | 10 |
| Headwear | 2 | 1 | 4 |
| Total | 23 | 19 | 39 |

The extra short cuts, locs, topknot and slickback balance the existing long and tied hair styles. New skirts balance the structured breeches and armor. The satin shirt, mirrorball jacket and harness tank balance the blouse and corset selections. Facial hair and stronger brows accompany the new makeup options. The complete assignment of every asset is in `scripts/characters/blockbench/style-audit.json`; `style-audit.mjs` checks coverage, counts and the six new themed pieces per category.

## New styles

| Category | Crazy | Sexy |
| --- | --- | --- |
| Faces | Star eyes, Lightning paint, Mime | Smoky eyes, Smolder, Playful wink |
| Hair | Flame crest, Nebula puffs, Tentacle locks | Hollywood waves, Midnight slickback, Silver wet look |
| Tops | Jellyfish cape, Phoenix wings, Mirrorball jacket | Lace bustier, Satin open collar, Harness tank |
| Bottoms | Jellyfish skirt, Phoenix feather skirt, Disco flares | Lace slit skirt, Satin trousers, Belted leather shorts |
| Shoes | Jelly slippers, Phoenix boots, Mirror platforms | Lace-up heels, Patent loafers, Buckle sandals |
| Headwear | Flying saucer, Crystal antlers, Octopus hat | Veiled fascinator, Leather cap, Masquerade mask |

The everyday additions include freckles, doe eyes, cat liner, rosy cheeks, gloss, a stronger jaw, stubble, a moustache, a goatee and a grin. Hair adds buzz, fade, quiff, pompadour, mohawk, locs, topknot, puff, side pony and waterfall silhouettes. Headwear adds a beanie, fedora, tricorn, tweed cap, bandana, tiara, sunhat, rose crown, pearl comb and halo.

## Artwork and review

The native Blockbench generator exports 814 editable models and depth/color atlases, including all 720 hair/headwear combinations. Each layer contains 128 frames across four directions and five motions, for 104,192 component frames. Covered hats compress the hair crown; the hair thumbnail crop accommodates taller crests and longer silhouettes. The generator uses three isolated Blockbench pages and reuses each page's render context.

Review commands use the existing client and start no development server:

```sh
node scripts/characters/blockbench/style-audit.mjs
pnpm --filter @workhard/server exec tsx ../../scripts/characters/blockbench/catalog-review.mjs
node scripts/characters/blockbench/review.mjs --output=artifacts/character-variety/models
node scripts/characters/blockbench/headwear-review.mjs --output=artifacts/character-variety/combinations
pnpm --filter @workhard/server exec tsx ../../scripts/characters/blockbench/variety-check.ts
```

`catalog-review.mjs` produces sheets from the real generated atlases. `variety-check.ts` selects all 66 new options in an isolated fixture, saves and reloads sixteen mixed appearances, compares their game textures to the creator, checks all 592 directional option previews, exercises twenty animation views, and checks sixteen desktop/mobile layouts. `layout-review.ts` checks the final option in the list, visible scrollbars, touch scrolling, keyboard navigation and 44px playback controls.

Evidence is written to `artifacts/character-variety`. Physical-device and Safari checks are outside this Chromium-based review.

## Verification results

- 35 focused tests passed: 21 client tests, nine API/randomization tests and five production artwork tests. The artwork tests checked all 104,192 frames; their time limits were extended for the larger inventory without changing any image assertions.
- Client and server builds passed. The client build verified 1,702 image sources and 5,104 delivery files. Conversion checked identical pixels for all 684 new or changed delivery images.
- The designer selected all 66 additions, saved and reloaded 16 mixed appearances, and matched their previews to the in-game textures. All 592 directional option previews and 20 animation views passed without browser errors.
- All 16 viewport/theme layouts passed, including 320px portrait and 568px landscape, touch scrolling, keyboard navigation, reachable final options and save controls.
- All 720 hair/headwear combinations rendered in four directions, idle and listening, producing 5,760 captured views without browser errors. The four catalog sheets cover every selectable face, hairstyle, headwear and coordinated outfit.
- All 814 editable models passed structural checks. Blockbench reopened 111 representative models, including every addition, with five animated, closed loops each. The model review also captured 700 composed views at native and game sizes.
