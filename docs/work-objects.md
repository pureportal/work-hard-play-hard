# Work objects

Whiteboards and checklists are available under Equipment in Build and Shop. Members place purchased boards through Inventory. The existing whiteboards, including the seeded Sprint and Roadmap boards, now support notes.

Select a board and choose **Open board**. From farther away, **Walk to board** finds a reachable approach using the server's interaction pathfinding. Nearby boards also appear in the existing action switcher. Editing requires being within 72 world pixels of the footprint and in the same room.

- **Whiteboard:** shared plain text notes with line breaks and an explicit Save action. The limit is 8,000 characters.
- **Checklist:** add, rename, complete, reopen, and remove items. Each action saves separately. Progress shows completed items out of the total. Each checklist holds up to 80 items of 240 characters each.

These are workspace-shared boards. Content follows the existing workspace layout visibility; it is not a private document system. Whiteboards provide text notes in this round, without freehand drawing, attachments, or rich text. There are no assignments or due dates.

## Integration

`equipment-whiteboard` retains its existing 8 × 1 solid raster footprint, floor layer, three material variants, four directions, and 160-coin price. `equipment-checklist` uses the same physical board and price. Its artwork is copied from the existing PixelLab whiteboard sources, with provenance retained in the artwork source manifest. No new artwork was generated. The broader anime artwork audit remains unresolved.

The catalog now has 73 assets, 219 material choices, and 876 directional frames. Selection thumbnails, placement previews, and placed objects use the existing artwork renderer. The visible board face is selectable as well as its footprint. The 16px asset raster, 32px structural grid, rotated footprints, and layering remain intact.

The browser checks exposed a standing-player overlap bug: comparing two absent seat IDs excluded standing players from placement collision checks. The client preview and server now apply the existing 16px player clearance to standing players. Moving furniture still excludes the occupants of that specific seat. Board approach pathfinding also avoids occupied sides; existing seat pathfinding retains its behavior.

## State and recovery

Each placed object owns a typed `workState`. An untouched board has empty content at revision zero. Requests update that object's revision independently of other boards, and the server broadcasts the updated layout. Stale requests cannot overwrite newer content. The editor keeps drafts and offers an explicit choice between the latest content and the draft. It shows save failures and blocks changes while disconnected, too far away, or after removal. Closing an unsaved draft requires choosing Discard; navigation also triggers the browser's unsaved-change prompt.

State uses the existing layout JSON persistence, checkpoint export/restore, and reconnect snapshot. Work updates also trigger an immediate database save attempt. As with other existing world updates, the layout broadcast acknowledges the server's in-memory change before the asynchronous database write; a database failure reports an error and remains dirty for retry. No database migration is needed.

Moving, rotating, or changing a board's material preserves its content. Removing the placed object deletes its content. Returning a purchased board to Inventory and placing it again creates an empty board. Drafts are kept in the open editor, not in browser storage.

## Verification

- Full client suite: 323 tests passed. Full server suite: 428 tests passed.
- A PostgreSQL test saved and reloaded notes, Unicode text, checklist completion, and revisions through the real ORM layout JSON column. It used a temporary table and rolled back its transaction.
- Server tests cover sharing, reconnects, stale edits, invalid state and payloads, item limits, movement/rotation, checkpoint restoration, removal, room/range restrictions, reachable approaches, and standing-player clearance.
- Client tests cover editing, failed saves, conflict choices, pending actions, draft protection, focus handling, selection targets, and player overlap previews.
- Playwright uses the running frontend at port 5173 with isolated sessions backed by the real `DemoStore`, command schema, and `WorldRuntime`. Two users exercise shared edits, completion, removal, conflicts, and checkpoint restore/reload. Desktop Build and mobile Shop/Inventory exercise both boards, material choices, rotation controls, placement, approach, and editing.
- Layout checks cover 1440 × 1000, 390 × 844, 320 × 568, and 844 × 390, including long checklist text and light/dark themes. Screenshots and the final browser report are under [artifacts/work-features](../artifacts/work-features).
- Release validation, artwork validation, lint, type checks, and client/server builds passed.

The live sign-in page and backend session endpoint at port 3001 responded. Authenticated browser sessions against the live backend were not exercised; browser sharing uses isolated runtime sessions, and PostgreSQL persistence was tested separately. No additional development servers were started. Native desktop/Android apps and mobile software keyboards were not tested.

Run the browser check against the existing frontend with `pnpm e2e:work`. Run the database check with `pnpm --filter @workhard/server exec vitest run tests/work-object-persistence.test.ts`.
