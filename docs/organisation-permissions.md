# Organisation and room permissions

## Placement failure

Playwright reproduced the supplied screenshot on the running app as Jonas: one unplaced Straight desk, the global public-room placement switch off, and no private-room assignment. The former placement check reused room access assignments and offered no independent room build policy. The global switch was visible only to member managers, despite room editing being available to anyone with Build office.

## Controls

- **Organisation** in the navigation opens the tree. Drag people or units, or select them and use Unit, Rank, and Parent. Add unit creates a root unit; Add subteam creates a child.
- **Build → Room settings** opens Rooms and Defaults. Access and Build independently support Everyone, Nobody, and selected people, CEOs, or unit members/leads, including optional descendants.
- A room's Unit determines which organisation leads can edit its settings. Those leads cannot transfer the room to a different unit. Office builders and CEOs can assign units.
- Preview shows the effective Access and Build result for each person, including unsaved changes. Building requires both room entry and the build grant. Temporary admission does not grant building.
- Default applies the corresponding global policy. Explicit room choices override defaults. New rooms inherit both defaults; existing access choices remain explicit.
- Office builders retain layout tools and may place outside rooms. Room build rules apply to assets they place, move, rotate, or remove inside rooms. Ordinary players must own their items and place their entire footprint within a permitted room. Asset recovery also requires build rights in its source room.

## Open design questions

These product decisions remain unresolved. The implementation uses the following **provisional choices**, rather than treating them as settled requirements:

| Question | Provisional implementation |
| --- | --- |
| What does “first person” mean? | First member successfully created during workspace setup. For an existing installation, the earliest member in the persisted member order, with ID as a deterministic tie-breaker. This is not a claim that persisted order proves historical account creation order. |
| How should ranks relate to owner/admin/member/guest roles? | Organisation authority is separate. CEOs manage the full organisation; unit leads manage descendants and their own members. Existing app roles and Build office remain unchanged. App administrators cannot bypass organisation management rules. Office builders retain office structure and room configuration access; CEOs can edit room policies/defaults without acquiring structural building tools. Existing member managers can edit defaults. |
| Who can vote, what threshold applies, and can the subject vote? | Other CEOs at proposal time form a fixed electorate; the subject is excluded. Strict majority of the full electorate is required. Starting a vote casts no ballot. Votes are final, unique, and cannot be replayed. A vote fails as soon as passage is impossible. |
| What about deadlines, abstentions, concurrent votes, and the last CEO? | No automatic deadline. An absent ballot is not approval. A CEO leaving through another passed vote cancels open votes involving that person. New promotions do not change existing electorates. At least one CEO must remain. A removed CEO becomes unassigned. Self-initiated removal is unavailable. |
| What should new-installation defaults be? | Room access and building both start at Everyone. Existing installations keep the effective restrictions represented by their previous global switch and private-room assignments. |

## Fixture verification

- `pnpm --filter @workhard/server exec vitest run src/seed.test.ts src/seed-permissions.test.ts` checks asset variants, geometry, relationships, scoped authority, permission combinations, desk placement, recovery restrictions, and the current voting implementation.
- `pnpm --filter @workhard/server exec vitest run tests/demo-cleanup-persistence.test.ts tests/organisation-permissions-persistence.test.ts` checks cleanup and permission persistence in disposable databases and rolled-back temporary tables.
- After building the client, `pnpm --filter @workhard/server exec tsx ../../scripts/seed-browser-check.ts` checks Build and Shop categories, canvas placement, room previews, and the organisation tree using in-memory fixtures.

## Persistence and enforcement

The database migration stores the organisation and vote history in workspace settings, replaces the public placement switch with access/build defaults, and materializes existing private-room build assignments. It preserves inventory, balances, object ownership, room entry assignments, and layout revisions. There is one current permission model, with no runtime legacy interpretation.

Organisation edits use a server-checked revision. Cycles, missing references, moves outside the actor's responsibility, self/peer-lead demotions, and ordinary CEO removal are rejected. Units still referenced by rooms/defaults cannot be deleted. Defaults and room permissions use the same evaluator for previews, placement, and room entry. Connected clients receive updates and revoked entry is reconciled immediately.

## Verification

The repeatable browser check is `pnpm --filter @workhard/server exec tsx ../../scripts/organisation-permissions-browser-check.ts` after building the client. It uses Playwright with production client assets and the real protocol/store/runtime in isolated memory; it starts no development server and changes no shared accounts. Artifacts are written under `artifacts/organisation-permissions`.

The PostgreSQL migration test uses temporary tables in a transaction and rolls them back. Unit and runtime tests cover hierarchy restrictions, voting, persistence, room/default grants, and permission revocation.

Completed checks:

- Live Playwright reproduction as Jonas, followed by a readback from the running server confirming the migrated rules for Jonas and Maya. The existing default still denies building; Maya can change a room's Build policy or the Build default in Room settings.
- Playwright with isolated data: actual desk placement, independent access/build previews, revocation enforced for players and office builders, organisation defaults, member/unit drag and drop, lead scope restrictions, multiple CEOs, vote persistence across reload, duplicate ballot rejection, and majority removal. Desktop and mobile passed with no browser errors.
- Two PostgreSQL tests passed: permission migration and an unfinished CEO vote round-trip, plus existing floor-spawn persistence with the updated workspace schema.
- All 661 server tests and 470 client tests passed. Earlier timeout failures under concurrent workloads passed in the final runs with limited workers.
- Workspace typechecks, lint, and client and server production builds passed.

Browser screenshots and reports are in `artifacts/organisation-permissions`. Browser mutations use isolated memory; shared workspace permissions were not changed by the verification flow.
