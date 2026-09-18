import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrganisation, createPublicEconomy, type Member, type SpendingProposal } from "@workhard/shared";
import { FundsPanel } from "./FundsPanel";
import { ProjectToolbar } from "./ProjectToolbar";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Approvals", () => {
  it("counts down to the voting deadline and stops offering votes when it closes", () => {
    vi.useFakeTimers();
    const economy = createPublicEconomy();
    economy.proposals.push({ ...proposal(), expiresAt: new Date(Date.now() + 10_000).toISOString() });
    renderPanel(vi.fn(), economy, "bob");
    expect(screen.getByText("10s left")).toBeTruthy();
    act(() => vi.advanceTimersByTime(9_000));
    expect(screen.getByText("1s left")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.getByText("Counting votes…")).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
  });

  it("keeps an approved proposal available after its voting deadline", () => {
    const economy = createPublicEconomy();
    economy.proposals.push({ ...proposal(), status: "approved", required: 1, expiresAt: new Date(Date.now() - 1_000).toISOString() });
    renderPanel(vi.fn(), economy);
    expect(screen.getByRole("button", { name: "Apply proposal" })).toBeTruthy();
    expect(screen.getByText("Ready to apply")).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
  });

  it("keeps donation controls out of Approvals", () => {
    renderPanel();
    expect(screen.queryByRole("tab", { name: "Donate" })).toBeNull();
    expect(screen.queryByRole("spinbutton", { name: "Donation" })).toBeNull();
  });

  it("shows one vote per member and permits the next eligible vote", () => {
    const economy = createPublicEconomy();
    economy.proposals.push(proposal());
    const onCommand = vi.fn();
    renderPanel(onCommand, economy, "bob");
    expect(screen.getByText("1 / 2 approvals")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ type: "public_economy.vote", approve: true, proposalId: "proposal" }));
    expect(screen.queryByRole("button", { name: "Apply proposal" })).toBeNull();
  });

  it("does not offer a second vote to the proposer or a vote to outsiders", () => {
    const economy = createPublicEconomy();
    economy.proposals.push(proposal());
    const first = renderPanel(vi.fn(), economy);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    first.unmount();
    renderPanel(vi.fn(), economy, "outsider");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel proposal" })).toBeNull();
  });

  it("keeps construction in a proposal even when the fund can afford it", () => {
    const economy = createPublicEconomy();
    economy.funds[0]!.balance = 200;
    const onSubmit = vi.fn();
    render(<ProjectToolbar economy={economy} organisation={createOrganisation()} userId="alice" fundId="workspace" title="Wall" onTitleChange={vi.fn()} pending={false} reviewing={false}
      project={{ id: "draft", fundId: "workspace", floorId: "floor", baseRevision: 0, edits: 1,
        layout: { floorId: "floor", revision: 1, walls: [], openings: [], objects: [], rooms: [], tiles: [] },
        quote: { assetChanges: [], cost: 12, refund: 0, refunds: [], structural: true, destructive: false, requiresApproval: true, purchases: [], removedKeys: [], inventoryIds: [] } }}
      onFundChange={vi.fn()} onDiscard={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Propose project" }));
    expect(onSubmit).toHaveBeenCalledWith("Wall");
    expect(screen.queryByRole("button", { name: "Buy & place" })).toBeNull();
  });
});

function renderPanel(onCommand = vi.fn(), economy = createPublicEconomy(), userId = "alice") {
  return render(<FundsPanel rooms={[]} economy={economy} organisation={createOrganisation()} members={[] as Member[]} userId={userId}
    globalSettings={{ enabled: false, targetPolicy: { mode: "allow_all", userIds: [] } }} onOpenRooms={vi.fn()} personalBalance={250} pending={false} onCommand={onCommand} onReview={vi.fn()} onPlace={vi.fn()} onViewChange={vi.fn()} onClose={vi.fn()} />);
}

function proposal(): SpendingProposal {
  return { id: "proposal", title: "Spending rules", proposedBy: "alice", fundId: "workspace",
    action: { kind: "governance", mode: "equal", ceoIds: [] },
    electorate: ["alice", "bob", "carol"], required: 2, ballots: [{ userId: "alice", approve: true }], status: "open", reserved: 0,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), organisationRevision: 0, policyRevision: 0 };
}
