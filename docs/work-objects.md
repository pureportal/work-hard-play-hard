# Work objects

Whiteboards and checklists are available under Equipment in Build and Shop. Members place purchased boards through Inventory. Existing Sprint and Roadmap boards use the same editor.

Select a board and choose **Open board**. From farther away, **Walk to board** finds a reachable approach using the server's interaction pathfinding. Nearby boards also appear in the existing action switcher. Editing requires being within 72 world pixels of the footprint and in the same room.

- **Canvas:** freely move and resize colored sticky notes and image cards. Zoom controls include Fit canvas. Drag handles also accept arrow keys; Shift moves in larger steps.
- **Board:** arrange the same cards in To do, In progress, and Done. Drag cards across columns or before other cards. The card editor provides a status selector and earlier/later controls for keyboard and touch use.
- **Notes:** longer shared writing, up to 8,000 characters.
- Cards have a title, notes, color, status, and optional due date. Duplicate, delete, undo, and redo work across automatic saves in the open editor. Switching views preserves content and canvas positions. Edits save after a short pause; Save sends them immediately. New cards appear in the visible canvas area. Double-click empty canvas space to place a note there. Funny notes offers optional editable stickers.
- **Checklist:** add, rename, complete, reopen, and remove items. Each action saves separately. Progress shows completed items out of the total. Each checklist holds up to 80 items of 240 characters each.

These are workspace-shared boards. Content follows workspace layout visibility. Each whiteboard holds up to 60 cards on a 1,600 × 1,000 canvas. Card titles allow 120 characters and card notes 1,000; the complete document is limited to 192 KiB of UTF-8 JSON. Views are local to each open editor. Columns are fixed; freehand drawing and assignments are not included.

Images can be attached by HTTPS URL or uploaded as PNG, JPEG, GIF, or WebP up to 5 MB. Uploads require authentication and proximity to the board. They are decoded, rotated for orientation, and resized within 1,600 × 1,200 while preserving proportions, then stored as WebP. Animated uploads use the first frame. Uploaded images are served to signed-in workspace members; external images depend on their hosts.

Uploaded WebP bytes live in PostgreSQL `whiteboard_images`; `whiteboard_image_references` tracks each board that uses them. Identical uploads share one blob. Removing the last card that uses an image starts a one-hour recovery window for undo. Abandoned uploads use the same expiry. A periodic sweep removes expired references and blobs with no remaining references. Deleting a whiteboard removes its references during layout persistence; other boards' references keep shared images alive. Image attachment and cleanup use a database transaction lock so a pending save cannot race with expiry. PostgreSQL backups include the image bytes. No filesystem image fallback is used.

## Integration

`equipment-whiteboard` retains its existing 8 × 1 solid raster footprint, floor layer, three material variants, four directions, and 160-coin price. `equipment-checklist` uses the same physical board and price. Its artwork is copied from the existing PixelLab whiteboard sources, with provenance retained in the artwork source manifest. No new artwork was generated. The broader anime artwork audit remains unresolved.

The catalog now has 73 assets, 219 material choices, and 876 directional frames. Selection thumbnails, placement previews, and placed objects use the existing artwork renderer. The visible board face is selectable as well as its footprint. The 16px asset raster, 32px structural grid, rotated footprints, and layering remain intact.

The browser checks exposed a standing-player overlap bug: comparing two absent seat IDs excluded standing players from placement collision checks. The client preview and server now apply the existing 16px player clearance to standing players. Moving furniture still excludes the occupants of that specific seat. Board approach pathfinding also avoids occupied sides; existing seat pathfinding retains its behavior.

## State and recovery

Each placed object owns a typed `workState`. An untouched board has empty content at revision zero. Requests update that object's revision independently of other boards, and the server broadcasts the updated layout. Stale requests cannot overwrite newer content. The editor merges incoming changes by card and field, rebases its pending draft, and retries save collisions. Different card fields and new cards merge automatically. Changes to the same field, competing reorders, and deletion of an edited card require an explicit choice between the two versions. Resolving a conflict preserves unrelated changes from both players. It shows save failures and blocks changes while disconnected, too far away, or after removal. Closing an unsaved draft requires choosing Discard; navigation also triggers the browser's unsaved-change prompt.

State uses the existing layout JSON persistence, checkpoint export/restore, and reconnect snapshot. Work updates also trigger an immediate database save attempt. Layout broadcasts update other sessions immediately. A separate `work.saved` event acknowledges successful PostgreSQL persistence; the editor shows Saved only after that event. Database failures keep a retry action available. Editing can continue while a save is in flight. `Migration20260915120000` moves saved whiteboard text into the document model without changing board revisions or other objects. Application code uses that single document format.

Moving, rotating, or changing a board's material preserves its content. Removing the placed object deletes its content. Returning a purchased board to Inventory and placing it again creates an empty board. Drafts are kept in the open editor, not in browser storage.

## Verification

- The whiteboard expansion passed 43 focused tests, workspace type checks, scoped lint, and client/server builds. The client build reports a bundle-size warning.
- The whiteboard Playwright check passed at 1440 × 1000, 390 × 844, 320 × 568, and 844 × 390, including real mouse/touch dragging, uploads, two-user conflicts, restore/reload, and card-text contrast in both themes. See [the browser report](../artifacts/whiteboard-features/report.json).
- Focused component tests cover switching views, card fields and geometry, reordering, duplication, undo/redo, upload recovery, failed saves, conflicts, focus, and checklist actions.
- PostgreSQL tests cover the document migration and save/reload of notes, Unicode text, image cards, geometry, status, due dates, checklists, and revisions. They use temporary tables and roll back transactions.
- Server tests cover sharing, reconnects, stale edits, invalid state and payloads, item limits, movement/rotation, checkpoint restoration, removal, room/range restrictions, reachable approaches, and standing-player clearance.
- Client tests cover editing, failed saves, conflict choices, pending actions, draft protection, focus handling, selection targets, and player overlap previews.
- Playwright uses the running frontend at port 5173 with isolated sessions backed by the real `DemoStore`, command schema, and `WorldRuntime`. Two users exercise shared edits, completion, removal, conflicts, and checkpoint restore/reload. Desktop Build and mobile Shop/Inventory exercise both boards, material choices, rotation controls, placement, approach, and editing.
- Layout checks cover 1440 × 1000, 390 × 844, 320 × 568, and 844 × 390, including long checklist text and light/dark themes. Screenshots and the final browser report are under [artifacts/work-features](../artifacts/work-features).

The latest live whiteboard verification uses the existing frontend at port 5173 and backend at port 3001, with separate authenticated player sessions and dedicated review boards. See [the whiteboard polish report](whiteboard-polish.md). No additional development servers are started. Native desktop/Android apps and mobile software keyboards remain outside the browser checks.

Run the live whiteboard check with `pnpm e2e:whiteboard`. It builds the client and serves those files through Playwright while using the existing backend for API calls and WebSockets. It uses the development Maya account to place review boards and Leo/Jonas for editing. It removes the recorded review boards when finished. Screenshots and the report are written to `artifacts/whiteboard-polish`.

The placement and checklist check remains `pnpm e2e:work`. Run the database checks with `pnpm --filter @workhard/server exec vitest run tests/work-object-persistence.test.ts tests/whiteboard-migration.test.ts`.
