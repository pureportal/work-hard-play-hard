# Performance audit

The clearest improvements are avoiding full animation composition for small avatar previews and keeping world artwork data out of startup JavaScript. Both are implemented. Rendering resolution, animation timing, depth composition, rotations, placement and server update rates are unchanged by this pass.

## Implemented

Static portraits and editor options now compose only their displayed crop. Animated previews and world characters still receive their complete atlas. The layer loader reads the matching color and depth rectangles, and reuses full layer pixels when those have already been loaded. This preserves occlusion between clothing, faces, hair and headwear.

Image caches share pending requests without evicting unfinished work. Completed entries use a byte budget and a 128-entry limit. The layer budget remains approximately 98.4 MiB and the composed-image budget 56.3 MiB; these are retained cache budgets, not a limit on total browser or GPU memory. Small previews no longer displace full atlases simply because eight options were displayed. Avatar source loading is limited to two concurrent requests to reduce peak decoding pressure.

Rotation calculations are separated from the artwork-dependent direction indicators. The Funds panel now loads on demand using the existing loading/error boundary. This prevents these controls from pulling the 605,840-byte world artwork module into startup.

| Measurement | Before | After |
| --- | ---: | ---: |
| Initial JavaScript and static imports | 1,290,518 B | 674,255 B |
| Same files, gzip | 242,758 B | 207,087 B |
| Composed pixels when opening 14 Hair options | 25,804,800 | 60,928 |
| Canvas readback pixels in that Hair sample | 55,296,000 | 609,280 |

The Hair composition reduction is **99.76%**. Startup snapshots are **47.75% smaller before compression** and **14.69% smaller with gzip**. Other work continued in this shared checkout between builds, so the overall bundle delta includes concurrent changes. The independently identifiable saving is deferring the 606 kB artwork module; it is still loaded when needed. These figures do not establish a frame-rate improvement or production network latency.

Early browser runs exposed image decode failures when many distinct avatars loaded together. A subsequent run with the loading limit rendered all 13 visible portraits and verified movement in four directions. Later runs were affected by the concurrent avatar migration described below. Browser timings were collected for diagnosis but are not presented as repeatable speed measurements on this busy machine.

## Next priorities

These are proposals, not implemented changes.

| Priority | Change | Evidence and validation needed |
| --- | --- | --- |
| 1 | Generate compact, lossless avatar layer atlases for static portraits and options | Static composition is now small, but still downloads and decodes full color/depth layers. Packing the first idle frame for all four directions into 120 × 960 pixels would use 96.875% fewer source pixels than a 960 × 3840 layer, without resizing the displayed artwork. Keep full atlases for animations. Verify every color/depth crop and integrate generation checks after the current avatar migration finishes. |
| 2 | Budget world textures across floor changes | `WorldAssetTextures` retains loaded atlases until the renderer is destroyed. Track visible references and release unused floor assets after a bounded warm period. Test repeated floor changes, previews, missing-image recovery and re-entry before choosing a memory budget. |
| 3 | Profile viewport culling on crowded floors | The renderer currently draws the scene and updates asset/player animations each tick without viewport culling. Preserve time-based animation state and restore objects before they enter view. Measure both CPU and GPU cost: culling can hurt a CPU-bound scene, as the [PixiJS performance guide](https://pixijs.com/8.x/guides/concepts/performance-tips) explains. |
| 4 | Move remaining full-avatar composition off the main thread | New full appearances still require full-atlas pixel work. A worker can keep that work away from input/rendering; [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) supports worker rendering. Measure transfer and texture-upload costs and verify supported desktop/Android targets before changing the pipeline. |

The server already limits snapshots to relevant floors, sends moving-world snapshots at 10 Hz with a five-second idle heartbeat, tracks active movement, and shares serialized event payloads. Lowering movement/snapshot rates is not recommended without new measurements. No server changes were made in this pass.

## Verification and current blocker

- **108 focused tests passed**, including cache eviction and pending-request sharing, decode failure/retry and queue release, cropped depth composition, animated previews, world interactions, rotation alignment and deferred loading.
- Targeted TypeScript validation, including `App.tsx` and its production dependencies, passed. Workspace lint and `git diff --check` passed.
- Production Vite bundling passed in an isolated artifact directory. The existing large world-artwork chunk warning remains; that chunk is deferred, not removed.
- **576 regions and three complete atlases matched original PNG composition pixel for pixel** before the concurrent avatar migration. This covered all animation frames and four directions, plus cold/cached preview crops for three mixed appearances. World and editor screenshots were visually inspected.
- A full client-suite run earlier in the session reported 715 passing and five failing tests during concurrent edits. The final focused run is clean; a clean full-suite result is not claimed.

Final integration verification is blocked by a concurrent avatar schema/artwork migration. At the last check, `getCharacterLayerPaths` requested `head/calm.png`, `lower/street.png`, `shoes/street.png` and `upper/street.png`, while the optimized-image manifest had no entries for those paths. This prevents a complete avatar startup/save/reload check of the latest shared checkout. The migration and its asset generation were left to the ongoing work; no compatibility paths were added. The browser checker has been adapted to the current appearance fields.

The last workspace-wide typecheck also reported errors in `ConfirmationDialog.test.tsx:35` and `Workspace.player-assets.test.tsx:88`, outside these changes. Shared, server and landing typechecks passed. A complete production build with artwork validation cannot yet be reported as passing for the latest checkout.

Native builds, physical-device frame rate/GPU memory, deployed multiplayer, database persistence and production cache behavior were not tested. Browser checks use the existing client URL and isolated test data; no development servers were started.

## Reproduction and evidence

Once the avatar migration has regenerated its delivery manifest:

```powershell
pnpm --filter @workhard/client exec vite build --outDir ../../artifacts/performance-2026-09-17/client-final
node scripts/client-performance-check.mjs artifacts/performance-2026-09-17/bundle-final.json artifacts/performance-2026-09-17/client-final
node scripts/performance/character-pixels.mjs
pnpm --filter @workhard/server exec tsx ../../scripts/performance/client.ts artifacts/performance-2026-09-17/recheck artifacts/performance-2026-09-17/client-final
```

The browser check measures world/editor work, exercises every motion and direction, saves a mixed appearance, reloads it, checks movement and requires every visible portrait to render.

- [Startup before](../artifacts/performance-2026-09-17/bundle-before.json) and [final bundle](../artifacts/performance-2026-09-17/bundle-final.json)
- [Original editor sample](../artifacts/performance-2026-09-17/before/measurements.json)
- [Pixel comparisons](../artifacts/performance-2026-09-17/character-pixels.json)
- [Final focused tests](../artifacts/performance-2026-09-17/final-tests.json) and [targeted typecheck](../artifacts/performance-2026-09-17/targeted-typecheck.json)
- [Missing artwork paths](../artifacts/performance-2026-09-17/artwork-state.json)
- [World screenshot](../artifacts/performance-2026-09-17/after/world.png) and [Hair options](../artifacts/performance-2026-09-17/after/hair.png)
