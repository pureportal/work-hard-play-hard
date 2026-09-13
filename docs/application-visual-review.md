# Application visual review — 2026-09-13

The responsive layout is improved and verified. The world artwork still falls short of the intended anime style; artwork recreation remains blocked. No new artwork was accepted in this review.

## Review

The running client at `http://127.0.0.1:5173`, implementation, catalog, source manifests, character references and [earlier artwork audit](world-assets-anime-audit.md) were inspected again. The live sign-in page loaded and the backend session endpoint at port 3001 responded successfully.

Fresh native contact sheets and a Playwright gallery rendered all 72 objects, 216 designs and 864 directional frames, with 38px catalog previews and 52px avatars in both themes. Direct visual inspection sampled every category, including furniture, plants, flooring, storage, lighting, equipment and breakroom objects. Avatar review included the base reference, assembled heads and headwear, mixed garments, display-size comparisons and 24 mixed appearances in all four directions in the browser. The reviewed assembly showed continuous neck, waist and ankle joins, fitted hair/headwear and intact hands and feet.

The main unresolved differences remain heavy object outlines, noisy wood and foliage textures, flat cabinet/appliance panels, inconsistent material recolors and elongated narrow directional views. The current footprint projection accentuates source proportion differences in desks and bookshelves. These findings agree with the earlier audit; passing image checks does not establish visual acceptance.

## Changes

- The avatar editor keeps its preview, playback controls and save/cancel actions visible while the appearance controls scroll. Compact screens use a horizontal preview arrangement, scrollable category tabs and 40px playback/action targets. This fixes the previous phone and landscape layouts where choosing clothing hid the character or save action.
- Compact Build and Shop panels use one horizontally scrollable category row. Catalog and inventory names have larger type and wrap instead of being truncated. Build entries use one column while retaining the existing 38px artwork controls.
- The player's balance stays in the Build header while browsing; its duplicate in the top bar is hidden while that panel is open. The daily bonus follows the Shop catalog and retains its original position in Inventory. Its DOM and keyboard order follow the displayed order.
- The existing Playwright scripts now accept `CHARACTER_SCREENSHOTS` and `WORLD_ASSET_SCREENSHOTS` output directories, preserving separate before/after captures. Checks now cover persistent editor controls, compact Build layouts, every scrollable Shop category, a fully visible first Shop object, both mobile themes and claiming the daily bonus after browsing.

Artwork, meaningful variants, display projection, 16px footprints, the 32px structural grid, rotations, layers, collision rules and placement behavior were not changed.

## Screenshots

These are fresh Playwright captures from this review. The complete captures and browser results are under [artifacts/visual-review](../artifacts/visual-review).

| View | Before | After |
| --- | --- | --- |
| Desktop avatar editor, 1440×1000 | [Before](../artifacts/visual-review/before/characters/editor-desktop.png) | [After](../artifacts/visual-review/after/characters/editor-desktop.png) |
| Phone avatar choices, 320×568 | [Before](../artifacts/visual-review/before/characters/editor-320x568-controls.png) | [After](../artifacts/visual-review/after/characters/editor-320x568-controls.png) |
| Landscape avatar choices, 844×390 | [Before](../artifacts/visual-review/before/characters/editor-844x390-controls.png) | [After](../artifacts/visual-review/after/characters/editor-844x390-controls.png) |
| Shop, 390×844 | [Before](../artifacts/visual-review/before/world/mobile-390-shop.png) | [After](../artifacts/visual-review/after/world/mobile-390-shop.png) |
| Shop, 320×568 | [Before](../artifacts/visual-review/before/world/mobile-320-shop.png) | [After](../artifacts/visual-review/after/world/mobile-320-shop.png) |
| Touch placement preview, 390×844 | [Before](../artifacts/visual-review/before/world/mobile-390-preview.png) | [After](../artifacts/visual-review/after/world/mobile-390-preview.png) |
| Placed objects beside avatars, 1440×1000 | [Before](../artifacts/visual-review/before/world/placed-west.png) | [After](../artifacts/visual-review/after/world/placed-west.png) |

## Verification

- Playwright passed at 1440×1000, 390×844, 320×568 and 844×390, with desktop and mobile light/dark captures. No browser or artwork-loading errors were reported in the final runs.
- Avatar checks covered 24 mixed appearances in four directions, preview bounds, walking playback, keyboard navigation, randomization, save/reload/cancel and player/bot movement. Compact preview and action visibility were asserted after scrolling to wardrobe options.
- World checks covered every Build/Shop category, rarity filters, keyboard and pointer design selection, four rotations, exact raster placement, collision rejection, rotate/move/remove and touch purchase-to-placement. The daily bonus and header balance update were also exercised.
- All 143 targeted client tests and 16 targeted server tests passed. These include character assembly assets, catalog previews, textures, editor controls, world rendering and server placement/movement. The affected PlayerBuildPanel tests were rerun after the final markup change.
- `pnpm assets:world:check`, `pnpm lint`, `pnpm typecheck` and the final `pnpm build:client` passed. The fresh gallery build reported its existing chunk-size warning.
- The compiled production client also passed a Playwright layout pass at all four sizes. Local build files were supplied through browser route interception, without opening another server. [Production captures](../artifacts/visual-review/after/production) confirm the compact editor, touch targets and Shop layout after CSS bundling.

## PixelLab and limits

PixelLab MCP was checked before and after a new maximum-square-resolution Pro edit request. The active Tier 2 Pixel Artisan account still has **31 generation units and $0 credits**. The 512px workflow requires **40 units**, and the edit was explicitly refused with `no generations or credits remaining for editing an image`. The balance remained unchanged. The provider reports a reset date of 2026-10-12. No lower-quality substitute was generated.

The application checks used the real running client with isolated `DemoStore` and `WorldRuntime` HTTP/WebSocket fixtures. They verify UI behavior and in-memory state changes, not live authentication, PostgreSQL persistence, real multiplayer sessions or native desktop/Android applications. No additional development servers were started. Full anime artwork acceptance remains outstanding.
