# Workspace economy

New workspaces use equal voting, with no CEO assigned to the creator. Existing organisation assignments survive the database upgrade; workspaces with CEOs start in hierarchical mode. The decision mode can be changed through Funds & votes.

Personal wallets own portable purchases. The workspace and optional organisational units own public funds and assets. Construction, openings and permanent flooring always use public money. An object's location never changes its owner. Private items can be stored, sold or donated; donated items enter shared inventory. No command pays public money into a personal wallet.

Public funds start at zero and accept donations. Unit allocations move existing public money. Weekly allowances reserve actual funds for each member; they are spending limits, not wallet payments. Their default cap is 50 coins. Funding a period or adding a donation distributes up to half the unreserved balance across the members, capped by their remaining weekly limits. Spending is cumulative and is not reset by changing the rules. Periods begin on Monday at 00:00 UTC.

Small new public furnishings can use an allowance. Structural work, changes to existing shared property, sales, rule changes and larger purchases require a proposal. Equal funds require more than half of their members, including the proposer. Hierarchical funds require an appropriate lead or CEO. A unit may use equal voting inside a hierarchical workspace. Room access and build restrictions still apply.

Projects are drafted on the server, priced as a whole, and bound to one floor revision. An approval covers the exact preview. Layout changes cancel stale projects and room-setting proposals, releasing reserved money. Empty drafts cannot be submitted. Proposals reserve their full purchase cost, expire after seven days, and never treat silence as approval. Membership or policy changes cancel pending approvals. Repeated monetary requests do not charge twice.

Private-room boundaries cannot be demolished, divided or exposed by removing the last door, including by a CEO. Open the room's access through Room settings before changing its enclosure. Moving a door without changing the protected room is permitted, subject to building permissions.

Funds & votes and Room settings use large dialogs with separate tabs. Coin and item donations show their destination and consequence before confirmation. Draft additions are marked in amber and removals in red on the map; submitting a proposal does not place it in the saved world.

Initial prices are 12 coins per wall grid segment, 40 per door and 60 per window; furnishings use the catalogue price. Demolition and asset resale return one third of the original purchase price, rounded down, to the owning account. Starter gifts have no paid value. Receipts survive wall merging and splitting. Refunds do not replenish the member's spent allowance.

`Migration20260916180000` adds public accounts, proposals, receipts and original purchase prices. It converts previously private permanent floors to public ownership without changing wallet balances. This migration cannot be reversed after financial transactions use the new schema.

`pnpm e2e:economy` builds the client and exercises purchases, donations, a multi-person project vote, payment, persisted state and desktop/mobile themes. It serves the built assets through Playwright routes and runs the real world runtime in the test process, without starting a development server. The PostgreSQL migration test uses temporary tables and rolls back its transaction.
