import { fireEvent, render, screen } from "@testing-library/react";
import { createOrganisation, createPublicEconomy, type Floor, type FloorLayout, type SpendingProposal } from "@workhard/shared";
import { describe, expect, it, vi } from "vitest";
import { SpendingProposals } from "./SpendingProposals";

const base: FloorLayout = { floorId: "floor", revision: 0, walls: [], openings: [], objects: [], tiles: [], rooms: [] };
const chair = (id: string) => ({ id, floorId: "floor", assetId: "chair-office", variantId: "white", rotation: 0 as const, x: 64, y: 64 });

describe("project conflicts in approvals", () => {
  it("shows the overlap and lets the creator edit while blocking application", () => {
    const economy = createPublicEconomy();
    economy.funds[0]!.balance = 100;
    const project = { id: "draft", fundId: "workspace", floorId: "floor", baseRevision: 0, baseLayout: base,
      layout: { ...base, revision: 1, objects: [chair("draft-chair")] }, edits: 1,
      quote: { assetChanges: [], cost: 48, refund: 0, refunds: [], structural: false, destructive: false,
        requiresApproval: true, purchases: [], removedKeys: [], inventoryIds: [] } };
    const proposal: SpendingProposal = { id: "proposal", title: "Chair", proposedBy: "alice", fundId: "workspace",
      action: { kind: "project", project }, electorate: ["alice"], approvalRate: 51, required: 1,
      ballots: [{ userId: "alice", approve: true }], status: "approved", reserved: 0,
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 10_000).toISOString(),
      organisationRevision: 0, policyRevision: 0 };
    const onEdit = vi.fn();
    render(<SpendingProposals proposals={[proposal]} economy={economy} organisation={createOrganisation()} members={[]}
      userId="alice" pending={false} rooms={[]} layouts={[{ ...base, revision: 1, objects: [chair("other-chair")] }]}
      floors={[{ id: "floor", width: 640, height: 640 } as Floor]} onCommand={vi.fn()} onReview={vi.fn()} onEdit={onEdit} />);
    expect(screen.getByText(/Overlaps:/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Apply proposal" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Edit draft" }));
    expect(onEdit).toHaveBeenCalledWith(proposal);
  });
});
