# World object anime audit — 2026-09-13

The subsequent [application visual review](application-visual-review.md) records fresh before/after screenshots and responsive layout fixes. It rechecked the PixelLab refusal and confirmed that artwork recreation remains blocked.

The catalog does **not** yet form a convincing, cohesive anime set alongside the revised avatars. The review is complete; the requested artwork recreation is **blocked and unfinished**. No replacement artwork was accepted during this retry.

PixelLab MCP was reachable. The active Tier 2 Pixel Artisan account reported 31 generation units and $0 credits. The existing 512px Pro operations cost 40 units. A new 512px Pro edit was explicitly refused with `no generations or credits remaining for editing an image`. The balance remained 31 afterward, with no active generation jobs. No lower-quality generation was substituted.

## Review coverage

The actual JSON catalog contains 72 objects in 12 categories, 216 material designs and 864 cardinal frames. All five rarities were included. Each object's four base source views was inspected, including the separate wood, stone and grass floor sheets. All three materials and four directions were rendered at their world dimensions alongside the revised 52px avatars, with 38px catalog previews in light and dark themes. Displayed artwork was inspected across the entire catalog, with additional application screenshots for placed objects and selection controls.

References were `scripts/characters/sources/base.png`, the revised character artwork and display-size sheet, character provenance, the existing world-object sheets, `briefs.json`, and the actual source/atlas manifests. Earlier completion reports were not used as acceptance evidence.

The avatar reference establishes fine outlines, controlled cel shading, restrained highlights and coherent material volumes. The object catalog varies between noisy retro pixel textures, heavy dark contours and nearly unshaded panels. Several smaller props are closer to the target, but their presence does not resolve the wider mismatch.

## Findings

| Category | Objects | Findings from source and displayed review |
| --- | ---: | --- |
| Desks | 9 | Flat laminate panels, inconsistent grain and highlights, and conspicuous changes in leg proportions between wide front views and narrow side views. Navy executive-desk sides retain large tan patches. Gaming-desk replacements require a new directional set. |
| Seating | 9 | Office and lounge chairs are among the stronger existing material studies. The three-seat sofa remains flat and pink-backed even in gray/blue variants. Beanbag recolors retain beige patches; corner and tufted sofas use differing projection treatments. |
| Tables | 8 | Wood grain is much stronger and noisier than the avatar rendering. The round table has dense concentric rings; narrow directions exaggerate supports. Marble has more restrained material shading but still needs comparison with the final furniture set. |
| Plants | 6 | Dark leaf outlines and dense pixel texture dominate the floor plant, palm and planter row at small sizes. Cactus and bonsai silhouettes remain identifiable. Botanical colors are distinct, but detail density and planter shading vary considerably. |
| Outdoor | 6 | Garden-bed foliage and topiary are noisy; the fountain uses heavy stepped contours. Bench side views stretch noticeably when displayed. Pool and lantern variants remain distinguishable, including the earlier lantern color repairs. |
| Decor | 11 | Coffee cup, clock and monitor remain legible at small sizes. The family mixes flat purple casings, different outline weights and inconsistent glass highlights. The Graphite laptop source is visibly lavender. Thin profiles need comparison at their placed size, not only as large source images. |
| Equipment | 7 | Game identities are recognizable, but table/cabinet materials are flat and pixel-heavy. The white Falling Blocks design recolors its screen background. Whiteboard and bookshelf heights change conspicuously in narrow directions. Bookshelf recoloring also affects book colors. |
| Surfaces | 3 | Wood has conspicuous repeating grain; stone retains the same parquet-like layout; grass is rendered in patterned strips rather than a natural turf surface. Rug detail is dense, and the round rug's west center rings differ from the other directions. |
| Storage | 5 | Flat orange/brown panels and heavy outlines give filing, locker, credenza and cubby assets a cartoon finish. Directional silhouettes are present, but projected proportions vary. Some cabinet recolors also affect basket materials. |
| Lighting | 4 | Recognizable silhouettes and stronger crystal detailing, but stepped metal highlights and inconsistent shade treatment remain. Copper/silver transformations also tint paper and illuminated shades. |
| Breakroom | 3 | Fridge, coffee bar and water cooler identities and finishes are distinct. Broad surfaces are nearly flat; metal, enamel and glass lack the finish of the avatar reference. |
| Infrastructure | 1 | The portal directions and three colors are distinct after the earlier palette repair. Its heavy beveled outline and flat graphic treatment still differ from the revised artwork. |

These are visual findings, not automated style scores. A complete anime replacement set remains outstanding; the current generation ledger's historical `accepted` entries do not establish acceptance against the revised avatars.

## Recovered work and rejected artwork

The earlier PixelLab gaming-desk job `f1fd35aa-6f21-41ad-820c-b64be5176fec` was reviewed directly. Its flat tabletop and repeated west-facing notch in the east frame confirm the rejection already recorded in the ledger. No duplicate generation was submitted for that job.

A separate, unrecorded 1254×1254 gaming-desk sheet was recovered from the interrupted run. Its provider and generation identifier could not be established. Its finer rendering was provisionally integrated for visual review, including all three materials. The actual world-size comparison showed stretched side-view legs; the first material conversion also left differently colored highlight patches. It was rejected, and all three original gaming-desk atlases were restored byte for byte. The recovered source and provisional screenshots are retained only under `artifacts/world-assets/anime-revision/recovery/` as rejection evidence.

The six already completed palette repairs were preserved: laptop Ivory/Coral, garden lantern Sand/Slate and portal Blue/Amber. These are material corrections, not a completed anime redraw. No artwork was newly accepted in this retry, and no public artwork differs from the retry's starting state.

## Pipeline recovery

The interrupted run left source preparation, recording and validation expecting local `path` and `background` fields that the actual source manifest did not contain. Preparation also imported a nonexistent backdrop-removal function. The first validation run failed on `desk-straight: missing source backdrop`.

The scripts now consistently consume the existing PixelLab URL/crop manifest and the existing magenta extraction implementation. `source-images.mjs` validates PixelLab URLs and provides the same cached path to preparation, recording, rotation acceptance and validation. The unused local-source/backdrop format was removed. Running the full source and atlas preparation pipeline reproduces all 216 public atlases byte for byte, preserving the six earlier material fixes.

No catalog definitions, avatar artwork, rendering behavior, footprint geometry, grid size, collision rules, placement layers or ownership data were changed. The 16px placement raster and 32px structural grid remain intact. A comparison with the pre-revision geometry snapshot preserved all 864 display bounds and placement-cell sets.

`world-asset-artwork.ts` derives displayed height from rotated raster depth plus a shared elevation. This makes the source projection particularly important: a high-resolution sheet with equal-looking front and side legs can still acquire unequal leg lengths when mapped into the world. Replacement source views must be reviewed through this mapping before acceptance. The current projection and its remaining proportion issues have not been silently changed.

## Verification

- Full source extraction and atlas reconstruction passed; all 216 public PNG hashes match the retry baseline.
- `pnpm assets:world:check` passed for 72 objects, 216 designs and 864 frames, including source crops, transparency, atlas bounds and distinct material variants.
- All 147 targeted client tests and 12 server catalog/build-editing/movement tests passed.
- Lint, workspace type checks and client/server/landing production builds passed. The standalone gallery build emitted its existing chunk-size warning.
- Playwright rendered every design and direction in both themes. Native reviews are in `artifacts/world-assets/native/`; final gallery captures are in `artifacts/world-assets/displayed/`.
- Playwright against the existing client at `http://127.0.0.1:5173` passed at 1440×1000, 390×844, 320×568 and 844×390. Desktop checks include gaming-desk rotations/placement, all build categories, keyboard variants, collision rejection, moving/removing objects, rarity filtering and both themes. Mobile checks include standing-desk purchase, inventory, material selection, rotations and touch placement. Screenshots and results are in `artifacts/world-assets/polish/`.

An intermediate mobile gaming-desk purchase probe could not find an enabled purchase action because the fixture account lacked sufficient coins. The final mobile flow uses the affordable standing desk; gaming-desk placement is covered on desktop. This was a fixture limitation, not a product change.

Browser checks use an isolated `DemoStore` and the real `WorldRuntime` against the running client. They do not verify live authentication, PostgreSQL persistence, live multiplayer sessions or native desktop/Android applications. Passing technical checks does not resolve the visual findings above. Maximum-quality generation capacity and a further generate/review/integrate pass are still required to complete the task.
