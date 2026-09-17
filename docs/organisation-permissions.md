# Organisation and room permissions

Server roles and gameplay roles are separate. Settings opens one Server settings dialog with User roles, Registration, Appearance and Spotify tabs. Owners and administrators manage server configuration; their server role grants no building, voting, room access or organisation advantage. Only owners may grant or manage the administrator role.

Approvals is available from the navigation rail and lists proposals from every public fund. All public gameplay changes require a strict majority of the affected fund's members. Organisation changes, including CEO removal, use this same system. The final CEO cannot be removed while using a hierarchical structure. Changing to an equal team is a separate structure proposal.

Organisation contains the team tree. People and units can be moved through drag and drop or explicit controls. Changes create proposals; they do not immediately alter the tree. The server rejects cycles, missing references, stale revisions and deletion of units still referenced by rooms, funds or defaults.

Room settings separates Access, Build and Personal spaces. Access and Build independently support everyone, nobody, selected people, CEOs, and unit members or leads, with optional descendants. Room defaults use the same evaluator. A preview shows effective grants for each person. Temporary admission does not grant building rights.

A room can belong to one person, or contain multiple non-overlapping personal areas assigned to members. Areas are drawn inside the room and may be refined with dimensions. Assigning or releasing ownership requires approval. Owners may furnish their entire assigned space with their own paid inventory without a proposal. Shared purchases and construction still require public money and team approval. Personal ownership does not grant room entry.

Private items placed in public areas remain personal property and appear with their owner in the proposal preview. Their owner can recover them at any time without a vote, even without room entry or building rights and while viewing another floor. Other members cannot move, remove or spend another player's inventory through a proposal. Supported objects return to storage when their supporting personal item is recovered.

Room enclosure protection applies to private rooms and personally assigned spaces. Wall edits cannot silently erase ownership or access restrictions. Releasing the assignment and opening access requires a prior room-settings proposal. Revoked room entry is reconciled for connected players when the approved settings take effect.

## Verification

`pnpm e2e:governance` uses Playwright with production client assets and the real server protocol in isolated memory. It starts no development server and changes no shared accounts. Its screenshots and report are in `artifacts/governance`.

`src/world/world-runtime.personal-spaces.test.ts` checks administrator isolation, immediate personal placement, mixed public/private construction, revoked-access recovery, and protection against stolen assets. Organisation and permission suites cover revision checks, independent grants, team proposals and CEO safeguards. PostgreSQL integration tests check migration and persistence in disposable test databases.
