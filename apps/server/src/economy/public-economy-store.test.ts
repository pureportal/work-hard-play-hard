import { describe, expect, it } from "vitest";
import { availablePublicMoney, createOrganisation, createPublicEconomy, type PublicAction } from "@workhard/shared";
import { PublicEconomyStore } from "./public-economy-store.js";
import { EconomyStore } from "./economy-store.js";
import { quoteProject } from "./project-quote.js";

const now = new Date("2026-09-16T12:00:00.000Z");
const organisation = createOrganisation();
const members = ["alice", "bob", "carol"];
const rules: PublicAction = { kind: "fund.policy", fundId: "workspace", mode: "equal", weeklyAllowance: 60, spendingLimits: [] };

describe("Public economy", () => {
  it("removes higher individual limits when switching to equal governance", () => {
    const economy = new PublicEconomyStore(createPublicEconomy("hierarchical"));
    economy.refresh(createOrganisation("alice"), members, now);
    economy.record("workspace", "alice", "donation", 900, "donation", now);
    economy.applyFundAction("alice", { kind: "fund.policy", fundId: "workspace", mode: "hierarchical", weeklyAllowance: 50,
      spendingLimits: [{ userId: "alice", amount: 300 }] }, "limits");
    expect(economy.fund("workspace").allowances.find((entry) => entry.userId === "alice")!.remaining).toBeGreaterThan(50);
    economy.applyFundAction("alice", { kind: "governance", mode: "equal", ceoIds: [] }, "equal");
    expect(economy.fund("workspace").allowances.map((entry) => entry.remaining)).toEqual([50, 50, 50]);
    expect(economy.fund("workspace").balance).toBe(900);
  });

  it("prevents competing projects from reserving the same money", () => {
    const economy = new PublicEconomyStore();
    economy.record("workspace", "alice", "donation", 300, "donation", now);
    const first = economy.propose("alice", "First", purchase(100), "workspace", organisation, members, now);
    expect(() => economy.propose("bob", "Second", purchase(100), "workspace", organisation, members, now)).toThrow("PUBLIC_FUNDS_INSUFFICIENT");
    economy.cancel("alice", first.id);
    expect(() => economy.propose("bob", "Second", purchase(100), "workspace", organisation, members, now)).not.toThrow();
    expect(economy.fund("workspace").balance).toBe(300);
  });

  it("allocates existing public money to a unit and preserves its separate voting rules", () => {
    const company = createOrganisation("alice");
    company.units = [{ id: "design", name: "Design", kind: "team", parentId: null }];
    company.assignments = [{ userId: "bob", unitId: "design", rank: "member" }, { userId: "carol", unitId: "design", rank: "member" }];
    const economy = new PublicEconomyStore(createPublicEconomy("hierarchical"));
    economy.refresh(company, members, now);
    economy.applyFundAction("alice", { kind: "fund.create", unitId: "design", mode: "equal", weeklyAllowance: 50 }, "create");
    economy.refresh(company, members, now);
    economy.record("workspace", "alice", "donation", 300, "donation", now);
    const transfer = economy.propose("alice", "Design budget", { kind: "fund.transfer", fromFundId: "workspace", toFundId: "design", amount: 200 }, "workspace", company, members, now);
    expect(transfer.status).toBe("approved");
    economy.proposal(transfer.id).status = "applied";
    economy.applyFundAction("alice", transfer.action, transfer.id);
    expect(economy.fund("workspace").balance).toBe(100);
    expect(economy.fund("design").balance).toBe(200);
    const proposal = economy.propose("bob", "Design rules", { ...rules, fundId: "design" }, "design", company, members, now);
    expect(proposal.electorate).toEqual(["bob", "carol"]);
    expect(proposal.required).toBe(2);
    expect(() => economy.vote("alice", proposal.id, true)).toThrow("PROPOSAL_VOTE_FORBIDDEN");
    economy.vote("carol", proposal.id, true);
    expect(economy.proposal(proposal.id).status).toBe("approved");
    const restored = new PublicEconomyStore();
    expect(() => restored.restoreState(economy.exportState())).not.toThrow();
  });

  it("reserves equal allowances from actual money, with no renewal minting", () => {
    const economy = new PublicEconomyStore();
    economy.refresh(organisation, members, now);
    expect(economy.fund("workspace").allowances.map((entry) => entry.remaining)).toEqual([0, 0, 0]);
    economy.record("workspace", "alice", "donation", 300, "donation", now);
    economy.fundAllowances("workspace");
    expect(economy.fund("workspace").allowances.map((entry) => entry.remaining)).toEqual([50, 50, 50]);
    expect(availablePublicMoney(economy.view(), "workspace")).toBe(150);
    economy.refresh(organisation, members, new Date("2026-09-23T12:00:00.000Z"));
    expect(economy.fund("workspace").balance).toBe(300);
    expect(economy.fund("workspace").allowances.map((entry) => entry.remaining)).toEqual([50, 50, 50]);
    expect(economy.view().transactions).toHaveLength(1);
  });

  it("counts cumulative spending and protects the other members' allowances", () => {
    const economy = new PublicEconomyStore();
    economy.refresh(organisation, members, now);
    economy.record("workspace", "alice", "donation", 300, "donation", now);
    economy.fundAllowances("workspace");
    const action = purchase(30);
    expect(economy.canUseAllowance("alice", action)).toBe(true);
    economy.spendAllowance("alice", action);
    economy.applyProject("alice", action.project);
    expect(economy.canUseAllowance("alice", purchase(30))).toBe(false);
    expect(economy.canUseAllowance("bob", purchase(50))).toBe(true);
    expect(economy.fund("workspace").allowances[0]).toMatchObject({ remaining: 20, spent: 30 });
    const restored = new PublicEconomyStore();
    restored.restoreState(economy.exportState());
    expect(restored.canUseAllowance("alice", purchase(30))).toBe(false);
  });

  it("requires more than half of all members and never treats silence as consent", () => {
    const economy = new PublicEconomyStore();
    const proposal = economy.propose("alice", "Allowance", rules, "workspace", organisation, members, now);
    expect(proposal.status).toBe("open");
    expect(proposal.required).toBe(2);
    expect(() => economy.vote("alice", proposal.id, true)).toThrow("PROPOSAL_ALREADY_VOTED");
    expect(() => economy.vote("outsider", proposal.id, true)).toThrow("PROPOSAL_VOTE_FORBIDDEN");
    economy.refresh(organisation, members, new Date("2026-09-24T12:00:00.000Z"));
    expect(economy.proposal(proposal.id).status).toBe("expired");
    expect(() => economy.vote("bob", proposal.id, true)).toThrow("PROPOSAL_CLOSED");
  });

  it("holds project funds and releases reservations on rejection", () => {
    const economy = new PublicEconomyStore();
    economy.record("workspace", "alice", "donation", 300, "donation", now);
    const project = purchase(100);
    project.project.quote.structural = true;
    project.project.quote.requiresApproval = true;
    const proposal = economy.propose("alice", "Wall", project, "workspace", organisation, members, now);
    expect(availablePublicMoney(economy.view(), "workspace")).toBe(50);
    economy.vote("bob", proposal.id, false);
    economy.vote("carol", proposal.id, false);
    expect(economy.proposal(proposal.id).status).toBe("rejected");
    expect(availablePublicMoney(economy.view(), "workspace")).toBe(150);
    expect(economy.fund("workspace").balance).toBe(300);
  });

  it("gives CEOs approval authority without free or unbounded spending", () => {
    const company = createOrganisation("alice");
    const economy = new PublicEconomyStore(createPublicEconomy("hierarchical"));
    expect(() => economy.propose("alice", "Wall", purchase(100), "workspace", company, members, now)).toThrow("PUBLIC_FUNDS_INSUFFICIENT");
    economy.record("workspace", "alice", "donation", 300, "donation", now);
    economy.fundAllowances("workspace");
    expect(economy.propose("alice", "Wall", purchase(100), "workspace", company, members, now).status).toBe("approved");
  });

  it("invalidates approvals when the electorate or policy changes", () => {
    const economy = new PublicEconomyStore();
    const proposal = economy.propose("alice", "Allowance", rules, "workspace", organisation, members, now);
    economy.vote("bob", proposal.id, true);
    expect(economy.proposal(proposal.id).status).toBe("approved");
    economy.refresh({ ...organisation, revision: 1 }, members, now);
    expect(economy.proposal(proposal.id).status).toBe("cancelled");
  });

  it("refunds paid wall segments once even after walls merge or split", () => {
    const original = { floorId: "floor", revision: 0, walls: [], openings: [], objects: [], tiles: [], rooms: [] };
    const built = { ...original, walls: [{ id: "wall", start: { x: 0, y: 0 }, end: { x: 96, y: 0 } }] };
    const quote = quoteProject(original, built, "workspace", []);
    expect(quote.cost).toBe(36);
    const partial = { ...built, walls: [{ id: "different-id", start: { x: 0, y: 0 }, end: { x: 64, y: 0 } }] };
    const removal = quoteProject(built, partial, "workspace", quote.purchases);
    expect(removal).toMatchObject({ cost: 0, refund: 4, structural: true });
    expect(quoteProject(built, original, "workspace", []).refund).toBe(0);
  });
});

describe("Personal asset disposition", () => {
  it("sells at the recorded purchase price, is idempotent, and survives restoration", () => {
    const economy = new EconomyStore(["alice"], now);
    const purchase = economy.purchaseAsset("alice", "plant-floor", "buy", now);
    const owned = purchase.economy.inventory[0]!;
    const result = economy.disposeAsset("alice", owned.id, "asset_sale", "sell", undefined, now);
    expect(result.transaction.amount).toBe(Math.floor(owned.purchasePrice / 3));
    expect(economy.disposeAsset("alice", owned.id, "asset_sale", "sell", undefined, now).replayed).toBe(true);
    expect(() => economy.disposeAsset("alice", owned.id, "asset_sale", "sell-again", undefined, now)).toThrow("ASSET_NOT_OWNED");
    const restored = new EconomyStore([]);
    restored.restoreState(economy.exportState());
    expect(restored.getPlayerEconomy("alice").coinBalance).toBe(result.economy.coinBalance);
    expect(restored.getPlayerEconomy("alice").inventory).toEqual([]);
  });

  it("does not sell permanent flooring into personal ownership", () => {
    const economy = new EconomyStore(["alice"], now);
    expect(() => economy.purchaseAsset("alice", "floor-wood", "floor", now)).toThrow("ASSET_UNAVAILABLE");
    expect(economy.getPlayerEconomy("alice").coinBalance).toBe(250);
  });
});

function purchase(cost: number): Extract<PublicAction, { kind: "project" }> {
  return { kind: "project", project: { id: "draft", fundId: "workspace", floorId: "floor", baseRevision: 0, edits: 1,
    layout: { floorId: "floor", revision: 1, walls: [], openings: [], objects: [], tiles: [], rooms: [] },
    quote: { cost, refund: 0, refunds: [], structural: false, destructive: false, requiresApproval: false, purchases: [], removedKeys: [], inventoryIds: [] } } };
}
