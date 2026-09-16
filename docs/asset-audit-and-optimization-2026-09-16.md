# Asset audit and image optimization

The catalog contains **295 distinct assets, 885 designs and 4,620 directional frames**. All catalog designs have artwork. Three games are displayed as unavailable in Shop; the floor portal is not a placeable Shop item. The 30 floor materials belong to Shared Build and are excluded from personal Shop. These are placement and purchase rules, not missing images.

## Where additions would help

| Category | Assets | Designs | Purchasable in personal Shop |
| --- | ---: | ---: | ---: |
| Desks | 30 | 90 | 30 |
| Seating | 30 | 90 | 30 |
| Tables | 30 | 90 | 30 |
| Plants | 26 | 78 | 26 |
| Outdoor | 27 | 81 | 27 |
| Decor | 33 | 99 | 33 |
| Equipment | 14 | 42 | 11 |
| Floor types | 30 | 90 | 0 |
| Floor decor | 10 | 30 | 10 |
| Storage | 10 | 30 | 10 |
| Lighting | 10 | 30 | 10 |
| Breakroom | 10 | 30 | 10 |
| Food | 24 | 72 | 24 |
| Infrastructure | 11 | 33 | 10 |

The next additions should broaden what players can create. Another large batch of desks, chairs, floor materials or ordinary potted plants has less value than filling the gaps below. Plants already include six tabletop options, plus the desk plant, terrarium and succulents in Decor.

| Priority | Addition | Suggested first batch | Reason and implementation scope |
| --- | --- | --- | --- |
| 1 | Drinks | Six: matcha, bubble tea, iced coffee, lemonade, smoothie and a soda can | Food has 24 dishes, while the separate Decor entries provide a coffee mug and tea set. Use the existing tabletop placement. Rename Food to Food & drinks when these exist. |
| 1 | Interactive toys | Four: dancing wind-up robot, paper-plane launcher, miniature weather globe and tabletop drum pads | Only four dedicated special props exist: confetti, bubbles, fortune and break wheel. These additions would introduce distinct responses; the shared activation/effect system provides a starting point. New effects still need implementation. |
| 2 | Hobbies and wellness | Six: easel, guitar stand, upright piano, paint palette, yoga mat and meditation cushion | These room themes are absent as categories. Some foundations already exist, including music and sewing desks, so add complementary objects before more workstations. Start with artwork; any music or exercise interactions are separate work. |
| 2 | Food variety | Four to six: salad, fruit platter, falafel and hummus, pasta and a bread basket | Existing dishes already cover substantial East Asian, German and American variety. Add different silhouettes and everyday snacks instead of more similar bowls. |
| 2 | Lighting | Three to four tabletop designs, such as a task light, candle lantern and stained-glass lamp | All ten Lighting entries stand on the floor. Decor has a desk lamp, candles and the animated jellyfish lamp; more small lamps would make workspaces more varied. |
| 3 | Wall decor | An eventual set of prints, clocks, shelves and signs | This is a useful missing category, but placement currently supports ground, floor and surfaces, not wall attachment. Implement wall anchors and occlusion before creating wall-only art. |
| 3 | Outdoor variety | Rock garden pieces, a bird feeder and a small bridge | Outdoor already has 27 entries, including trees, shrubs, water and seasonal foliage. Hardscape and garden activity offer more variety than additional similar trees. |

There are six assets with animated atlases: wind chimes, pinwheel, kinetic mobile, jellyfish lamp, rocking bird and miniature windmill. Pool, pond and fountain water use renderer effects, and the four special props animate when activated; those should not be mistaken for missing sprite animations. The existing desk fan and hourglass are good candidates for a later animation pass.

No assets or categories were added during this audit. Recommendations are proposals, not claims of implemented functionality. Future artwork should continue through the established Blockbench workflow.

## Delivery changes

The PNG atlases and editable source models are retained. Gameplay and avatar loading now resolve to content-addressed **lossless WebP** copies. Visible RGB, every alpha value, dimensions and avatar depth data are checked against the originals. Fully transparent RGB values are immaterial to rendering and are excluded from the RGB comparison.

| Full-resolution images | Files | PNG bytes | WebP bytes | Reduction |
| --- | ---: | ---: | ---: | ---: |
| World assets | 885 | 45,933,277 | 16,609,054 | 63.84% |
| Architecture | 3 | 34,113 | 3,556 | 89.58% |
| Avatar layers | 172 | 77,270,694 | 34,166,016 | 55.78% |
| Total | 1,060 | 123,238,084 | 50,778,626 | 58.80% |

These totals cover the complete inventory, not the bytes loaded on every visit. The client continues to request the images it needs.

Build, Shop and other `AssetShape` consumers use dedicated previews, one per design and rotation, with a maximum dimension of 128 pixels. An animated prop's preview contains its first frame for that direction. Gameplay keeps its full atlas and animation. Preview downsampling reduces decoded pixels as well as transfer size; full-resolution WebP alone does not reduce GPU texture memory or guarantee higher frame rates.

For the 264 items displayed in personal Shop, including the three unavailable games, previews in the default design and direction reduce image bytes from **13,888,215 to 2,055,884 (85.20%)** and decoded pixels from **252,356,496 to 3,110,132 (98.77%)**. This is a consistent inventory comparison, not a claim that the Shop loads every category at once. There are 3,540 directional preview references; identical encoded images are shared, leaving 4,454 distinct delivery files including full atlases.

The PNGs remain in their existing public directories, so the checkout and deployment contain originals as well as delivery copies. The application requests the delivery copies. Filenames contain a digest of the encoded bytes, and the Nginx configuration caches these immutable files for one year. Missing optimized files return an error; there is no format fallback path.

## Format selection

Six representative atlases were compared: sushi, croton, wood flooring, animated windmill, an avatar head and a complex hair/hat layer. Lossless WebP was smaller than both the original PNG and lossless AVIF in every sample. All three tested lossless encodings preserved visible RGB and alpha. This comparison does not establish that AVIF is worse for photographs or other artwork.

In the desktop Chromium sample, full-resolution WebP decoding was slower than the original PNG: the gain is transfer size, not faster full-atlas decompression. The loaders await [image decoding](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode) before drawing into a canvas or creating a texture. Small catalog previews address decode and rendering cost by reducing image dimensions. Decode results are local measurements, not physical-device or network benchmarks.

The lossless requirement matters particularly for avatar layers: the lower half of each atlas stores depth values used when composing clothing, faces and hair. Lossy image compression could alter which component appears in front.

Encoder options follow [Sharp's image output documentation](https://sharp.pixelplumbing.com/api-output/). [WebP's compression documentation](https://developers.google.com/speed/webp/docs/compression) describes its lossless RGB and transparency support. Size and quality conclusions above come from the project's own images.

## Regeneration and checks

```powershell
pnpm assets:audit
pnpm assets:optimize
pnpm assets:optimize:check
```

`assets:optimize` reuses unchanged outputs, generates lossless full atlases and resized previews, and writes the source and runtime manifests. Superseded delivery files from the previous manifest are removed; original PNGs are never modified. The regular world and character generation commands also run optimization. After directly invoking a Blockbench generation/import script, run optimization before building.

Every client production build verifies source hashes, preview frame metadata, referenced files and content hashes. This also runs in the client Docker build. `assets:optimize:check` additionally decodes and compares full-resolution pixels and every preview against its expected crop and resize.

Implementation: `scripts/images/`, `apps/client/src/optimized-images.ts`, the world and avatar image loaders, and `AssetShape`. Catalog geometry, footprints, scale, interaction regions and animation timing are unchanged.

## Verification and limits

- All 1,060 original PNG hashes are unchanged.
- Full pixel verification passed for all 1,060 WebP atlases, including avatar color/depth data, and all 3,540 preview crops.
- The Blockbench artwork audit passed for 295 catalog assets and three architectural assets, including frames, calibrated footprints and transparent borders.
- 469 focused client/server tests passed. This includes every asset's designs and rotations, placement, texture lifetime, decode failure/retry, avatar composition, customization and animations.
- 36 production-client browser checks passed: world textures, every personal Shop category, a 390 × 844 viewport, all 20 avatar motion/direction combinations, and a mixed outfit saved and reloaded in the isolated test store. The client requested optimized WebP files, with no original PNG requests in these image groups.
- Visually inspected 48 side-by-side original/preview views at 64 pixels, plus the production world, Shop and avatar editor screenshots.
- Workspace lint and typechecks passed; the final client production build passed. The existing large-chunk warning remains.
- An incremental optimization run converted zero originals and reused the checked delivery files.

Browser checks used Chromium and an emulated mobile viewport, not physical Android/iOS devices, Firefox or Safari. API and WebSocket requests used an isolated test workspace; deployed multiplayer networking and database persistence were not exercised. Nginx cache headers and the Docker image were not run because the local Docker daemon is unavailable. No development servers were started.

Originals are intentionally still shipped in the public directory. Storage size increases even though the application's image transfers shrink. Full gameplay texture dimensions are unchanged, so GPU memory savings are limited to catalog previews; no frame-rate improvement is claimed.

## Evidence

- [Inventory and category details](../artifacts/image-optimization-2026-09-16/inventory.json)
- [Format sizes and pixel comparisons](../artifacts/image-optimization-2026-09-16/formats/benchmark.json)
- [Browser decode measurements](../artifacts/image-optimization-2026-09-16/browser-decode.json)
- [Original and preview comparison](../artifacts/image-optimization-2026-09-16/preview-comparison.html)
- [Production client checks](../artifacts/image-optimization-2026-09-16/runtime/checks.json)
- [Original PNG hashes before conversion](../artifacts/image-optimization-2026-09-16/originals-before.json)
- [Original preservation check](../artifacts/image-optimization-2026-09-16/preservation.json)
- [Download and pixel totals](../artifacts/image-optimization-2026-09-16/savings.json)
