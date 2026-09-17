# Landing page review

Reviewed the landing source, current artwork manifests and sprite files, the latest UI review, the running sign-in screen, and current game views before changing the page. Existing client and server changes were preserved. No services were started or restarted.

## Changes

- Replaced the abstract room diagram with a fresh screenshot of the furnished starter house, using current furniture, flooring, and characters.
- Added four concise feature cards for building, avatar customization, collaboration, and games, supported by current screenshots and character artwork.
- Kept the Northstar identity and office links, improved spacing and hierarchy, and added responsive light/dark presentation.
- Added keyboard-accessible screenshot enlargement, Escape/backdrop/close dismissal, focus restoration, a skip link, and image-error recovery. Original image links also work without JavaScript.
- Preserved original PNGs outside the public build. Responsive WebP previews, lazy loading, explicit dimensions, and an eagerly loaded hero keep delivery small. All 16 derivatives, including the five full screenshot views, total approximately 574 KiB.

## Feature evidence

| Landing feature | Implementation inspected |
| --- | --- |
| Rooms, flooring, furniture | `BuildPanel.tsx`, shared asset catalog, `createStartingHouse()` |
| Appearance customization | `CharacterEditor.tsx`, `CharacterPreview.tsx`, `character.ts`, current sprite layers including Sunset, Frog, and Starlight |
| Talking and screen sharing | `MeetingOverlay.tsx` and its media controls |
| Whiteboards and checklists | `WhiteboardDialog.tsx`, `WorkObjectDialog.tsx`, work-object commands |
| Chess, Falling Blocks, Tic-Tac-Toe | Current game components and definitions in `initial-data.ts` |

The page makes no economy claims. The building screenshot reflects the currently implemented interface; no previously discussed economy changes were implemented or advertised.

## Verification

- Landing TypeScript checks and Vite production build passed.
- Repository lint and whitespace checks passed.
- Media verification passed for all 16 derivatives, including original/output hashes and dimensions.
- Playwright loaded the actual compiled landing HTML, CSS, JavaScript, and images through intercepted static-file responses. The matrix covered 1440×900, 1920×1080, 1024×768, 800×1024, 390×844, 320×568, and 844×390 in light and dark themes: **14 layouts**.
- Checked image loading, responsive source selection at 2× pixel density, horizontal overflow, control names and touch sizes, office-link destinations, feature navigation, skip-link focus, all five image dialogs, keyboard focus containment/restoration, Escape, close/backdrop dismissal, image failure/recovery, reduced motion, explicit/system themes, and image navigation without JavaScript.
- Visually reviewed desktop and mobile captures in both themes. Browser results and screenshots are in `artifacts/landing/`.

Reproduce the landing checks after building:

```sh
pnpm --filter @workhard/landing build
node scripts/static-landing-check.mjs
node scripts/landing/optimize-media.mjs --check
pnpm lint
```

## Limits

The landing service on port 4174 remained stopped. These are production-build fixture checks, not verification of its HTTP service, proxy routing, deployment caching, or live landing-to-office navigation. The office-link click check uses an isolated destination fixture.

The running client supplied the real game modules and artwork. Its unauthenticated sign-in was inspected directly; authenticated game captures used isolated in-memory data and intercepted transport. No production data or shared credentials were added. Live authenticated persistence and real camera/microphone/screen-sharing sessions were not verified in this task.

All selected artwork was available locally. Screenshot and artwork provenance, regeneration commands, and original files are in `apps/landing/artwork/`.
