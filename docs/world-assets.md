# World assets

The [2026-09-13 anime audit](world-assets-anime-audit.md) found that the catalog still falls short of the revised avatar style. Recreation is blocked by the remaining PixelLab balance; no new artwork was accepted in the retry. The technical checks below do not constitute anime-style approval.

The catalog contains 73 assets and 219 designs. Every design has south, west, north and east artwork, in the same order as rotations 0, 90, 180 and 270 degrees. The [work objects](work-objects.md) add interactive notes to whiteboards and a checklist board that reuses the existing whiteboard artwork.

The added storage, lighting and breakroom categories complement the existing office, lounge, outdoor and tabletop assets. Rarity belongs to the asset design; the three material choices remain variants of that asset. Build and Shop can filter by category and rarity, and their variant controls show the same artwork as the world.

## Geometry and rendering

`packages/shared/src/asset-catalog.json` remains the authority for 16px raster cells, support surfaces, interactions, placement layers and collision. The building structure retains its 32px grid. Artwork does not create collision rectangles or change ownership, inventory or server placement validation. The original 31 asset footprints and placement rules are retained.

`apps/client/src/world-asset-artwork.json` describes locally served PNG atlases. Each design records its atlas width and height and four absolute crop rectangles. Directional crops are packed horizontally with transparent gutters, without resizing source pixels. The complete catalog uses approximately 115 MiB of decoded RGBA pixels, down from 172 MiB with square atlas cells. These figures describe the whole catalog; the renderer loads designs on demand.

Furniture, cabinets, appliances and ground surfaces map to their rotated footprint, with a common vertical overhang. Upright fixtures retain narrow profiles where the source permits. Every sprite is centered on its footprint and anchored to its lower edge. Ground artwork has no overhang or object shadow. Objects within each placement layer draw from rear to front using their footprint's lower edge, with surface decorations above furniture.

Pixi textures use linear minification for small details and nearest-neighbor magnification. SVG selection previews use browser downsampling and the same crop and display bounds in their existing 38px controls. Design radios support arrow keys, Home and End, with one tab stop.

Placement previews use the same artwork with cell and direction overlays. Loaded atlases and directional textures are shared across placed objects and previews. Cached frames appear synchronously when rebuilding a scene or changing rotation; teardown disposes their textures. A failed image load exposes a reload action. Gong celebrations animate the artwork and retain the expanding rings and confetti.

## PixelLab sources

Artwork was generated through PixelLab MCP on Tier 2, using the Pro model at its maximum square canvas of 512px. Four-view sheets and source sheets retain those original PNGs. Native V3 rotations reuse Pro artwork at the rotation tool's maximum 256px resolution. They do not use a newly generated Flash first frame. Some wide Pro sheet crops exceed 256px and are retained at their original resolution.

The base artwork and directional repairs come from PixelLab. Most color variants are material palette transformations of those reviewed images, preserving silhouettes, outlines and small details. Wood, stone and grass floor materials have separate Pro artwork sets. The three color variants are not separate generation requests for every asset.

The September 13 polish used two 512px Pro edits, reviewed before integration. The standing desk now has a sage laminate finish, beveled highlights and clearer adjustable legs. The desktop monitor's west and east views now show a slim panel consistent with its front; its back includes the stand mount. Their three material variants were rebuilt from the refined sources. The monitor's ivory and coral variants preserve its blue glass while recoloring the casing.

`scripts/world-assets/generations.json` records generation jobs, source crops and review decisions, including rejected attempts. `artwork-sources.json` is the canonical selection of reviewed frames; an asset can use different source jobs for individual directions when a repair replaces a poor result. Raw downloads are cached by URL hash in `raw/`. Native cropped frames live in `directions/`, and assembled source reviews in `sheets/`.

## Preparing and checking artwork

After reviewing a generation at native size, record its four source URLs and crop rectangles with `record-artwork.mjs`. For a complete reviewed native rotation set, `accept-rotations.mjs` records the four cardinal URLs from the generation ledger.

```powershell
node scripts/world-assets/prepare-images.mjs
node scripts/world-assets/prepare-artwork.mjs
pnpm assets:world:check
pnpm assets:world:review
pnpm assets:world:ui
```

The preparation commands accept optional asset IDs to rebuild a subset. They remove the magenta backdrop and trim transparent margins; they do not scale source artwork. Review guides are inputs for PixelLab edits, not finished directional artwork.

The image check requires complete catalog and variant coverage, four nonempty frames per atlas, cached PixelLab sources with valid native crop coordinates, transparent padding, no opaque backdrop pixels and distinct color variants. Palette variants must change at least 2% of visible pixels in each direction by a meaningful RGB difference; separately generated floor materials must have distinct frames. The check also runs as part of `pnpm check`. Background extraction targets the magenta hue range, preserving violet artwork details.

The review command builds native contact sheets in `artifacts/world-assets/native/` and a Playwright gallery that intercepts local file requests without starting a server. It renders every direction on the placement raster and all 38px variant previews in light and dark themes. Screenshots are saved under `artifacts/world-assets/displayed/`; successful capture also requires visible canvas content and no image-loading or browser errors. Rows expand to include large assets without overlapping or clipping neighboring previews.

The UI command uses Playwright against an already running client at `http://127.0.0.1:5173`, or `WORLD_ASSET_URL`. HTTP and WebSocket traffic for workspace data uses an isolated `DemoStore` and the real `WorldRuntime`, with public-room placement enabled in the fixture. It exercises desktop Build and mobile Shop/Inventory controls without changing saved workspaces. Screenshots and the verification report live in `artifacts/world-assets/polish/`. Games are closed before static checks, and screenshot capture finishes CSS transitions.

Server catalog tests cover every asset, variant and rotation, collision cells, surface decorations, ground layers and representative seats. Client tests cover atlas bounds, texture loading and disposal, previews and selection controls. Visual review remains necessary for generated geometry and material consistency; automated coverage cannot judge those qualities.

## Verification on 2026-09-13

The catalog was confirmed at 72 assets, 216 designs and 864 directional frames. Source review covered the four cardinal views of all 72 base designs. The new desk and monitor frames were also reviewed after background extraction. The 16px JSON footprints and the 32px structural grid were retained.

The client suite passed 314 tests. The server suite passed 419 tests with two workers on rerun; its first run, concurrent with the client suite, hit one five-second realtime test timeout. Existing character preview tests print non-failing jsdom canvas warnings. Asset tests cover crop bounds, loading, cached frame reuse, disposal, depth order and keyboard selection.

Release validation, artwork validation, lint, type checks, and client/server/landing builds passed. The Playwright gallery rendered every directional frame and every 38px material preview in both themes. Application checks passed at 1440×1000, 390×844, 320×568 and 844×390, covering categories, rarity filters, material selection, rotation, placement, collisions, moving/removing assets, and touch purchase-to-placement. The existing static production UI and landing checks also passed.

Browser verification uses fixture sessions. Live authentication, persisted multiplayer sessions, native desktop builds and Android builds were not exercised. Generated pixel art still has minor stylistic variation between catalog families, and most material variants remain palette-derived.
