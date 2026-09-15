# World assets

Every catalog asset uses native Blockbench artwork. The catalog contains 87 assets, 261 material designs and 1,404 rendered frames, including animation samples in four directions. This includes desks, seating, tables, plants, ground surfaces, outdoor objects, equipment, tabletop decorations, storage, lighting, breakroom furnishings and portals. Reading benches, low tea tables, bamboo planters, stone lanterns, wind chimes and desk pinwheels extend the Sakura, Matcha and Indigo material set.

Walls, open door thresholds and windows have three additional native atlases and 12 directional views in `public/world-architecture`. They use the same renderer and importer, with their own manifest and model catalog.

## Geometry and rendering

`packages/shared/src/asset-catalog.json` defines 16px placement cells, footprints, support surfaces and interactions. The structural grid remains 32px. Artwork does not redefine collisions, placement ownership, inventory or prices.

Every material has south, west, north and east views corresponding to 0, 90, 180 and 270 degrees. The fixed 45-degree orthographic renderer compensates ground depth after rotation, so both floor axes project to six rendered pixels per world unit. Vertical heights keep their original projection. Each image records its projected ground rectangle; the importer derives explicit display bounds from that rectangle and preserves uniform 1/6 image scale. Ground tiles crop to their exact footprint, while foliage and elevated objects can overhang naturally.

Native Y rotation is negative to match the shared clockwise footprint rotation. The artwork check samples actual pixels at the corner desk/sofa cells and arc lamp base in all four views, so swapped east/west exports fail validation. The lamp's base blocks walking; its overhead reach reserves placement space without blocking players.

Native transparent frames and editable models live in `scripts/world-assets/blockbench`. The importer packs each design into a PNG atlas under `apps/client/public/world-assets`, writes crop/display bounds into `apps/client/src/world-asset-artwork.json` and records local source provenance in `scripts/world-assets/artwork-sources.json`. Build, Shop, Inventory and placed objects all use this manifest. Production loads atlases on demand.

Wind chimes and desk pinwheels have native 16-frame, 1.6-second loops. The exporter samples the Blockbench timeline in all four rotations. The importer uses the union of each direction's visible bounds for every pose, preserving a fixed anchor and scale. Frames are ordered by animation sample, then south/west/north/east. The world ticker advances both the object and its shadow; reduced motion freezes them. Selection includes opaque pixels from every pose, so moving details remain selectable.

Animated atlases pack eight columns and stay within 4096px in either dimension. The chime atlas is 1608×3328 and the pinwheel atlas is 720×1504. Catalog thumbnails use the first pose at the existing 38×38 display size.

Seat height and backrest presence are exported from each model. The avatar's hip anchor follows the cushion height; backrests occlude seated players facing away, while stools and ottomans keep the torso visible. Depth ordering handles players in front of and behind furniture. Pool and pond ripples, moving koi and fountain rings run in the world renderer and honor reduced motion. Existing gong effects remain integrated with the new artwork.

Supporting furniture also exports `surfaceHeight`. Tabletop artwork and previews rise by that height's vertical projection, and pointer placement maps back to the original floor cells. Opaque artwork pixels participate in selection and erasing. Walls repeat 32-unit textures with cropped ends; door/window artwork uses the existing opening rectangles and collision rules.

## Regeneration

```sh
pnpm assets:world
pnpm assets:world:check
pnpm assets:world:review
pnpm assets:world:ui
```

To rebuild a subset:

```sh
node scripts/world-assets/blockbench/generate.mjs decor-shoji-screen outdoor-koi-pond
node scripts/world-assets/blockbench/import.mjs decor-shoji-screen outdoor-koi-pond
node scripts/world-assets/blockbench/generate.mjs --architecture
node scripts/world-assets/blockbench/import.mjs --architecture
```

Generation opens Blockbench's web app with Playwright using the project's installed Chromium. It needs internet access but starts no development server. The importer and artwork check operate locally. Generated `.bbmodel` files can be opened directly in Blockbench; persistent changes belong in the source model modules because regeneration replaces outputs.

The artwork check requires exact catalog/variant coverage, four native views, textured model faces, calibrated footprints, transparent borders, visible material differences, support/cushion heights and backrest metadata. It checks both catalog and architecture artwork. The Playwright review uses the existing client at `http://127.0.0.1:5173`, captures the live world and creator, and draws every material/rotation at one world unit per CSS pixel on the placement grid. `--catalog --base` produces compact base-material sheets. Screenshots are written to `artifacts/blockbench-migration`.

The UI check uses the running client with isolated in-memory workspace data to exercise Build and Shop/Inventory previews and placements. Asset tests cover texture loading/disposal, atlas bounds, selection previews, placement, rotations and collision rules. See [the follow-up audit](blockbench-asset-audit-2026-09-15.md) for browser collision, elevated placement and real server reload checks, including repeatable commands and limitations.
