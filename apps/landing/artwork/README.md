# Landing media

The PNG files here are the original captures. They stay outside the public build. Existing game sprite sheets and source artwork were not changed.

Captured on 2026-09-17 from the current client at `http://127.0.0.1:5173`, using Playwright and isolated in-memory workspace fixtures. API and WebSocket responses were intercepted; no accounts, credentials, or production records were created. These are screenshots of the implemented game and interfaces, not recordings of an authenticated production session.

| Original | Content and source |
| --- | --- |
| `office.png` | Current `createStartingHouse()` layout, furniture, floors, and three fixture players. |
| `build.png` | Current building sidebar, room tools, and furniture catalog beside that house. |
| `avatar.png` | Current character editor, including the newest outfit options. |
| `whiteboard.png` | Current whiteboard in Board view; sample notes created through the UI in the isolated fixture. |
| `chess.png` | Current Chess interface after an actual move against the in-memory bot. |
| `character-*.png` | Sunset, Frog, and Starlight outfits exported through the current `renderCharacter()` implementation and sprite layers. |

`crops.json` records the screenshot regions used for thumbnails. Full screenshots retain the interface context. The character renders are lossless; screenshot WebP derivatives use quality 84 for previews and 86 for larger views, without upscaling.

Run from the repository root:

```sh
pnpm --filter @workhard/server exec tsx ../../scripts/landing/capture-gameplay.ts
node scripts/landing/optimize-media.mjs
node scripts/landing/optimize-media.mjs --check
```

Capture requires the existing client service; it does not start any service. Optimization uses these PNGs without contacting the app. Preview images are emitted into `src/media` for Vite to hash; full images go into `public/screenshots` so their links also work without JavaScript. `media-manifest.json` records source and output hashes, sizes, and dimensions.
