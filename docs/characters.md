# Characters

The avatar creator and every in-game portrait use the same Blockbench chibi character. Appearance options include six faces, fourteen hairstyles, eighteen tops, eighteen bottoms, eighteen footwear styles and eight headwear choices. Clothing pieces can be mixed independently. Saved appearance fields are validated by the server and published to connected players.

## Artwork and animation

`pnpm assets:characters` builds 172 component designs from native Blockbench geometry and installs them in `apps/client/public/characters/blockbench`. All appearances share one body, with one component per outfit. Each component has all four directions and five animations: idle, walk, sit, listen and sit-listen. The game displays an 80px sprite canvas from 120px native frames. Left and right views use a three-quarter angle so the face remains visible.

The statement wardrobe adds 30 interchangeable pieces across cyber, pirate, astronaut, dragon, jester, frog, biker, velvet, starlight and sunset styles. It includes shoulder horns, frog slippers, curled jester shoes, a corset, a halter, a crop top and skirts. Geometry lives in `body.cjs`, `statement-tops.cjs`, `statement-bottoms.cjs` and `statement-shoes.cjs`; materials live in `customization.cjs`.

The designer scrolls its option grid vertically and its category tabs horizontally. Short windows scroll the studio while keeping save and cancel visible. Narrow layouts stack the preview above the options, and touch controls have a minimum 44px target.

Faces use shaped lashes, layered irises, catchlights, blush and expression-specific brows. Hair cuts have distinct fringes, napes and lengths; their highlight meshes follow the locks. Warm key light and cool fill produce cel shading. Garment details are attached to the rig and fitted with the body so collars, straps and trim stay aligned during motion.

Concave detail patches are triangulated in their dominant plane to prevent overlapping triangles. Idle breathing moves the torso without stretching or rotating the head, keeping facial features stable on the pixel grid.

The traveler jacket has an independently animated scarf, and the pearl braid has its own swinging bone. Both follow all five existing motions. The festival haori, indigo hakama and tabi sandals can mix with every clothing family. Blossom clips and goggles are generated for all fourteen hairstyles.

The generator writes editable `.bbmodel` files and a manifest in `scripts/characters/blockbench`. Models include native animation keyframes, textures and the complete rig. Generated files are overwritten on regeneration; geometry and material changes belong in the source modules.

Each 960x3840 PNG stores a 960x1920 color atlas above a matching 16-bit depth atlas. The renderer combines head, upper body, lower body, shoes and hair/headwear by depth at each pixel. This preserves hair, sleeves, hats and bent-leg overlap from every direction. Portraits and option thumbnails crop the composed animation atlas; there is no separate portrait pipeline.

| Motion | Frames | Frame duration | Atlas rows | Columns |
| --- | --- | --- | --- | --- |
| Idle | 4 | 400ms | 0-3 | 0-3 |
| Sit | 4 | 400ms | 0-3 | 4-7 |
| Walk | 8 | 100ms | 4-7 | 0-7 |
| Listen | 8 | 200ms | 8-11 | 0-7 |
| Sit & listen | 8 | 200ms | 12-15 | 0-7 |

Within each block, direction rows are front, left, right and back. Standing feet anchor at (60,114); seated hips anchor at (60,78). Seating elevation comes from the furniture model's cushion height. Carried players retain the seated pose and the carrier's facing direction. Walking takes precedence over music; seated listeners keep bent legs. Active music presence selects a listening animation, and stopped or expired presence restores idle or sit. Reduced motion freezes character and water playback.

Decoded component and composed-character caches are bounded. Identical Pixi characters share a texture source that is released after the last player using it is destroyed. Removing one player cannot invalidate another player's artwork. Failed loads retain a retry path and prevent saving an unavailable preview.

## Verification

```sh
pnpm assets:characters:review
pnpm e2e:characters
node scripts/characters/blockbench/appearance-review.mjs
node scripts/characters/blockbench/creator-review.mjs
node scripts/characters/blockbench/face-review.mjs
pnpm --filter @workhard/server exec tsx ../../scripts/characters/blockbench/expansion-check.ts
pnpm --filter @workhard/server test -- src/avatar
pnpm --filter @workhard/server exec tsx ../../scripts/characters/playwright-states.ts chair-office chair-stool sofa-corner chair-beanbag outdoor-bench
pnpm --filter @workhard/server exec tsx ../../scripts/characters/playwright-depth.ts
```

The review opens generated models in Blockbench, checks native animation loops and captures coordinated and mixed appearances in the running client at 80px and 120px. It includes all 30 statement wardrobe models. It also captures all 112 hair/headwear pairings with and without headphones in four directions. Asset tests check all 172 layers and 22,016 component frames for coverage, transparency and clipping, and require the manifest, PNGs and editable models to match the current inventory. Composition tests exercise depth ordering independently of layer loading order.

The live creator check signs in to the existing demo instance, saves a mixed appearance, reloads it, checks all 20 motion/direction combinations and mobile layout, then restores the original appearance. The world state check uses an isolated in-memory workspace with the running client to exercise movement, seating, injected music presence and moving water. Neither command starts a development server. External Spotify playback requires a connected account and is separate from the injected presence checks.

Screenshots and reports are in `artifacts/blockbench-migration`. See [the migration record](blockbench-migration.md).

The anime refinement uses `artifacts/avatar-anime` for its before/after captures. The initial expansion uses `artifacts/asset-expansion`. The creator review checks all 328 directional option previews and saves/reloads eight appearances, comparing its preview with the actual game texture. It checks that saved data contains only current selections and that every outfit resolves to its shared top. It restores the initial saved appearance when the review finishes.

The statement wardrobe check uses an isolated fixture and the running client. It selects all 30 new pieces, saves and reloads ten appearances, compares their game textures with the creator, and checks animation playback, scrollbars, keyboard navigation and compact layouts. Screenshots and reports are in `artifacts/character-expansion`.
