import { describe, expect, it } from "vitest";
import { availablePublicMoney, createOrganisation, createPublicEconomy, type PublicAction } from "@workhard/shared";
import { PublicEconomyStore } from "./public-economy-store.js";
import { EconomyStore } from "./economy-store.js";
import { quoteProject } from "./project-quote.js";

const now = new Date("2026-09-16T12:00:00.000Z");
const organisation = createOrganisation();
const members = ["alice", "bob", "carol"];
const rules: PublicAction = { kind: "governance", mode: "equal", ceoIds: [] };

describe("Public economy", () => {
  it.each(["equal", "hierarchical"] as const)("requires a team majority in %s mode, including for CEOs", (mode) => {
    const economy = new PublicEconomyStore(createPublicEconomy(mode));
    const company = createOrganisation("alice");
    expect(() => economy.propose("alice", "Wall", purchase(60), "workspace", company, members, now)).toThrow("PUBLIC_FUNDS_INSUFFICIENT");
    economy.record("workspace", "alice", "donation", 100, "donation", now);
    const proposal = economy.propose("alice", "Wall", purchase(60), "workspace", company, members, now);
    expect(proposal).toMatchObject({ status: "open", required: 2, electorate: members, reserved: 60 });
    expect(() => economy.vote("alice", proposal.id, true)).toThrow("PROPOSAL_ALREADY_VOTED");
    economy.vote("bob", proposal.id, true);
    expect(economy.proposal(proposal.id).status).toBe("approved");
  });

  it("reserves and charges net project cost using refunds to the paying fund", () => {
    const economy = new PublicEconomyStore();
    economy.record("workspace", "alice", "donation", 40, "donation", now);
    const action = purchase(60);
    action.project.quote.refund = 20;
    action.project.quote.refunds = [{ fundId: "workspace", amount: 20 }];
    const proposal = economy.propose("alice", "Replace furniture", action, "workspace", organisation, members, now);
    expect(proposal.reserved).toBe(40);
    expect(availablePublicMoney(economy.view(), "workspace")).toBe(0);
    economy.vote("bob", proposal.id, true);
    economy.proposal(proposal.id).status = "applied";
    economy.applyProject("alice", action.project);
    expect(economy.fund("workspace").balance).toBe(0);
    const restored = new PublicEconomyStore();
    expect(() => restored.restoreState(economy.exportState())).not.toThrow();
  });

  it("does not use refunds returning to another fund", () => {
    const economy = new PublicEconomyStore();
    economy.record("workspace", "alice", "donation", 40, "donation", now);
    const action = purchase(60);
    action.project.quote.refund = 20;
    action.project.quote.refunds = [{ fundId: "design", amount: 20 }];
    expect(() => economy.propose("alice", "Replace furniture", action, "workspace", organisation, members, now)).toThrow("PUBLIC_FUNDS_INSUFFICIENT");
  });

  it("keeps fund electorates scoped to their teams", () => {
    const company = createOrganisation("alice");
    company.units = [{ id: "design", name: "Design", kind: "team", parentId: null }];
    company.assignments = ["bob", "carol"].map((userId) => ({ userId, unitId: "design", rank: "member" }));
    const economy = new PublicEconomyStore();
    economy.applyFundAction("alice", { kind: "fund.create", unitId: "design", mode: "equal" }, "create");
    const proposal = economy.propose("bob", "Design", purchase(0), "design", company, members, now);
    expect(proposal.electorate).toEqual(["bob", "carol"]);
    expect(() => economy.vote("alice", proposal.id, true)).toThrow("PROPOSAL_VOTE_FORBIDDEN");
    economy.vote("carol", proposal.id, true);
    expect(economy.proposal(proposal.id).status).toBe("approved");
  });

  it("expires unanswered proposals and releases rejected reservations", () => {
    const economy = new PublicEconomyStore();
    economy.record("workspace", "alice", "donation", 300, "donation", now);
    const proposal = economy.propose("alice", "Wall", purchase(100), "workspace", organisation, members, now);
    expect(availablePublicMoney(economy.view(), "workspace")).toBe(200);
    economy.vote("bob", proposal.id, false);
    economy.vote("carol", proposal.id, false);
    expect(economy.proposal(proposal.id).status).toBe("rejected");
    expect(availablePublicMoney(economy.view(), "workspace")).toBe(300);
    const unanswered = economy.propose("alice", "Rules", rules, "workspace", organisation, members, now);
    economy.refresh(organisation, members, new Date("2026-09-24T12:00:00.000Z"));
    expect(economy.proposal(unanswered.id).status).toBe("expired");
    expect(economy.fund("workspace").balance).toBe(300);
  });

  it("invalidates approvals after membership or policy changes", () => {
    const economy = new PublicEconomyStore();
    const proposal = economy.propose("alice", "Rules", rules, "workspace", organisation, members, now);
    economy.vote("bob", proposal.id, true);
    economy.refresh({ ...organisation, revision: 1 }, members, now);
    expect(economy.proposal(proposal.id).status).toBe("cancelled");
  });

  it("refunds one third of actual paid construction, including split walls", () => {
    const original = { floorId: "floor", revision: 0, walls: [], openings: [], objects: [], tiles: [], rooms: [] };
    const built = { ...original, walls: [{ id: "wall", start: { x: 0, y: 0 }, end: { x: 96, y: 0 } }] };
    const quote = quoteProject(original, built, "workspace", []);
    expect(quote.cost).toBe(36);
    const partial = { ...built, walls: [{ id: "other", start: { x: 0, y: 0 }, end: { x: 64, y: 0 } }] };
    expect(quoteProject(built, partial, "workspace", quote.purchases)).toMatchObject({ cost: 0, refund: 4, structural: true });
    expect(quoteProject(built, original, "workspace", []).refund).toBe(0);
  });
});

describe("Personal asset disposition", () => {
  it("sells at the recorded purchase price, is idempotent, and survives restoration", () => {
    const economy = new EconomyStore(["alice"], now);
    const purchase = economy.purchaseAsset("alice", "plant-floor", "buy", now);
    const owned = economy.getOwnedAsset("alice", purchase.transaction.ownedAssetId!);
    const result = economy.disposeAsset("alice", owned.id, "asset_sale", "sell", undefined, now);
    expect(result.transaction.amount).toBe(Math.floor(owned.purchasePrice / 3));
    expect(economy.disposeAsset("alice", owned.id, "asset_sale", "sell", undefined, now).replayed).toBe(true);
    expect(() => economy.disposeAsset("alice", owned.id, "asset_sale", "sell-again", undefined, now)).toThrow("ASSET_NOT_OWNED");
    const restored = new EconomyStore([]);
    restored.restoreState(economy.exportState());
    expect(restored.getPlayerEconomy("alice").coinBalance).toBe(result.economy.coinBalance);
    expect(restored.getPlayerEconomy("alice").inventory).toEqual(purchase.economy.inventory.filter((asset) => asset.id !== owned.id));
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
    quote: { assetChanges: [], cost, refund: 0, refunds: [], structural: false, destructive: false, requiresApproval: false, purchases: [], removedKeys: [], inventoryIds: [] } } };
}
