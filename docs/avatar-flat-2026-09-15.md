# Flat avatar assets

Removed the size selector and its appearance field. Character paths now select the retained Flat top for every gender and outfit. Randomization, API validation and cache keys use the seven remaining selections.

## Changes

- Removed 48 non-Flat PNG atlases and their 48 editable Blockbench models. The inventory contains 16 Flat tops and 156 other components.
- Fixed the garment geometry at the existing Flat shape and updated full and individual-component generation. Invalid component names are rejected before generation.
- Regenerated the sign-in illustration from the retained character components.
- Added a database migration that removes only the obsolete appearance field. Fresh character data and the initial appearance migration no longer create it.
- Updated editor/API tests, asset inventory checks and the Blockbench review workflow. Current workflow documentation describes the retained inventory.

## Verification

- Generated all 172 native models and atlases through Blockbench: 22,016 frames across four directions and five animations. Reopened 15 representative models with all five loops moving and closing correctly, and captured 320 composed views at 80px and 120px. Requests for removed components are rejected.
- Compared SHA-256 hashes against the starting workspace: all 172 retained atlases, including all 16 Flat tops, are unchanged. Another 1,968 unrelated public assets and world-workflow files are unchanged. See the [preservation audit](../artifacts/avatar-flat/asset-preservation.json).
- Asset tests passed exact manifest/PNG/model inventory matching, Flat path resolution, visible color/depth frames, transparent margins and mixed-outfit animation composition.
- The real creator/API passed saving, reload persistence, all 20 motion/direction combinations, reduced motion and mobile layout. The original appearance was restored.
- An extended live sweep verified 13 saved appearances across both genders, matching creator composition to the actual game texture after reload. Its authenticated bootstrap request later failed, interrupting the sweep. A fresh session verified and restored the original appearance; see the [cleanup record](../artifacts/avatar-flat/creator-cleanup.json). The full sixteen-save sweep was not completed.
- A separate Playwright run with isolated fixture data in the running client passed all 416 directional option previews across both genders, all 16 Flat top paths and six compact light/dark layouts, with no browser or asset errors.
- World checks passed four-way walking, seating, standing/seated listening, walking priority and stopped-music transitions. World/architecture checks also passed all 264 atlases and 1,416 frames.
- The PostgreSQL migration test passed for all removed size values and an already-current appearance, preserving every other selection and member field. Registration, randomization and appearance save/restart tests passed.
- Workspace lint and typechecks passed. Client, server and landing production builds passed. All 436 built character/world/architecture atlases match their public source bytes; the built illustration matches its source, the cleanup migration is included, and client bundles contain no removed size selectors or variant references. See [build verification](../artifacts/avatar-flat/build-verification.json).

## Remaining check failures

After isolated retries, three assertions outside the changed avatar code still fail:

- `world-runtime.snapshot.test.ts`: the floor-index test observes one call to `peers.values()`; snapshot ticks call `publishRoomAccessibility()`, which iterates peers.
- `Workspace.meeting-entry.test.tsx`: the nearby-board test does not find the `Review board` dialog.
- `Workspace.player-assets.test.tsx`: the non-builder placement test does not find the `Place` button.

The initial concurrent run also hit chess timeouts and deferred-UI waits that passed on retry. [Server retry results](../artifacts/avatar-flat/server-retry.json) and [client retry results](../artifacts/avatar-flat/client-retry.json) record the remaining failures. These areas were left unchanged.

Playwright verification uses Chromium with desktop and mobile emulation. Other browser engines, native devices and every mixed-outfit combination were not tested. Listening gameplay uses fixture music events.

## Evidence

- [Creator before](../artifacts/avatar-flat/creator-before.png)
- [Creator after](../artifacts/avatar-flat/after/creator-initial.png)
- [Mixed clothing preview](../artifacts/avatar-flat/after/creator-mixed.png)
- [Saved avatar in gameplay](../artifacts/avatar-flat/after/saved-world.png)
- [Seated listening](../artifacts/avatar-flat/world/world-sit-listen.png)
- [Animation and persistence results](../artifacts/avatar-flat/after/character-playwright.json)
- [World motion results](../artifacts/avatar-flat/world/world-animation-review.json)
- [Native model and animation results](../artifacts/avatar-flat/models/character-model-review.json)
- [Clothing and braid direction sheet](../artifacts/avatar-flat/models/character-style-2.png)
- [Both genders and compact layout results](../artifacts/avatar-flat/options/options-review.json)
- [Male tops from the left](../artifacts/avatar-flat/options/tops-male-Left.png)
- [Compact creator](../artifacts/avatar-flat/options/creator-light-320.png)

Verification uses the running client on port 5173 and existing server on port 3001. World motion checks use browser-routed fixture data with the running client. No additional development servers are started.
