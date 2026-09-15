# Blockbench production migration

The [player avatar refinement](avatar-anime-refinement-2026-09-15.md) rebuilds anime faces, hair and clothing details, adds six hairstyles, and verifies the expanded 156-atlas character inventory. The original migration results below remain a historical record.

The [visual refinement follow-up](blockbench-visual-refinement-2026-09-15.md) expands the audit to the sign-in illustration and obsolete character metadata, improves arcade visibility and avatar previews, and records fresh inventory, browser and placement checks.

The [September 15 follow-up audit](blockbench-asset-audit-2026-09-15.md) found missing architectural artwork and rendering/footprint mismatches despite complete catalog coverage. It adds native walls, door thresholds and windows, corrects directional exports and tabletop placement, and records fresh browser and persistence checks. The earlier review results below describe the original migration.

## Coverage

All 81 catalog assets use the Blockbench pipeline: 243 material designs, each with four native directional views. The public game artwork inventory contains those 243 world atlases, three architecture atlases and 156 character component atlases. The sign-in illustration is composed from these production assets. The separate corporate brand mark remains a UI asset. No previous character PNGs, painted world sources, portrait pipeline or PixelLab generation/import code remains in production.

| Catalog category | Assets |
| --- | ---: |
| Desks | 9 |
| Seating | 10 |
| Tables | 8 |
| Plants | 7 |
| Outdoor | 7 |
| Decor | 14 |
| Equipment | 8 |
| Surfaces | 4 |
| Storage | 5 |
| Lighting | 4 |
| Breakroom | 4 |
| Infrastructure | 1 |
| **Total** | **81** |

The approved shoji screen, tea cart and sakura planter retain their models and materials. The complete catalog shares their cel shading and calibrated grid projection. The migration adds a lucky cat, koi pond and tatami mat, and includes the PR tray in native generation. Distinct geometry covers desk shapes, seating, plants, cabinets, equipment and appliances. Pools, ponds and fountains animate in the world renderer.

Characters use 120px native frames, twice the chibi prototype's linear pixel count. Twelve hairstyles and six faces, tops, bottoms, footwear styles and headwear choices are available, alongside both genders and four body fits. A single depth-based composition path serves avatar creation, option previews, portraits and world players. All 19,968 component frames include idle, walk, sit, listen and sit-listen in four directions. Side views use a three-quarter angle to preserve readable faces; fitted hats cover tall hair crowns.

## Original migration review

Screenshots and machine-readable reports are under `artifacts/blockbench-migration`.

[Avatar creator](../artifacts/blockbench-migration/creator-mixed.png) · [Live world](../artifacts/blockbench-migration/saved-world.png) · [New materials](../artifacts/blockbench-migration/new-materials.png) · [Corrected seating](../artifacts/blockbench-migration/seating-backless/seating-contact-sheet.png)

- Native world validation: complete catalog and material coverage, all 972 rotations, transparent borders, model provenance and six pixels per world unit on both ground axes.
- Playwright catalog review: every material and rotation at one world unit per CSS pixel, with separate base-material sheets for close inspection.
- Native character generation: 120 editable models; every exported animation/direction checked for clipping and loop closure. Five complete models reopened in Blockbench and their five animation loops verified after loading.
- Composed appearance review: six mixed styles across all 20 motion/direction combinations at 80px and 120px. All 36 hair/headwear pairings inspected from four directions while idle and listening.
- Live creator: selected mixed clothing/hair/headwear, saved through the real API, reloaded the saved appearance, checked all 20 animation/direction combinations, verified mobile layout and reduced motion, then restored the original appearance.
- World state review: keyboard movement in four directions, seating, listening while standing and seated, walking priority, music stopping, all four water rotations and reduced motion.
- Seating review: all 11 seat designs in four rotations on desktop and mobile, 88 cases. Entry, four-frame seated playback, cushion alignment, stable hip anchors and standing verified. All 16 stool/ottoman cases were rerun after the rear-view correction; the combined report and contact sheet use those latest captures.
- Depth review: 24 visible overlap scenarios for crossing players, furniture, desks and seated avatars, comparing actual pixels against the expected and reversed draw order. This includes the corrected rear view on backless stools and ottomans.
- Build/Shop/Inventory: every category, 38px thumbnails, keyboard and pointer materials, four rotations, placement, collision rejection and moving/removing objects. Both themes at desktop, 390x844, 320x568 and 844x390; touch purchase and placement included.
- Added assets: lucky cat, koi pond and tatami each purchased, selected from inventory, placed in all four rotations with all three materials, and removed at all four viewport sizes: 48 placements, with ownership and inventory links verified.
- Character transitions: reactions, waving, high-five effects, all four carried directions, release and saving a changed appearance while seated on desktop and mobile.
- Recovery: injected artwork and save failures, retry, retained drafts and reduced-motion changes at desktop and 320x568.
- Server suite: 614 tests passed, including all character assets, appearance validation/persistence and asset placement tests.
- Client suite: 435 tests passed in the full run; three tests hit five-second timeouts. All affected files passed on focused reruns, with a 15-second timeout for the longer creator test. All 438 tests from that run passed across those runs; 20 final focused checks also passed, including the added backless-seat regression. JSDOM emitted its existing canvas-not-implemented warnings; browser artwork checks used real canvas rendering.
- Release validation, lint, workspace typechecks and production builds passed. Vite reported its existing large-chunk warning.

## Limits

Browser checks used Chromium against the running client and server. Controlled placement, music and carrying scenarios used isolated in-memory workspace data; the creator save/reload used the real active instance. External Spotify playback was not connected for this review. Desktop and Android native builds, physical mobile-device performance and a live server-restart persistence test were not run. Server persistence tests passed.

Every component and frame was validated, and representative mixed appearances were visually reviewed. The expanded inventory's 746,496 possible appearance combinations were not each inspected manually.

See [world asset generation](world-assets.md) and [character rendering](characters.md) for repeatable commands and formats.
