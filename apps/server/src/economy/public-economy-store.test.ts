import { afterEach, describe, expect, it, vi } from "vitest";
import { availablePublicMoney, createOrganisation, createPublicEconomy, type PublicAction } from "@workhard/shared";
import { PublicEconomyStore } from "./public-economy-store.js";
import { EconomyStore } from "./economy-store.js";
import { quoteProject } from "./project-quote.js";

const now = new Date("2026-09-16T12:00:00.000Z");
const organisation = createOrganisation();
const members = ["alice", "bob", "carol"];
const rules: PublicAction = { kind: "governance", mode: "equal", ceoIds: [] };

afterEach(() => vi.unstubAllEnvs());

describe("Public economy", () => {
  it("uses the configured rate for each category and keeps it with the proposal", () => {
    const economy = new PublicEconomyStore();
    economy.updateApprovalRates({ serverSettings: 75, building: 25, organisation: 100, funds: 0 });
    const server = economy.propose("alice", "Settings", { kind: "game.settings", settings: new EconomyStore(members).getGameSettings() }, "workspace", organisation, members, now);
    expect(server).toMatchObject({ approvalRate: 75, required: 3, status: "open" });
    const building = economy.propose("alice", "Wall", purchase(0), "workspace", organisation, members, now);
    expect(building).toMatchObject({ approvalRate: 25, required: 1, status: "approved" });
    const organisationProposal = economy.propose("alice", "Rules", rules, "workspace", organisation, members, now);
    expect(organisationProposal).toMatchObject({ approvalRate: 100, required: 3, status: "open" });
    const funds = economy.propose("alice", "Fund", { kind: "fund.create", unitId: "design", mode: "equal" }, "workspace", organisation, members, now);
    expect(funds).toMatchObject({ approvalRate: 0, required: 0, status: "approved", ballots: [] });
    economy.updateApprovalRates({ serverSettings: 51, building: 51, organisation: 51, funds: 51 });
    expect(economy.proposal(server.id)).toMatchObject({ approvalRate: 75, required: 3 });
    const restored = new PublicEconomyStore();
    restored.restoreState(economy.exportState());
    expect(restored.getApprovalRates().serverSettings).toBe(51);
    expect(restored.proposal(funds.id).approvalRate).toBe(0);
  });

  it("uses the configured percentage of submitted votes at the deadline", () => {
    const economy = new PublicEconomyStore();
    economy.updateApprovalRates({ serverSettings: 51, building: 51, organisation: 75, funds: 51 });
    const proposal = economy.propose("alice", "Rules", rules, "workspace", organisation, [...members, "dan"], now);
    economy.vote("bob", proposal.id, true, now);
    economy.vote("carol", proposal.id, false, now);
    economy.refresh(organisation, [...members, "dan"], new Date(proposal.expiresAt));
    expect(economy.proposal(proposal.id)).toMatchObject({ status: "rejected", required: 3 });
  });

  it.each([["development", 10_000], ["production", 7 * 86_400_000]] as const)("sets the %s voting deadline", (environment, duration) => {
    vi.stubEnv("NODE_ENV", environment);
    const economy = new PublicEconomyStore();
    const proposal = economy.propose("alice", "Rules", rules, "workspace", organisation, members, now);
    expect(Date.parse(proposal.expiresAt) - Date.parse(proposal.createdAt)).toBe(duration);
  });

  it("counts only submitted votes at the deadline and keeps approval after it", () => {
    const economy = new PublicEconomyStore();
    const voters = [...members, "dan", "eve"];
    const proposal = economy.propose("alice", "Rules", rules, "workspace", organisation, voters, now);
    economy.vote("bob", proposal.id, true, now);
    economy.vote("carol", proposal.id, false, now);
    const deadline = new Date(proposal.expiresAt);
    economy.refresh(organisation, voters, new Date(deadline.getTime() - 1));
    expect(economy.proposal(proposal.id).status).toBe("open");
    economy.refresh(organisation, voters, deadline);
    expect(economy.proposal(proposal.id)).toMatchObject({ status: "approved", required: 2 });
    economy.refresh(organisation, voters, new Date(deadline.getTime() + 86_400_000));
    expect(economy.proposal(proposal.id).status).toBe("approved");
    const restored = new PublicEconomyStore();
    restored.restoreState(economy.exportState());
    expect(restored.proposal(proposal.id)).toMatchObject({ status: "approved", required: 2 });
  });

  it("rejects tied votes and releases reserved money at the deadline", () => {
    const economy = new PublicEconomyStore();
    economy.record("workspace", "alice", "donation", 100, "donation", now);
    const proposal = economy.propose("alice", "Wall", purchase(100), "workspace", organisation, members, now);
    economy.vote("bob", proposal.id, false, now);
    expect(economy.proposal(proposal.id).status).toBe("open");
    economy.refresh(organisation, members, new Date(proposal.expiresAt));
    expect(economy.proposal(proposal.id).status).toBe("rejected");
    expect(availablePublicMoney(economy.view(), "workspace")).toBe(100);
  });

  it("expires a proposal with no votes", () => {
    const company = createOrganisation("alice");
    company.units = [{ id: "design", name: "Design", kind: "team", parentId: null }];
    company.assignments = [{ userId: "bob", unitId: "design", rank: "member" }];
    const economy = new PublicEconomyStore();
    economy.applyFundAction("alice", { kind: "fund.create", unitId: "design", mode: "equal" }, "create");
    const proposal = economy.propose("alice", "Wall", purchase(0), "design", company, members, now);
    expect(proposal.ballots).toEqual([]);
    economy.refresh(company, members, new Date(proposal.expiresAt));
    expect(economy.proposal(proposal.id).status).toBe("expired");
  });

  it("does not accept a vote arriving at the deadline", () => {
    const economy = new PublicEconomyStore();
    const proposal = economy.propose("alice", "Rules", rules, "workspace", organisation, members, now);
    expect(() => economy.vote("bob", proposal.id, false, new Date(proposal.expiresAt))).toThrow("PROPOSAL_CLOSED");
    expect(economy.proposal(proposal.id)).toMatchObject({ status: "approved", ballots: [{ userId: "alice", approve: true }] });
  });

  it("requires more than half the electorate for early acceptance", () => {
    const economy = new PublicEconomyStore();
    const voters = [...members, "dan"];
    const proposal = economy.propose("alice", "Rules", rules, "workspace", organisation, voters, now);
    economy.vote("bob", proposal.id, true, now);
    expect(economy.proposal(proposal.id).status).toBe("open");
    economy.vote("carol", proposal.id, true, now);
    expect(economy.proposal(proposal.id).status).toBe("approved");
  });

  it("cancels an invalidated proposal instead of approving it at the deadline", () => {
    const economy = new PublicEconomyStore();
    const proposal = economy.propose("alice", "Rules", rules, "workspace", organisation, members, now);
    economy.refresh({ ...organisation, revision: 1 }, members, new Date(proposal.expiresAt));
    expect(economy.proposal(proposal.id).status).toBe("cancelled");
  });

  it.each(["equal", "hierarchical"] as const)("accepts unfunded projects and requires a team majority in %s mode, including for CEOs", (mode) => {
    const economy = new PublicEconomyStore(createPublicEconomy(mode));
    const company = createOrganisation("alice");
    const proposal = economy.propose("alice", "Wall", purchase(60), "workspace", company, members, now);
    expect(proposal).toMatchObject({ status: "open", required: 2, electorate: members, reserved: 0 });
    expect(() => economy.vote("alice", proposal.id, true, now)).toThrow("PROPOSAL_ALREADY_VOTED");
    economy.vote("bob", proposal.id, true, now);
    expect(economy.proposal(proposal.id).status).toBe("approved");
  });

  it("charges net project cost using refunds to the paying fund at application", () => {
    const economy = new PublicEconomyStore();
    economy.record("workspace", "alice", "donation", 40, "donation", now);
    const action = purchase(60);
    action.project.quote.refund = 20;
    action.project.quote.refunds = [{ fundId: "workspace", amount: 20 }];
    const proposal = economy.propose("alice", "Replace furniture", action, "workspace", organisation, members, now);
    expect(proposal.reserved).toBe(0);
    expect(availablePublicMoney(economy.view(), "workspace")).toBe(40);
    economy.vote("bob", proposal.id, true, now);
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
    economy.propose("alice", "Replace furniture", action, "workspace", organisation, members, now);
    expect(() => economy.applyProject("alice", action.project)).toThrow("PUBLIC_FUNDS_INSUFFICIENT");
    expect(economy.fund("workspace").balance).toBe(40);
  });

  it("lets multiple projects seek approval but checks the shared balance for each application", () => {
    const economy = new PublicEconomyStore();
    economy.record("workspace", "alice", "donation", 100, "donation", now);
    const first = purchase(60);
    const second = purchase(60);
    second.project.id = "second";
    economy.propose("alice", "First", first, "workspace", organisation, members, now);
    economy.propose("bob", "Second", second, "workspace", organisation, members, now);
    expect(availablePublicMoney(economy.view(), "workspace")).toBe(100);
    economy.applyProject("alice", first.project);
    expect(economy.fund("workspace").balance).toBe(40);
    expect(() => economy.applyProject("bob", second.project)).toThrow("PUBLIC_FUNDS_INSUFFICIENT");
    expect(economy.fund("workspace").balance).toBe(40);
  });

  it("keeps fund electorates scoped to their teams", () => {
    const company = createOrganisation("alice");
    company.units = [{ id: "design", name: "Design", kind: "team", parentId: null }];
    company.assignments = ["bob", "carol"].map((userId) => ({ userId, unitId: "design", rank: "member" }));
    const economy = new PublicEconomyStore();
    economy.applyFundAction("alice", { kind: "fund.create", unitId: "design", mode: "equal" }, "create");
    const proposal = economy.propose("bob", "Design", purchase(0), "design", company, members, now);
    expect(proposal.electorate).toEqual(["bob", "carol"]);
    expect(() => economy.vote("alice", proposal.id, true, now)).toThrow("PROPOSAL_VOTE_FORBIDDEN");
    economy.vote("carol", proposal.id, true, now);
    expect(economy.proposal(proposal.id).status).toBe("approved");
  });

  it("releases rejected reservations and approves the only submitted vote at the deadline", () => {
    const economy = new PublicEconomyStore();
    economy.record("workspace", "alice", "donation", 300, "donation", now);
    const proposal = economy.propose("alice", "Wall", purchase(100), "workspace", organisation, members, now);
    expect(availablePublicMoney(economy.view(), "workspace")).toBe(300);
    economy.vote("bob", proposal.id, false, now);
    economy.vote("carol", proposal.id, false, now);
    expect(economy.proposal(proposal.id).status).toBe("rejected");
    expect(availablePublicMoney(economy.view(), "workspace")).toBe(300);
    const unanswered = economy.propose("alice", "Rules", rules, "workspace", organisation, members, now);
    economy.refresh(organisation, members, new Date("2026-09-24T12:00:00.000Z"));
    expect(economy.proposal(unanswered.id).status).toBe("approved");
    expect(economy.fund("workspace").balance).toBe(300);
  });

  it("invalidates approvals after membership or policy changes", () => {
    const economy = new PublicEconomyStore();
    const proposal = economy.propose("alice", "Rules", rules, "workspace", organisation, members, now);
    economy.vote("bob", proposal.id, true, now);
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
    baseLayout: { floorId: "floor", revision: 0, walls: [], openings: [], objects: [], tiles: [], rooms: [] },
    layout: { floorId: "floor", revision: 1, walls: [], openings: [], objects: [], tiles: [], rooms: [] },
    quote: { assetChanges: [], cost, refund: 0, refunds: [], structural: false, destructive: false, requiresApproval: false, purchases: [], removedKeys: [], inventoryIds: [] } } };
}
