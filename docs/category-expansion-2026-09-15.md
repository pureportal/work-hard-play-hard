# Game asset category audit — September 15, 2026

The catalog grew from **110 to 231 distinct assets**, with **121 additions**. Every Build and Shop category has at least 10 entries. Desks, Seating, Tables, Decor and Floor Types each have 30.

## Counts

Counts represent catalog objects or flooring materials. Selectable materials, patterns, recolors and rotations do not increase the asset count.

| Category | Assets before | Assets after | Target | Designs after |
| --- | ---: | ---: | ---: | ---: |
| Desks | 9 | 30 | 30 | 90 |
| Seating | 11 | 30 | 30 | 90 |
| Tables | 9 | 30 | 30 | 90 |
| Plants | 8 | 10 | 10 | 30 |
| Outdoor | 7 | 10 | 10 | 30 |
| Decor | 16 | 30 | 30 | 90 |
| Equipment | 8 | 10 | 10 | 30 |
| Floor Types | 24 | 30 | 30 | 90 |
| Floor Decor | 3 | 10 | 10 | 30 |
| Storage | 5 | 10 | 10 | 30 |
| Lighting | 5 | 10 | 10 | 30 |
| Breakroom | 4 | 10 | 10 | 30 |
| Infrastructure | 1 | 11 | 10 | 33 |
| **Total** | **110** | **231** | | **693** |

Infrastructure includes the existing system portal and 10 new placeable fixtures. The portal stays outside Build and Shop, so both interfaces have 230 entries. Three existing game tables remain unavailable for purchase; they are still visible catalog entries. The audit restored missing Shop entries for the Sakura planter, Shoji screen and Tea cart. Plants, Decor and Breakroom previously had only 7, 15 and 3 Shop entries, respectively; Infrastructure had none. Other Shop counts matched the table, excluding the portal. Full Build/Shop counts are recorded in [counts.json](../artifacts/category-expansion-2026-09-15/counts.json).

### Why these categories received 30

- **Desks and Seating:** the existing game centers on furnished workspaces, with desk surfaces and functional sitting interactions.
- **Tables:** support meeting, social, dining and display arrangements, including smaller objects placed on top.
- **Decor:** supplies the personal objects that distinguish otherwise similar workspaces.
- **Floor Types:** establishes the material and pattern across an entire room and already contained the broadest material collection.

## Collection and integration

The additions have distinct forms and uses: specialist desks, chairs and sofas, low and raised tables, plants, outdoor structures, desk objects, storage, lamps, breakroom furniture and room fixtures. Their three selectable designs remain separate from the distinct-asset totals. The exact additions are listed in [additions.json](../artifacts/category-expansion-2026-09-15/additions.json).

Floor Types gained glass blocks, metal grating, leather tiles, rammed earth, wool felt and seagrass, each with three patterns. Floor Decor gained seven rugs and mats. Flooring stays walkable beneath furniture; decorative coverings remain in Floor Decor and render above flooring. Textile design labels now use Sand, Cocoa and Ivory rather than wood names.

Every addition has catalog pricing, a Shop entry, design definitions, native artwork, placement cells and the supported four cardinal orientations. The system portal remains managed by the existing portal flow.

The audit found no missing catalog artwork files. Restored Shop entries and placement corrections addressed integration issues separately from artwork generation. The sign-in office illustration was regenerated from the production atlases so it also uses the rebuilt coffee table and its actual surface height.

### Placement corrections

- Rotating an object with odd/even footprint dimensions previously accumulated a grid-cell offset. Rotation now returns to the original position after a full turn. The regression covers every catalog asset from every starting orientation.
- Pergola roof cells allow objects and walking beneath them; its four posts remain solid. Placement is checked both before and after adding furniture underneath.
- Occupied desk areas, the jeweler's cutout, nested tables, the kotatsu quilt and the lift table's open well reserve their cells from surface decoration. Surface heights match the rendered geometry.
- New seat interactions match their cushions and orientations. The slat bench has three aligned seats; the chaise has one seat at its upright end.

## Artwork workflow and review

All additions use the established native Blockbench cube/mesh pipeline, its anime palette, rounded forms, outlines and calibrated orthographic views. Source builders live in `scripts/world-assets/blockbench/expansion/` and `flooring/`; generated models remain editable `.bbmodel` files. Generation and import retain the shared grid scale and cardinal orientation mapping.

A representative secretary desk was also opened and compiled through the desktop Blockbench MCP connection. Its 39 elements and 21 textures survived the native round trip; existing editor projects were preserved. Evidence is in [blockbench-roundtrip.json](../artifacts/category-expansion-2026-09-15/blockbench-roundtrip.json).

### Reworked results

The initial review covered all 110 existing assets at gameplay scale in four orientations. Weak existing artwork was rebuilt: the writing desk, round table, coffee table, side table and pearl resin floor. Two existing rug models were regenerated with corrected textile design labels.

New designs were iterated where the in-game results were weak. Changes included a continuous papasan bowl, molded shell chair, tufted sofa, visible music keyboard and computer equipment, clearer glass highlights, an open aquarium and pastry case, readable shoes and wheelbarrow contents, a draped kotatsu quilt, a raised lift-table lid, a clean cloud-rug silhouette, irregular shag tufts, quieter earth texture and continuous grating patterns. Thirty-five assets passed through these correction batches, including the seven existing assets noted above.

### Visual coverage

- **All 121 new assets and seven modified existing assets:** every selectable design in all four supported orientations, totaling **384 designs and 1,536 views** in the running game at its normal 0.78 zoom. These were visually inspected, including the corrected results.
- **Floor materials:** adjacent 3 × 3 fields exposed seams, alignment and repetition. Floor Decor remained a separate layer.
- **New seating:** 120 seat/orientation interactions across 19 assets; screenshots checked seated character alignment and backrest occlusion.
- **Pergola:** the character walked beneath the roof in every orientation while the corner posts retained collision.
- Review sheets retain captured pixel scale; full scenes include the surrounding grid and character. The initial existing-art review is in the `before/` evidence directory. That initial audit inspected each existing asset's base design, rather than claiming a manual review of every unchanged material variant.

The [review gallery](../artifacts/category-expansion-2026-09-15/index.html) includes category sheets and full scenes. [Coverage records](../artifacts/category-expansion-2026-09-15/gameplay/coverage.json), [Build interaction results](../artifacts/category-expansion-2026-09-15/interactions/checks.json) and [seat/clearance results](../artifacts/category-expansion-2026-09-15/occupancy/checks.json) provide per-asset evidence.

## Verification

The complete new collection passed Build selection for all three designs, placement, four rotations, grid alignment, movement and removal. The interaction run covered all 121 additions and reported no browser or artwork errors.

| Check | Result |
| --- | --- |
| Client asset, placement, texture, orientation, preview, design picker, Build/Shop and player inventory suites | 343 tests passed across 10 files |
| Server catalog, placement, flooring, player assets, runtime and economy suites | 160 tests passed across 7 files |
| Native artwork validation | 231 assets, 693 selectable designs and 3,132 frames; 3 structural assets and 12 frames also passed |
| Lint | Passed, with warnings denied |
| Typechecks | Shared package, client, server and landing passed |
| Production builds | Client and server passed |
| Desktop Build | Every category, 38 × 38 previews, keyboard/pointer design selection, placement, collision rejection, rotation, movement, removal and rarity filters passed |
| Mobile Build and Shop | 390 × 844, 320 × 568 and 844 × 390 viewports; all categories, touch purchases, inventory, designs, four rotations, placement, touch targets and both themes passed |
| Floor interaction suite | 32 checks: all 30 materials, 90 design selections, placement/movement/rotation/removal, rug layering, walking, mobile controls and purchase/ownership/reload/return to inventory |
| Live server | Metal grating and desktop aquarium placed, rotated, reloaded and removed; temporary support removed and original objects preserved |

Artwork validation checked editable textured models, exact catalog/design coverage, nonempty frames, calibrated footprints, transparent borders, unclipped native renders, floor opacity/gutters, surface/cushion metadata and existing animation frames. It does not substitute for the visual review above.

The browser checks reused the running client. Bulk catalog and mobile checks used isolated instances of the game's actual store and runtime. The two live persistence checks used the running server. Mobile placement uses a clear fixture room and excludes overlaid controls from its canvas scan. The JSDOM unit environment emits its existing canvas-not-implemented messages; actual canvas rendering was verified in Chromium.

Evidence: [client tests](../artifacts/category-expansion-2026-09-15/client-tests.json), [server tests](../artifacts/category-expansion-2026-09-15/server-tests.json), [navigation](../artifacts/category-expansion-2026-09-15/navigation/verification.json), [floor interactions](../artifacts/category-expansion-2026-09-15/floor-interactions/checks.json), [live floor](../artifacts/category-expansion-2026-09-15/live-floor/live-placement-report.json) and [live aquarium](../artifacts/category-expansion-2026-09-15/live-decor/live-placement-report.json).

The standard checks were `pnpm assets:world:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build:client`, `pnpm build:server`, `pnpm assets:world:ui`, the focused Vitest suites, and the existing floor and live-placement browser scripts. Logs and screenshots are saved alongside the review gallery.

## Limits

Browser coverage uses Chromium and emulated mobile viewports; Firefox, Safari and physical touch devices were not tested. New assets are static. Existing animated assets and their availability rules were retained. Artwork quality was assessed through the actual game captures, separately from automated validation.
