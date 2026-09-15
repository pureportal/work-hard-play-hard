# Build sidebar

## Changes

- Assets and Rooms have separate scroll areas and native scrollbars. Section headings, categories, and the rarity filter stay visible. Room edits survive category and filter changes.
- Categories form a horizontal strip with icons and labels. It supports swiping, horizontal wheel input, and arrow/Home/End keys.
- The layout editor grows to 440–560px on monitors at least 1440px wide. Small screens use a taller bottom sheet, compact tools, and a split that fits at least one complete asset and room card at 320×568.
- Card borders distinguish all five rarities in light and dark themes, including selected cards. Accessible descriptions expose the rarity without adding visible labels.
- Sorting follows `ASSET_RARITIES` in `packages/shared/src/assets.ts`: Common, Uncommon, Rare, Epic, Legendary. Assets within each rarity retain their catalog order.

Scope: `BuildPanel.tsx`, its stylesheet, and its existing component tests. Catalog data, prices, artwork, and placement commands are unchanged.

## Browser verification

Playwright used the running game at `http://127.0.0.1:5173`. No development servers were started.

Verified at 320×568, 390×844, 768×1024, 844×390, 1280×800, 1920×1080, and 2560×1080:

- Independent wheel scrolling and scroll containment, with Rooms remaining visible.
- All 12 categories and 420 rarity-filter cases, including empty results and returning to all rarities.
- Canonical rarity ordering and five distinct border colors.
- Asset selection, design changes, rotation, and returning from Room access.
- Keyboard navigation, focus visibility, and horizontal wheel scrolling.

Emulated touch swipes and taps passed at 390px and 1920px. Swiping did not select a category or scroll Rooms. Light and dark screenshots were inspected. A separate pass enabled native scrollbar rendering and checked both scrollbars at narrow, wide, and landscape sizes, plus retention of unsaved room edits.

Live placement: placed a chair, verified all four rotations, reloaded and checked persistence, then removed the test chair. Existing objects were preserved.

## Project checks

- Lint passed.
- Client typecheck and production build passed.
- All 132 focused Build, asset preview, variant, orientation, and workspace integration tests passed.
- All 470 client tests passed with `--maxWorkers=1`. Concurrent runs encountered intermittent lazy-loading timeouts; the sequential run completed without failures. JSDOM also emits canvas warnings from existing avatar-preview tests.

## Evidence

- [Wide sidebar with both scrollbars](../artifacts/build-sidebar-2026-09-15/scrollbars-1920.png)
- [Narrow sidebar with both scrollbars](../artifacts/build-sidebar-2026-09-15/scrollbars-390.png)
- [320px sidebar](../artifacts/build-sidebar-2026-09-15/scrollbars-320.png)
- [Dark theme](../artifacts/build-sidebar-2026-09-15/dark-wide.png)
- [Browser results](../artifacts/build-sidebar-2026-09-15/verification.json)
- [Final scrollbar measurements](../artifacts/build-sidebar-2026-09-15/scrollbars.json)
- [Live placement results](../artifacts/build-sidebar-2026-09-15/placement/live-placement-report.json)
- [Focused test results](../artifacts/build-sidebar-2026-09-15/build-tests.json)
- [Full client test results](../artifacts/build-sidebar-2026-09-15/client-tests-final.json)

Physical touch devices and other browser engines were not tested. Touch verification used Chromium emulation.
