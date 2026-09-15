# Whiteboard polish

## Changes

- Canvas, Board, and Notes share automatic saves. Independent changes merge by card and field; competing edits show both versions and require a choice.
- Editing continues during saves. Saved appears after PostgreSQL acknowledges persistence. Failed saves remain retryable, and undo/redo survives automatic saves without discarding teammates' unrelated edits.
- New notes appear in the visible canvas. Double-clicking empty space places a note there. Optional funny notes are editable text stickers.
- Canvas handles retain practical touch targets while zooming. Board drag handles and editor controls accommodate touch; narrow screens show the card editor on its own.
- Uploaded images are validated, optimized to WebP, and stored as PostgreSQL `BYTEA`. Matching uploads share one blob. References protect images still used by other cards or boards.
- Removing the last image card leaves a one-hour undo window. Expired uploads and removed images are swept automatically. Deleting a whiteboard removes its references during layout persistence.

The earlier upload implementation wrote files under `.data/whiteboard-images`. That directory was absent in this workspace. The new implementation uses PostgreSQL directly.

## Verification

Playwright uses the existing services at ports 5173 and 3001. It serves the built client through request interception to avoid unrelated development hot reloads; API calls, WebSockets, authentication, and database writes use the real backend. Separate Maya, Leo, and Jonas sessions create and edit dedicated review boards. The runner removes its recorded boards afterward.

Confirmed live scenarios:

- Sticky-note placement, editing, colors, mouse movement, resizing, removal, undo, and redo after saves.
- Custom PNG upload, image color/movement/resize, PostgreSQL byte storage and dimensions, successful rendering after reload, and preserved proportions.
- Board status and due dates; shared Notes.
- Simultaneous additions and independent edits to the same card from two players; explicit resolution when both edit the same text. Competing movements show position previews. Both Keep mine and Use theirs were exercised.
- Image duplication, last-card removal, undo restoration, and preserving a shared image when a second whiteboard is removed.
- Touch movement, resizing, placement, editing, and colors at 1024×768, 390×844, 320×568, and 844×390. Canvas, editor, Board, and dark-theme screenshots were captured.
- Removing the final whiteboard clears the PostgreSQL image bytes and references through the running server's automatic cleanup, without a manual cleanup call.

The [live run report](../artifacts/whiteboard-polish/report.json) records 13 completed scenarios and no browser errors. All review boards were removed. The screenshot directory contains 23 captures.

Project checks passed: 20 client tests, 36 server tests, and three PostgreSQL tests; client/server type checks and builds; scoped lint; and migration/schema consistency. Database tests use temporary tables and transaction rollback to cover byte round-trips, shared references, expiry, undo recovery, board deletion, and document persistence/migration.

## Screenshots

- [Desktop canvas](../artifacts/whiteboard-polish/desktop-canvas.png)
- [Task board](../artifacts/whiteboard-polish/desktop-board.png)
- [Funny notes](../artifacts/whiteboard-polish/desktop-funny-notes.png)
- [Conflicting edits](../artifacts/whiteboard-polish/desktop-conflict.png)
- [Position conflict](../artifacts/whiteboard-polish/desktop-position-conflict.png)
- [Shared Notes](../artifacts/whiteboard-polish/desktop-notes.png)
- [Phone editor](../artifacts/whiteboard-polish/touch-390-editor.png)
- [Tablet canvas](../artifacts/whiteboard-polish/touch-1024-canvas.png)
- [Small phone editor](../artifacts/whiteboard-polish/touch-320-editor.png)
- [Landscape canvas](../artifacts/whiteboard-polish/touch-844-canvas.png)

## Limits

- Conflicts are resolved by field, rather than character-level collaborative text editing.
- Undo history belongs to the open editor. Removed image recovery lasts one hour; deleting a board removes that recovery reference.
- Animated uploads use their first frame. External image URLs still depend on the hosting site.
- Touch checks use Chromium emulation. Physical touch devices, software keyboards, native apps, Safari, and Firefox were not tested.
- The client build still reports its bundle-size warning.

Run `pnpm e2e:whiteboard` with the existing development services running. It builds the client without starting another server. Results are written to `artifacts/whiteboard-polish`.
