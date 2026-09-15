# Blockbench visual refinement — September 15, 2026

This follow-up verified the [migration report](blockbench-migration.md) and [asset audit](blockbench-asset-audit-2026-09-15.md) against the current files and running web client.

## Findings and changes

- **Old artwork:** the sign-in screen still imported `northstar-office.svg`, a primitive office illustration outside the public asset folders covered by the earlier inventory. Replaced it with a static WebP composed from the production Blockbench furniture, architecture and chibi characters, including the approved shoji screen, tea cart and sakura planters. Removed the SVG. `pnpm assets:world:preview` regenerates the illustration from the current atlases.
- **Obsolete inventory:** removed the unused `public/characters/anime/manifest.json`, which still described the retired 180px character and portrait formats. No old world or character PNGs were found in the current production inventory.
- **Arcade cabinet:** artwork existed and loaded; the control deck obscured the screen. Shortened the deck, tilted the display toward the camera, added a lower cabinet, and clarified the controls, coin slot, side panels and rear vents. Regenerated three native models, 12 directional renders and three atlases. The existing 4×6-cell footprint, clockwise rotations, scale and placement origin remain intact.
- **Avatar previews:** removed the intermediate smoothed enlargement that blurred eyes, hair outlines and clothing details. Previews now draw native pixels and scale crisply. Short screens scroll the editor content; landscape keeps the complete preview and compact playback controls visible while browsing options.
- **Review reliability:** corrected two browser checks that treated an absent save button as a ready avatar dialog. The inventory check now compares every production file with the bytes served by the client and waits for all six option canvases to contain artwork before capturing them.

No current catalog, architecture or character texture was missing, failed to load, or failed to decode. The arcade defect was model occlusion; the avatar softness and clipping were presentation issues.

## Verification

- Matched and decoded all **366 served atlases**: 243 world, three architecture and 120 character. Checked the complete public inventory and the separate client illustration directory. All 120 character models have materials on every face.
- Revalidated **984 world/architecture views**, including material coverage, transparent borders, calibration and the corrected corner/lamp footprint samples. Captured all 81 catalog assets in four rotations inside the game. Reviewed all material variants at world scale, with a separate final 12-view arcade sheet.
- Reviewed **144 avatar option previews** across six categories and four directions, plus portraits and the live world. The real creator saved and reloaded a mixed appearance, played all 20 motion/direction combinations and respected reduced motion. Its original saved appearance was restored.
- Verified the arcade's three materials and four rotations in the game, selection, all **16 collision approaches**, and reload using the existing isolated runtime fixture. Each approach stopped 13 world units outside the footprint; all 24 solid cells remained on the 16-unit grid.
- Placed a temporary arcade through the real API/WebSocket connection, selected it, rotated it through all four directions, reloaded the saved object and removed it. Original objects were preserved. Rechecked the corrected corner openings, lamp canopy/base collision and elevated laptop placement/selection/erasing with the existing fixture. Horizontal and vertical walls/windows blocked movement, door thresholds remained walkable, and structural selection and reload passed.
- Checked desktop and 390×844, 320×568 and 844×390 layouts, both themes and emulated touch. On the short layouts, selected headwear and operated direction/animation controls after scrolling; the full character canvas fits its stage. On landscape, all playback controls fit the visible stage.
- Passed 32 focused client tests, 14 server character/placement tests, workspace lint/typechecks and the client production build. All 366 built atlases match their source files; the build includes the new illustration and excludes the old SVG and character manifest.

All browser work reused ports 5173 and 3001. No frontend or backend processes were started or restarted.

## Evidence

[Sign-in before](../artifacts/blockbench-refinement/auth-before.png) · [Sign-in after](../artifacts/blockbench-refinement/auth-after.png) · [Creator before](../artifacts/blockbench-refinement/creator-before.png) · [Creator after](../artifacts/blockbench-refinement/creator-after.png) · [Compact creator](../artifacts/blockbench-refinement/creator-320.png) · [Landscape creator](../artifacts/blockbench-refinement/creator-844.png)

[Final arcade materials/directions](../artifacts/blockbench-migration/catalog-equipment-arcade-01.png) · [In-game arcade](../artifacts/blockbench-refinement/arcade-materials-90.png) · [Inventory and previews](../artifacts/blockbench-refinement/inventory-report.json) · [Collision report](../artifacts/blockbench-refinement/arcade-interactions.json) · [Live placement/reload/cleanup](../artifacts/blockbench-refinement/live-placement-report.json) · [Compact touch checks](../artifacts/blockbench-refinement/compact-report.json)

### Repeatable checks

With the existing client and server running, execute from the workspace root:

```sh
pnpm assets:world:check
node scripts/world-assets/blockbench/playwright-inventory.mjs
node scripts/world-assets/blockbench/playwright-review.mjs --catalog --asset=equipment-arcade
pnpm --filter @workhard/server exec tsx ../../scripts/world-assets/blockbench/playwright-arcade.ts
node scripts/world-assets/blockbench/playwright-live-check.mjs --asset=equipment-arcade --output=artifacts/blockbench-refinement
node scripts/characters/blockbench/playwright-check.mjs
```

## Remaining opportunities and limits

White upholstery could use stronger cushion-edge contrast against pale floors. Palm leaves and marble veining could have more distinctive silhouettes and patterns at world scale. These were identified during review and remain unchanged.

The audit covers the current web-client source/public inventory, native production models, catalog previews, architecture, world characters and avatar creation. Historical screenshots/prototypes and previous native build outputs were not replaced. Browser checks used Chromium, including emulated touch; native devices, WebKit and a native application rebuild were not tested. Placement survived browser reload, but server/database restart durability was not tested. Representative mixed appearances were reviewed, not every possible appearance or overlapping furniture arrangement.
