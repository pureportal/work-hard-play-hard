# Plants and food refinement — September 16, 2026

Added 24 Blockbench assets: six indoor plants, six outdoor plants and twelve dishes. Rebuilt twenty assets from the previous collection after inspecting their artwork. The catalog now contains 295 assets, including 26 Plants, 27 Outdoor and 24 Food entries.

| Collection | Additions |
| --- | --- |
| Indoor | Chinese money plant, spider plant, coral anthurium, ZZ plant, echeveria rosette, painted croton |
| Outdoor | Italian cypress, date palm, ginkgo, flowering dogwood, boxwood cluster, pampas grass |
| Food | Bibimbap, onigiri, shrimp tempura, gyoza, currywurst and fries, cheese spaetzle, apple strudel, pepperoni pizza, tacos, hotdog, strawberry waffle, strawberry shortcake |

Each addition has three designs and four rotations. Indoor planters retain terracotta, fluted porcelain and woven basket designs. Outdoor vegetation uses seasonal foliage; dishes use celadon, indigo and clay tableware. Food remains tabletop decoration. All additions appear in the catalog and Shop.

## Rebuilt artwork

The review covered all 32 plants and dishes from the previous garden/food collection and all 24 additions. Twelve earlier assets were retained; twenty were rebuilt:

| Assets | Correction |
| --- | --- |
| All ten earlier indoor plants | Replaced closed planter tops with hollow vessels and visible soil. |
| Snake plant, fern, rubber tree, calathea, orchid, peace lily, aloe | Replaced oval leaf primitives with curved, pointed foliage. Added fuller rubber-tree and calathea silhouettes; connected fern leaflets to their ribs. Calathea markings follow the leaf surface. |
| Maple, pine | Added lobed maple foliage, coherent seasonal colors and branching pine sprays. |
| Willow, agave | Rebuilt pendant leaves and pointed rosette blades. |
| Hydrangea, lavender | Added rounded flower clusters and denser lavender foliage and blossoms. |
| Bento | Packed rice fills its compartment; broccoli has separate florets. |
| Dim sum | Spaced the dumplings and raised their pleated folds above the dough. |
| Pretzel | Rebuilt the twist with three openings. |
| Burger | Replaced the intersecting bun sphere with a dome so the filling remains visible. |

The first new render pass also prompted revisions to bibimbap ingredients, gyoza folds, currywurst sauce and strudel sugar. Final model files and atlases replace the rejected versions. Earlier screenshots are retained only as review evidence.

## Verification

- Created native models and renders in the running Blockbench desktop editor, version 5.1.6. The new porcelain croton was reopened in the editor to inspect its editable geometry and materials.
- Exported 132 final models and atlases across the 44 added/rebuilt assets, with 528 directional views.
- Captured all 56 reviewed assets in the game renderer: 168 designs and 672 directional views at the default 0.78 zoom. Visually inspected all fourteen unscaled contact sheets, enlarged model previews, and targeted before/after comparisons.
- Kept the existing 16-unit placement raster, six render pixels per world unit, support heights and cardinal projection. Existing catalog footprints were preserved.
- `pnpm assets:world:check` passed: 295 assets, 885 designs and 4,620 frames, plus the three architectural assets. This includes editable models, texture coverage, atlas borders, rotation metadata and calibrated footprints.
- 100 focused tests passed: 41 client artwork, texture, placement, targeting and orientation tests; 59 server catalog and placement tests.
- Fourteen browser checks passed across the tempura and croton runs: catalog listings, purchase price, design selection, tabletop/floor placement, ownership after reload and mobile Food navigation.
- Workspace typechecking and client/server production builds passed. Lint passes for the changed generation and review scripts.

The first part of the gameplay review used the running client. The final refined assets and croton purchase were verified against the production build through Playwright request routing after live-client capture timeouts. Both modes used the real in-memory world runtime and isolated test fixtures. No development servers were started and no production data was seeded.

## Remaining checks

Whole-workspace lint still reports an unused `LayoutEdit` import and an unreachable `break` in `apps/server/src/world/world-runtime.ts`, which was changing independently during this task. A broader runtime test run passed twelve tests and failed the existing `decor-laptop` shared placement test in `world-runtime.assets.test.ts:128`; the runtime now rejects its `layout.apply` command with `PROJECT_APPROVAL_REQUIRED`. Those unrelated edits were left intact.

Deployed multiplayer networking and database persistence were not exercised. Browser coverage is Chromium with an emulated 390 × 844 mobile viewport. Production builds retain the large-chunk warning.

## Evidence

- [Review gallery and before/after comparisons](../artifacts/plant-food-refinement-2026-09-16/index.html)
- [Gameplay coverage](../artifacts/plant-food-refinement-2026-09-16/gameplay/coverage.json)
- [Final visual decisions](../artifacts/plant-food-refinement-2026-09-16/visual-review.json)
- [Food purchase](../artifacts/plant-food-refinement-2026-09-16/shop/checks.json)
- [Plant purchase](../artifacts/plant-food-refinement-2026-09-16/shop-plant/checks.json)
- [Artwork audit](../artifacts/plant-food-refinement-2026-09-16/artwork-check.log)
- [Runtime test limitation](../artifacts/plant-food-refinement-2026-09-16/runtime-tests.log)

Source geometry lives in `scripts/world-assets/blockbench/garden/`, `food/` and `food.cjs`. The gallery can be rebuilt with:

```powershell
node scripts/world-assets/blockbench/category-sheets.mjs --output=artifacts/plant-food-refinement-2026-09-16
node scripts/world-assets/blockbench/collection-report.mjs --output=artifacts/plant-food-refinement-2026-09-16
```
