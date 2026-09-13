# Asset additions — 13 September 2026

Added **Round ottoman** to Seating in Build and Shop/Inventory, with White, Gray and Blue designs. It costs 110 coins and uses the existing Uncommon rarity. This round added one asset, three PNG atlases and twelve directional frame entries.

PixelLab generated the 128px source and refined it to remove ornamental patterns. The accepted design has plain warm upholstery, narrow piping and a recessed walnut base. Its circular geometry looks the same from every cardinal direction; the seat's facing still rotates normally. It uses a solid 2×2 footprint on the 16px raster, the floor layer and the existing Sit interaction. No renderer, gameplay or interface behavior changed.

The broader selection remains unfinished. The tea tray and stationery organizer failed review: generated turns changed geometry or colors, repeated the wrong view, clipped pencil tips or changed the pencil count. Several PixelLab corrections did not resolve these defects, so neither asset entered the catalog. A subsequent candle request was rejected before generation.

PixelLab MCP was available on an active Tier 2 Pixel Artisan subscription. The initial balance was 31 generation units and $0 credits. A 512px Pro request was rejected; a 256px Pro request succeeded for a quoted 20 units. The final balance reports zero generation units and $0 credits, and further generation is blocked. [Requests and responses](../artifacts/world-assets/additions/pixellab-attempts.json) preserve the attempts. The two ottoman jobs are recorded in [generations.json](../scripts/world-assets/generations.json).

The audit counted the actual starting catalog: 73 definitions, 219 atlases and 876 directional frame entries. Native artwork and production rendering were inspected for desks, tables, a loveseat, ceramic decorations, books, bonsai, storage, lighting and the coffee bar, alongside the anime character source and rendered avatars. The added ottoman was compared with padded stools and loveseats at world size and in 38px previews, in both themes.

Verification completed:

- Artwork validation: 74 assets, 222 designs and 888 directional frame entries.
- 115 focused client tests and 28 server tests passed. Seating tests cover walking to the ottoman, facing, exclusive occupancy and returning to standing before movement.
- Lint, workspace type checks, client build and server build passed.
- Browser checks at 1440×1000, 390×844, 320×568 and 844×390 covered Build selection, rarity filtering, Shop purchase, Inventory, all three materials, four rotations, placement, selection, removal, walking to the seat, sitting, standing and both themes. Seating was checked against the server snapshots as well as the rendered scene. See the [browser verification](../artifacts/world-assets/additions/ui/verification.json).
- Compared against a snapshot taken before editing: all 73 existing definitions, footprints, interactions, theme sets and artwork metadata are identical, and every original atlas is byte-for-byte unchanged.

The browser runs used the existing client at `http://127.0.0.1:5173` with isolated DemoStore/WorldRuntime sessions. The existing backend at `http://127.0.0.1:3001/v1/auth/session` returned HTTP 200 with no authenticated user. Authenticated backend placement, database persistence and native applications were not verified. No additional development servers were started; the test browsers close after each run.

The bulk native-review command encountered a missing `scripts/world-assets/directions/equipment-checklist/graphite/south.png` intermediate. Targeted source review and validation of every production atlas passed. The client unit run emitted JSDOM canvas warnings; browser artwork decoding and rendering checks passed.

Review images: [native ottoman](../artifacts/world-assets/additions/chair-ottoman-native.png), [seating comparison](../artifacts/world-assets/displayed/light-chair-ottoman__chair-stool__sofa-loveseat.png), [desktop placement](../artifacts/world-assets/additions/ui/chair-ottoman-1440-180-placed.png), [mobile Build](../artifacts/world-assets/additions/ui/chair-ottoman-320-build.png), [landscape placement](../artifacts/world-assets/additions/ui/chair-ottoman-844-180-placed.png), [mobile seating](../artifacts/world-assets/additions/ui/chair-ottoman-390-seated.png).

Repeat the focused browser check with `pnpm --filter @workhard/server exec tsx ../../scripts/world-assets/additions-playwright-check.ts chair-ottoman`.
