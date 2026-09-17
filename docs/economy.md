# Workspace economy

Personal wallets pay for portable personal items. Public funds pay for shared items, walls, doors, windows and permanent flooring. Every purchase needs sufficient money, including purchases proposed by CEOs and server administrators. Ownership follows the item, not its location.

Public funds start at zero. Players may donate money or unplaced personal items. Donations preserve the paid value of an item for a later shared sale. Transfers move existing public money between funds; public money never becomes a personal wallet payment.

All public projects and gameplay settings go through Approvals. This includes public placement of privately owned items, mixed private/shared projects, structural work, shared sales, fund transfers, room assignments, organisation changes and global game rules. Every proposal needs a strict majority of its fund's membership, including the proposer's vote. Hierarchical organisation roles do not bypass voting. A one-person team can approve its own proposal.

A personal room or area is assigned through a room-settings proposal. An owner can place and rearrange paid personal items entirely inside that space without a vote, provided they can enter the room. Moving an item into or out of public space requires approval. Owners can always return their private items to inventory, including after room access has been revoked. Removing a supporting personal item also stores supported objects safely; it does not destroy other people's property.

Projects are server-authored drafts bound to one floor revision. Reviewers see item ownership, proposed placements/removals, purchases, refunds and the complete layout. Submission does not change the saved world. Execution uses the proposer's inventory and identity even when another voter applies the approved proposal.

Reservations use the net amount needed by the paying fund: purchases minus refunds returning to that same fund, with a minimum of zero. Refunds to another fund cannot finance the project. Execution credits refunds before charging purchases, within the same rollback boundary. Empty drafts cannot be submitted. Layout, membership or policy changes cancel stale proposals and release reservations. Proposals expire after seven days; silence never counts as approval. Repeated monetary requests do not charge twice.

Paid construction removals and item sales return one third of the recorded purchase price, rounded down, to the owning account. Storing a personal item does not sell it. Starter items without a receipt have no refund. Construction receipts survive wall merging and splitting.

Private or personally assigned room boundaries cannot be demolished, divided or exposed through building edits. A team must first approve releasing the ownership/areas and opening access before changing the protected enclosure.

The September 17 governance migrations preserve balances, inventory, receipts and completed history. They remove weekly spending allowances and global build permissions, and cancel pending approvals created under the former rules so they can be resubmitted under team voting.

## Verification

`pnpm e2e:governance` builds the client and exercises tabbed administration, personal-area assignment, private placement and recovery, team voting, ownership previews, and desktop/mobile themes. Playwright serves production assets through routes and runs the real protocol/store/runtime in isolated memory without starting a development server. Screenshots and results are written to `artifacts/governance`.

`pnpm e2e:economy` checks purchases, donations, construction proposals, refunds and persisted state. Server tests cover same-fund net financing, insufficient funds, mixed ownership, protected boundaries, stale approvals and duplicate requests. `tests/governance-persistence.test.ts` verifies migration and storage using a disposable PostgreSQL database.
