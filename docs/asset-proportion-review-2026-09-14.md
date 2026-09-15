**Asset proportion review · 14 September 2026**

Historical review from before the [completed Blockbench migration](blockbench-migration.md). The production renderer now uses calibrated native bounds.

Three confirmed proportion problems and one uncertain scale judgment. The confirmed problems come from the shared sizing calculation; the affected shapes are already distorted before viewport scaling. This review added documentation, measurements and screenshots only. No application code or artwork was changed.

**1. Rotated assets become excessively narrow — high visual impact**

The whiteboard becomes a hairline when turned west or east. The same problem compresses sofa cushions, laptop screens and book stacks. It appears in both the world placement preview and the catalogue, including all three whiteboard material previews.

| Asset / direction | PNG crop | World dimensions | Rendered width/height ratio divided by source ratio |
| --- | --- | --- | --- |
| Whiteboard, west | 62 × 216 | 16 × 193.35 | 0.288 |
| Whiteboard, east | 63 × 215 | 16 × 193.35 | 0.282 |
| Three-seat sofa, west | 107 × 148 | 32 × 112.49 | 0.393 |
| Laptop, north | 173 × 113 | 32 × 34.45 | 0.607 |
| Book stack, east | 164 × 168 | 16 × 48 | 0.341 |

A ratio of 1 means no aspect distortion. These assets' south-facing crops render without that distortion. The side-facing whiteboard occupies only about 3 CSS pixels of width inside a 38px catalogue preview. Checklist shares the whiteboard geometry and artwork and is affected too.

Screenshots: [desktop placement and catalogue](../artifacts/asset-proportion-review-2026-09-14/whiteboard-clear-preview-1440-west.png), [1024px viewport](../artifacts/asset-proportion-review-2026-09-14/whiteboard-preview-1024-west.png), [390px viewport](../artifacts/asset-proportion-review-2026-09-14/whiteboard-preview-390-west.png), [source versus current rendering](../artifacts/asset-proportion-review-2026-09-14/source-vs-render-rotations.png), [book stack and shelving comparison](../artifacts/asset-proportion-review-2026-09-14/source-vs-render-artwork.png). Placement screenshots show uncommitted previews; red placement indicators do not cause the shape change.

Cause: [world-asset-artwork.ts](../apps/client/src/world-asset-artwork.ts), lines 32–35, derives height from the rotated raster depth plus a single elevation. Furniture fills the footprint width independently. Other objects clamp width with `Math.min` without reducing height when the width limit is reached. [world-asset-textures.ts](../apps/client/src/world-asset-textures.ts), line 23, assigns the two sprite dimensions independently. [AssetShape.tsx](../apps/client/src/components/AssetShape.tsx), line 30, reproduces those proportions through `preserveAspectRatio="none"`.

Affected data includes `equipment-whiteboard`, `equipment-checklist`, `sofa-straight`, `decor-laptop` and `decor-books` in [asset-catalog.json](../packages/shared/src/asset-catalog.json), and their frames/elevations in [world-asset-artwork.json](../apps/client/src/world-asset-artwork.json). For example, inspect the [whiteboard atlas](../apps/client/public/world-assets/equipment-whiteboard/graphite.png) and [laptop atlas](../apps/client/public/world-assets/decor-laptop/graphite.png).

Suggested correction: separate visible artwork bounds from collision footprints and use one uniform scale for each directional crop. Where the existing floor projection needs a different silhouette, author the directional artwork for that projection. Changing only the catalogue CSS would leave the world incorrect; blindly applying containment also needs anchoring and footprint checks.

**2. Upright fixtures change size when rotated — confirmed**

The desktop monitor grows from 25.87 to 41.87 world pixels tall when turned sideways, an increase of approximately 62%. Its source crop height changes only from 152 to 162 pixels. The arc floor lamp shrinks from 64 to 32 world pixels tall, despite source heights of 217 and 206 pixels. The monitor preserves its aspect ratio in both views, so an aspect-ratio-only check would miss this defect.

Screenshot: [all directions at the same world scale](../artifacts/asset-proportion-review-2026-09-14/rotation-size-at-world-scale.png). Read the small “Current shape” columns at 1×; the source columns are enlarged for inspection. The existing placement is visible beside the central desks in the [Studio overview](../artifacts/asset-proportion-review-2026-09-14/studio-1440-people.png).

Cause: the same height calculation uses the swapped depth of a 2×1 monitor footprint or 2×4 lamp footprint. Relevant entries are `decor-monitor` and `light-arc` in [asset-catalog.json](../packages/shared/src/asset-catalog.json), lines 491 and 964, and [world-asset-artwork.json](../apps/client/src/world-asset-artwork.json), lines 2354 and 5000. The lamp's elevation is zero.

Suggested correction: calibrate upright fixtures to a consistent visible height across directions, with explicit anchors or directional bounds. Keep the floor footprint independent of the height of the monitor screen or lamp shaft. Check the result beside the same desk and avatar before and after rotation.

**3. Falling Blocks table is stretched vertically even facing forward — confirmed**

The south crop is 216×184, but it renders at 96×112. At a uniform 96px width it would be approximately 81.8px tall; the current rendering is 37% taller. The screen and casing become taller and narrower together. The rear crop has the same problem, while the side crops preserve their source aspect ratios.

Screenshots: the last row of [source versus current rendering](../artifacts/asset-proportion-review-2026-09-14/source-vs-render-rotations.png), and the placed tables in the Arcade area of the [Studio overview](../artifacts/asset-proportion-review-2026-09-14/whiteboard-clear-preview-1440-west.png).

Cause: `equipment-falling-blocks` has a 6×7 footprint in [asset-catalog.json](../packages/shared/src/asset-catalog.json), line 376, and zero elevation in [world-asset-artwork.json](../apps/client/src/world-asset-artwork.json), line 6666. The width clamp and independently retained height force the [atlas](../apps/client/public/world-assets/equipment-falling-blocks/graphite.png) into that rectangle.

Suggested correction: preserve the crop's ratio and anchor it separately from the interaction/collision geometry. If the intended visual size is actually 96×112, redraw the cabinet for that target without stretching its screen.

**4. Floor-lamp scale varies substantially — design judgment, not a confirmed artwork defect**

Facing south, the crystal lamp is 150.67 world pixels tall, the drum lamp 108.42, and the arc lamp 64. The crystal lamp is 1.39 times the drum lamp's height and 2.35 times the arc lamp's height. This is conspicuous beside the desks and avatars, but a deliberately monumental crystal lamp could explain part of the difference.

Screenshots: [lamp artwork and shared world-scale comparison](../artifacts/asset-proportion-review-2026-09-14/source-vs-render-scale.png), [placed lamps beside desks](../artifacts/asset-proportion-review-2026-09-14/studio-1440-people.png), [catalogue](../artifacts/asset-proportion-review-2026-09-14/catalog-lighting-1440.png).

The crystal and drum crops retain their source aspect ratios. Their different sizes come from the configured footprints and elevations, including 102.67 for the crystal lamp and 76.42 for the drum lamp. See [world-asset-artwork.json](../apps/client/src/world-asset-artwork.json), lines 590 and 4902. Resolve the arc lamp's confirmed rotation problem first, then compare the three against an agreed desk/avatar scale. Do not change the crystal artwork solely on this judgment.

**Verification and scope**

Playwright reused the existing client at `http://127.0.0.1:5173` and API at port 3001. No development service was started or restarted. Live views used existing signed-in accounts; the separate source-comparison page imports the application's current Pixi renderer and AssetShape component and loads assets through the same client service. It does not modify the saved world.

| Area | Viewports / checks |
| --- | --- |
| Sign-in | 1440×1000, 1024×768, 390×844; illustration and uploaded logo |
| Studio | 1440×1000, 1024×768, 390×844, 844×390; placed furniture, avatars and floor assets |
| Rooftop | 1440×1000, 390×844; outdoor assets and furniture |
| Build | Desks, Equipment, Seating, Decor, Lighting and Breakroom; whiteboard rotation and material previews at 1440, 1024 and 390px widths |
| Avatar editor | 1440×1000, 390×844, 844×390; idle full-body and portrait previews, cancelled without saving |
| Zoom / theme | Studio at default zoom and two zoom-out steps; light and dark screenshots |
| Asset data | Dimensions calculated for all 74 assets, 222 designs and 888 directional frames; 12 representative base designs visually compared in all four directions |

`node scripts/world-assets/check-artwork.mjs` passed: **74 assets, 222 designs, 888 directional frames**. This checks image dimensions, crops, transparency and variant coverage; it does not establish good proportions. The final independent Playwright detail capture also passed with no page or artwork errors. See [measurements.json](../artifacts/asset-proportion-review-2026-09-14/measurements.json), [detail verification](../artifacts/asset-proportion-review-2026-09-14/detail-verification.json), and the [capture script](../artifacts/asset-proportion-review-2026-09-14/capture-detail.mjs).

The logo uses `object-fit: contain`; its square artwork was not stretched by the wide sign-in container. Avatar full-body canvases preserved their 3:5 ratio at 180×300 and 120×200 CSS pixels; portrait previews remained square. Catalogue containers measured 38×38 throughout the inspected categories. Uniform world zoom preserved the existing shape defects rather than introducing them. Source preparation crops and packs artwork without resizing it, as shown in `prepare-artwork.mjs`. These observations locate the confirmed defects in display sizing, rather than PNG packing or responsive CSS.

The existing front-facing assets and office-chair rotations were used as references. No separate artwork-only proportion defect was established with comparable confidence; differences in perspective between source drawings were not treated as proven design mistakes.

Not verified: every frame by visual inspection, Shop/Inventory screens not exposed by the inspected accounts, uploaded chat/media assets, seated/walking avatar proportions, other device pixel ratios, native desktop/mobile builds, Safari/Firefox, or the stopped landing site. Live capture used Chromium on Windows at device scale 1; the final detail capture used Edge. Other work changed game and seating code during the review, and an active-game overlay interrupted one account's later inspection; remaining live views were captured in a separate account context. The shared asset sizing files supporting these findings remained unchanged. Findings describe the captured state, not a frozen release build.

Review screenshots and measurements are under `artifacts/asset-proportion-review-2026-09-14/`, which is Git-ignored. Preserve that directory when sharing this report. No fixes, purchases, asset placements or appearance saves were performed by this review.
