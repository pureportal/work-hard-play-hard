# Character state review

Reviewed September 13, 2026, against the existing client on port 5173 and backend on port 3001. No additional development servers were started.

## Changes

The existing anime source sheets have usable faces, hair, clothing and adult proportions. They were retained after inspecting the source reference, assembled characters and fresh browser captures. Their hashes remain unchanged. The main problems were animation assembly, undersized world characters, missing seated poses and cramped creator previews.

- Rebuilt all 51 animation atlases with seated poses in four directions. Sitting bends the existing lower-body artwork around a fixed hip while the upper body breathes. Portrait source artwork remains unchanged.
- Removed rounding differences between the head, hair, torso and pelvis during movement. Walking now has a wider stride, opposing arm movement and an eight-frame, 100 ms cadence. Turning preserves animation phase; entering another motion starts that motion cleanly.
- Increased the world character canvas from 52 to 80 pixels so proportions fit the furniture. Seated characters meet the cushion, including the tall stool. Rear-facing furniture occludes the body through its actual alpha silhouette. Ground rings and shadows disappear while seated or carried. World coordinates, movement speed, furniture footprints and collisions are unchanged.
- Kept player containers, position and effects when changing appearance. The loaded sprite replaces the old one without destroying the player view. Carried characters use the seated pose at shoulder height, follow the carrier's direction and render behind the carrier. Their names sit beside the carrier; seated names stay below raised cushions.
- Enlarged the creator's full-body preview with a portrait-shaped canvas. Options scroll independently on short screens, keeping the preview and actions visible. Added **Sit** playback; option thumbnails follow the selected direction. Changing the reduced-motion preference immediately freezes or resumes playback.

## Visual coverage

| Area | Inspected |
| --- | --- |
| Assembly | Source/reference sheets; head, hair and headwear fits; chest and outfit contact sheets; 24 mixed appearances in four directions; six seated outfit/body combinations in four directions |
| Creator | Every category and body fit; keyboard navigation; randomization; save, reload and cancel; light and dark themes |
| Sizes | 1440×1000 desktop; 390×844 and 320×568 phones; 844×390 landscape |
| Playback | Idle, Walk and Sit in all four directions, sampled over time and saved as animated WebP recordings and frame strips |
| World movement | Four directions, stopping, turning, player/bot dimensions and appearance changes while seated |
| Seating | 88 entry/playback/exit checks: eleven furniture types, four rotations, desktop and mobile. Fixed hip position and all four seated frames were checked over 1.8 seconds per view |
| Other states | Reactions, waving, high five, carrying while the carrier moves in all four directions, getting down and preserved effects during an appearance change |
| Recovery | Failed artwork load and Retry; disabled Save while loading; failed save and successful retry; reduced-motion changes during playback |
| Live backend | Authenticated creator and world captures at desktop and phone sizes; previewed all three motions and cancelled drafts |

The seating matrix covers the office chair, dining chair, padded stool, lounge chair, beanbag, round ottoman, outdoor bench, straight sofa, corner sofa, loveseat and velvet sofa. Final contact-sheet review caught and corrected the tall stool's cushion height and rear-facing layering on backless seats and the beanbag. Sixteen targeted repeats checked the final stool and office-chair labels.

Browser mutations use isolated in-memory HTTP/WebSocket fixtures, running the real UI and world runtime. Reaction/carry transition checks additionally inject snapshots to reach specific rendering states. Live-backend review uses the seeded Maya account without saving drafts. Active games are closed before static navigation.

## Evidence

- Creator: [before](../artifacts/characters/state-review/before/editor-desktop.png), [desktop after](../artifacts/characters/state-review/after/creator/editor-desktop.png), [small phone](../artifacts/characters/state-review/after/creator/editor-320x568-controls.png), [landscape](../artifacts/characters/state-review/after/creator/editor-844x390-controls.png).
- Motion: [walking recording](../artifacts/characters/state-review/after/creator/walk-left.webp), [seated recording](../artifacts/characters/state-review/after/creator/sit-left.webp), [seated outfit sheet](../artifacts/characters/revision/artwork/seated.png).
- World: [live desktop](../artifacts/characters/state-review/after/live/world-1440.png), [office chair](../artifacts/characters/state-review/after/states/chair-office-review.png), [stool and chair recheck](../artifacts/characters/state-review/after/seat-labels/seating-contact-sheet.png), [beanbag](../artifacts/characters/state-review/after/states/chair-beanbag-review.png), [carried character](../artifacts/characters/state-review/after/transitions/390-carried.png).
- [Machine-readable browser results, source hashes and PixelLab balance](../artifacts/characters/state-review/verification.json).

## Verification and limits

| Check | Result |
| --- | --- |
| Client tests | 48 files, 328 tests passed; 52 focused tests repeated after the final rendering adjustments |
| Server avatar, movement, asset interaction and carry tests | 6 files, 33 tests passed |
| Lint and project type checks | Passed |
| Client and server production builds | Passed |
| World artwork validation | 74 assets, 222 designs, 888 directions passed |

The server asset checks resolve all 5,832 appearance combinations and inspect layer/frame margins, chest fits and attachment overlap. Browser suites reported no page errors. Some existing JSDOM tests emit canvas-not-implemented warnings; actual canvas rendering was verified in Chromium.

PixelLab MCP returned **$0 credits and 0 remaining generations** on the active Tier 2 Pixel Artisan plan, with reset on October 12, 2026. This blocks new source artwork and authored animation frames. This pass rebuilt animation atlases from existing artwork; it did not generate new PixelLab source images. Right-facing artwork still mirrors the left. Waving and high-five remain effects, and carrying reuses the seated pose; these states have no newly authored source frames.

Visual review samples the customization space rather than all 5,832 combinations. Seating checks use the default material and first interaction on furniture with multiple seats. Physical mobile devices, native applications and live database restart persistence were not verified; save/reload and persistence behavior were exercised through isolated fixtures and server tests.
