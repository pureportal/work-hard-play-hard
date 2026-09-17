# Landing media

Source PNGs are retained here, outside the public build. Existing game sprite sheets and source artwork were not changed.

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

## Landing redesign, 2026-09-18

`office-illustration.png` is original image-model artwork, generated with `office-1280.webp` as its visual reference. It reinterprets the game's blue sofa, mint desk, parquet flooring, cream furniture and plants as an illustrated office island. This is decorative artwork, not a gameplay capture. The separate screenshot postcard and office tour show the actual game. The generated original is retained here; only its responsive WebP derivatives ship.

`falling-blocks.png` and `tic-tac-toe.png` are new Playwright captures of the actual game dialogs after playing several moves. The script uses the compiled client and an isolated in-memory game fixture, with API, static assets and WebSocket traffic intercepted. It does not require a running client, create accounts or modify persistent game data.

Regenerate these two game captures:

```sh
pnpm --filter @workhard/client exec vite build --outDir ../../artifacts/landing-redesign/game-client
pnpm --filter @workhard/server exec tsx ../../scripts/landing/capture-games.ts
node scripts/landing/optimize-media.mjs
```

The three decorative prop derivatives come directly from the current four-direction Blockbench sprite sheets: `equipment-arcade/violet.png` (second direction), `plant-monstera/sage.png` and `decor-coffee/coral.png` (first direction). Optimization extracts a single frame, trims transparent padding and resizes it without changing any source image. Existing characters and gameplay originals remain unchanged.

The two fonts are self-hosted Latin variable fonts from Google Fonts. Their SIL Open Font License files are kept in `src/fonts/`. No font service is contacted by the page.
