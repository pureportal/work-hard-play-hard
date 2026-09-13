# Characters

Open **Customize avatar** to preview and save a character. Gender, No Breast / Flat / Medium / Big, three faces, three hairstyles, tops, bottoms, shoes and headwear can be combined independently. Idle, Walk and Sit previews support front, left, right and back views. Option thumbnails follow the selected direction. Cancel discards the draft.

Characters appear in the office and in profile portraits throughout the application. New registrations, invited members and seeded testing players receive a random appearance at creation. Registration and customization save before returning success. Reloads and restarts restore the saved appearance.

## Artwork

`pnpm assets:characters` rebuilds 51 transparent animation atlases and 51 portrait strips from the source sheets in `scripts/characters/sources`. The revised artwork uses adult anime proportions, tapered faces, detailed eyes, fine outlines and cel shading. The reviewed base sheet remains as the style and proportion reference. Provenance and source hashes are recorded in `scripts/characters/anime-sources.json`.

Animation atlases use 180×180 frames with the standing foot anchor at (90, 172) and seated hip anchor at (90, 96). The first four rows contain idle frames in columns 0–3 and seated frames in columns 4–7; four walking rows follow. Portrait strips retain 720×720 artwork for each direction. The office renders an 80-pixel canvas. Walking travels at 96 world pixels per second; the eight-frame cycle uses 100 ms per frame. Idle and Sit use four frames at 400 ms. Stopped players stay idle. Carried players use the seated pose, follow the carrier's direction and render behind the carrier at shoulder height.

The heads, clothing and footwear share scalp, chin, neck, waist, knee, ankle and foot coordinates. Tops are fitted for both genders and all four chest options. Isolated garment sheets include complete sleeves, forearms and hands, eliminating cuts through arms or leftover trouser fragments. Lower bodies and shoes remain independent of tops. Standalone footwear preserves complete heels in rear views.

Each hairstyle has separately authored cap and moon-hat versions. Hair extraction preserves highlights and uses filtered resizing; moon-hat crowns reserve room for movement. The renderer stacks head, lower body, footwear, top, then the fitted hair/headwear layer. Walking and breathing use a shared rig; right-facing frames mirror the left. Head, hair and pelvis movement use the same fractional positioning as the torso. Walking includes opposing arm swing and a wider stride.

Seated poses bend the existing leg artwork and retain the interchangeable clothing. Cushion height follows the furniture artwork's elevation, with an additional lift for the tall stool; rear-facing furniture occludes the character using its alpha channel. Player coordinates, interaction footprints and collisions stay unchanged. Appearance updates replace the sprite after loading while keeping the player container, seating and effects.

The full-body creator preview uses a portrait-shaped canvas. Its preview and actions remain visible while options scroll on short screens. Playback preserves its phase when turning and responds immediately when the reduced-motion preference changes.

## Storage

`Member.character` and the PostgreSQL `members.character` JSONB column are required. `PUT /v1/members/me/character` validates each option and publishes saved changes to connected members. `Migration20260907120000` initializes missing appearances, keeps existing selections, makes the column non-null, and removes the obsolete `player_avatars` table. Profile-photo upload and serving routes have been removed; chat images and corporate logos retain their separate upload flows.

## Verification

Asset checks resolve all 5,832 combinations, inspect transparent margins in every frame and portrait strip, and compare chest fits under each outfit from the front and side. They also check hand visibility and neck, waist and ankle overlap across interchangeable parts in all four directions. API tests cover character creation, saving and restart persistence.

`pnpm assets:characters:review` produces front/side chest comparisons, every gender/face/hair/headwear combination in front/side/rear views, mixed outfits, walking and seated strips, and 80-pixel world sprites with 38/32-pixel portraits on light and dark backgrounds under `artifacts/characters/revision/artwork`.

`pnpm e2e:characters` uses Playwright against the running client at `http://127.0.0.1:5173` (override with `CHARACTER_URL`). It does not start a server. HTTP and WebSocket routes use an isolated in-memory workspace, leaving live user data untouched. It uses Puppeteer's installed Chromium binary.

The browser checks 24 mixed appearances in four directions, all three animation loops, keyboard category navigation, randomization, saving, reload, cancellation, player and bot sprite dimensions, movement, and desktop/mobile light and dark layouts. Screenshots, frame strips and animated WebP recordings are written under `artifacts/characters/revision/after` unless `CHARACTER_SCREENSHOTS` overrides the directory. This suite exercises the running UI and in-memory save flow; separate live and state scripts extend its coverage.

The subsequent state review and its verification limits are recorded in [Character state review](character-state-review.md). Current browser evidence is under `artifacts/characters/state-review`. The source artwork was retained; PixelLab's active Pixel Artisan account returned zero generations and zero credits, blocking new source artwork generation.
