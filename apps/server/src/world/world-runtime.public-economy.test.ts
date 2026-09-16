import { clientCommandSchema } from "../protocol.js";
import { afterEach, describe, expect, it } from "vitest";
import { createPublicEconomy, createOrganisation, type ClientCommand, type ServerEvent } from "@workhard/shared";
import { createTestData } from "../testing/workspace-data.js";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

const runtimes: WorldRuntime[] = [];
afterEach(() => { for (const runtime of runtimes.splice(0)) runtime.stop(); });

function setup() {
  const data = createTestData();
  data.members = data.members.filter((member) => ["user-maya", "user-jonas", "user-priya"].includes(member.id));
  data.organisation = createOrganisation();
  data.publicEconomy = createPublicEconomy();
  data.gameSettings.roomBuild = { mode: "open", assignedPersonIds: [] };
  data.layouts = data.layouts.map((layout) => ({ ...layout, revision: 0, walls: [], openings: [], rooms: [], objects: [], tiles: [] }));
  const store = new WorkspaceStore(data);
  const runtime = new WorldRuntime(store);
  runtimes.push(runtime);
  const events: ServerEvent[] = [];
  const maya = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));
  const jonas = runtime.connect("user-jonas", "floor-studio", (event) => events.push(event));
  const send = (command: ClientCommand, peer = maya) => runtime.handleCommand(peer, command);
  return { store, runtime, events, send, maya, jonas };
}

describe("Shared building protocol", () => {
  it("rejects an empty draft without spending money or invalidating other projects", () => {
    const { store, events, send } = setup();
    send({ type: "project.edit", requestId: "add", baseRevision: 0, fundId: "workspace",
      edit: { tool: "wall", start: { x: -256, y: -256 }, end: { x: -128, y: -256 } } });
    const added = events.find((event) => event.type === "project.preview");
    if (added?.type !== "project.preview") throw new Error("Missing wall preview");
    send({ type: "project.edit", requestId: "undo", baseRevision: 0, fundId: "workspace", draftId: added.project.id,
      edit: { tool: "item.remove", item: { type: "wall", id: added.project.layout.walls[0]!.id } } });
    send({ type: "project.submit", requestId: "empty", draftId: added.project.id, title: "Empty project" });
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "empty", code: "PROJECT_EMPTY" }));
    expect(store.getLayout("floor-studio")!.revision).toBe(0);
    expect(store.getPublicEconomy().proposals).toEqual([]);
    expect(store.getPublicEconomy().funds[0]!.balance).toBe(0);
  });

  it("uses an equal department's vote for subteam rooms and blocks a direct CEO override", () => {
    const { store, runtime, events, send, jonas } = setup();
    const organisation = store.getOrganisation();
    organisation.ceoIds = ["user-maya"];
    organisation.units = [{ id: "design", name: "Design", kind: "department", parentId: null },
      { id: "studio", name: "Studio", kind: "team", parentId: "design" }];
    organisation.assignments = ["user-jonas", "user-priya"].map((userId) => ({ userId, unitId: "studio", rank: "member" }));
    store.publicEconomy.fund("workspace").mode = "hierarchical";
    store.publicEconomy.applyFundAction("user-maya", { kind: "fund.create", unitId: "design", mode: "equal", weeklyAllowance: 50 }, "department");
    const room = { id: "studio-room", floorId: "floor-studio", name: "Studio", color: "#ffffff", capacity: 4,
      bounds: { x: 96, y: 96, width: 64, height: 64 }, footprint: [{ x: 96, y: 96, width: 64, height: 64 }],
      boundary: [], doorIds: [], windowIds: [], privateEligible: false, organisationUnitId: "studio",
      access: { mode: "open" as const, assignedPersonIds: [], knockable: false }, build: { mode: "open" as const, assignedPersonIds: [] } };
    store.getLayout("floor-studio")!.rooms.push(room);
    const settings = { name: "Design studio", color: room.color, organisationUnitId: "studio", access: room.access, build: room.build };
    send({ type: "room.update_settings", requestId: "override", roomId: room.id, baseRevision: 0, settings });
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "override", code: "PROJECT_APPROVAL_REQUIRED" }));
    send({ type: "public_economy.propose", requestId: "propose", title: "Studio name",
      action: { kind: "room.settings", roomId: room.id, baseRevision: 0, settings } }, jonas);
    const proposal = store.getPublicEconomy().proposals[0]!;
    expect(proposal).toMatchObject({ fundId: "design", electorate: ["user-jonas", "user-priya"], required: 2 });
    send({ type: "public_economy.vote", requestId: "ceo-vote", proposalId: proposal.id, approve: true });
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "ceo-vote", code: "PROPOSAL_VOTE_FORBIDDEN" }));
    const priya = runtime.connect("user-priya", "floor-studio", (event) => events.push(event));
    send({ type: "public_economy.vote", requestId: "team-vote", proposalId: proposal.id, approve: true }, priya);
    send({ type: "public_economy.execute", requestId: "apply", proposalId: proposal.id }, jonas);
    expect(store.getRoom(room.id)!.name).toBe("Design studio");
  });

  it("previews a whole project, waits for a majority, charges once, and refunds demolition", () => {
    const { store, events, send, jonas } = setup();
    send({ type: "economy.donate", requestId: "donate", fundId: "workspace", amount: 250 });
    send({ type: "economy.donate", requestId: "donate", fundId: "workspace", amount: 250 });
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(0);
    expect(store.getPublicEconomy().funds[0]!.balance).toBe(250);
    send({ type: "project.edit", requestId: "preview", baseRevision: 0, fundId: "workspace", edit: { tool: "wall", start: { x: -256, y: -256 }, end: { x: -128, y: -256 } } });
    const preview = events.find((event) => event.type === "project.preview");
    expect(preview?.type).toBe("project.preview");
    if (preview?.type !== "project.preview") throw new Error(JSON.stringify(events.filter((event) => event.type === "command.error")));
    expect(preview.project.quote.cost).toBe(48);
    expect(store.getLayout("floor-studio")!.walls).toHaveLength(0);
    send({ type: "project.submit", requestId: "submit", draftId: preview.project.id, title: "Garden wall" });
    const proposal = store.getPublicEconomy().proposals[0]!;
    expect(proposal.status).toBe("open");
    send({ type: "public_economy.execute", requestId: "too-early", proposalId: proposal.id });
    expect(store.getLayout("floor-studio")!.walls).toHaveLength(0);
    send({ type: "public_economy.vote", requestId: "vote", proposalId: proposal.id, approve: true }, jonas);
    send({ type: "public_economy.execute", requestId: "execute", proposalId: proposal.id });
    send({ type: "public_economy.execute", requestId: "replay", proposalId: proposal.id });
    expect(store.getLayout("floor-studio")!.walls).toHaveLength(1);
    expect(store.getPublicEconomy().funds[0]!.balance).toBe(202);
    const layout = store.getLayout("floor-studio")!;
    send({ type: "project.edit", requestId: "remove", baseRevision: layout.revision, fundId: "workspace", edit: { tool: "item.remove", item: { type: "wall", id: layout.walls[0]!.id } } });
    const removal = events.filter((event) => event.type === "project.preview").at(-1)!;
    expect(removal.project.quote.refund).toBe(16);
    send({ type: "project.submit", requestId: "remove-submit", draftId: removal.project.id, title: "Remove wall" });
    const sale = store.getPublicEconomy().proposals.at(-1)!;
    send({ type: "public_economy.vote", requestId: "remove-vote", proposalId: sale.id, approve: true }, jonas);
    send({ type: "public_economy.execute", requestId: "remove-execute", proposalId: sale.id });
    expect(store.getPublicEconomy().funds[0]!.balance).toBe(218);
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(0);
    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState(store.exportMutableState());
    expect(restored.getPublicEconomy().funds[0]!.balance).toBe(218);
  });

  it("rejects old free-building commands and forged approval payloads", () => {
    expect(clientCommandSchema.safeParse({ type: "layout.apply", requestId: "free", baseRevision: 0,
      edit: { tool: "asset", assetId: "plant-floor", variantId: "terracotta", rotation: 0, position: { x: -256, y: -256 } } }).success).toBe(false);
    expect(clientCommandSchema.safeParse({ type: "public_economy.propose", requestId: "forged", title: "Free house",
      action: { kind: "project", project: { quote: { cost: 0 } } } }).success).toBe(false);
    expect(clientCommandSchema.safeParse({ type: "economy.donate", requestId: "negative", amount: -50, fundId: "workspace" }).success).toBe(false);
  });

  it("donates assets without paying private money back from the public fund", () => {
    const { store, send } = setup();
    const purchase = store.purchaseAsset("user-maya", "plant-floor", "buy");
    const owned = purchase.economy.inventory[0]!;
    send({ type: "economy.donate_asset", requestId: "give", ownedAssetId: owned.id, fundId: "workspace" });
    send({ type: "economy.donate_asset", requestId: "give", ownedAssetId: owned.id, fundId: "workspace" });
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(purchase.economy.coinBalance);
    expect(store.getPlayerEconomy("user-maya").inventory).toEqual([]);
    expect(store.getPublicEconomy().inventory).toEqual([{ id: owned.id, fundId: "workspace", assetId: owned.assetId, paid: owned.purchasePrice }]);
    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState(store.exportMutableState());
    expect(restored.getPublicEconomy().inventory).toHaveLength(1);
  });

  it("keeps approvals tied to the layout and does not debit a stale project", () => {
    const { store, events, send, jonas } = setup();
    send({ type: "economy.donate", requestId: "fund", fundId: "workspace", amount: 250 });
    send({ type: "project.edit", requestId: "draft", baseRevision: 0, fundId: "workspace",
      edit: { tool: "wall", start: { x: -256, y: -256 }, end: { x: -128, y: -256 } } });
    const draft = events.find((event) => event.type === "project.preview")!;
    send({ type: "project.submit", requestId: "submit", draftId: draft.project.id, title: "Wall" });
    const proposal = store.getPublicEconomy().proposals[0]!;
    send({ type: "public_economy.vote", requestId: "vote", proposalId: proposal.id, approve: true }, jonas);
    const saved = store.exportMutableState();
    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState(saved);
    expect(restored.getPublicEconomy().proposals[0]).toMatchObject({ status: "approved", reserved: 48 });
    store.replaceLayout({ ...store.getLayout("floor-studio")!, revision: 1 });
    send({ type: "public_economy.execute", requestId: "stale", proposalId: proposal.id });
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "stale", code: "PROJECT_STALE" }));
    expect(store.getPublicEconomy().funds[0]!.balance).toBe(250);
    expect(store.getLayout("floor-studio")!.walls).toEqual([]);
  });

  it("sells donated assets into their public fund only after approval", () => {
    const { store, send, jonas } = setup();
    const purchase = store.purchaseAsset("user-maya", "plant-floor", "buy");
    const owned = purchase.economy.inventory[0]!;
    send({ type: "economy.donate_asset", requestId: "give", ownedAssetId: owned.id, fundId: "workspace" });
    send({ type: "public_economy.propose", requestId: "sell", title: "Sell plant", action: { kind: "asset.sell", publicAssetId: owned.id } });
    const proposal = store.getPublicEconomy().proposals[0]!;
    send({ type: "public_economy.execute", requestId: "early", proposalId: proposal.id });
    expect(store.getPublicEconomy().inventory).toHaveLength(1);
    send({ type: "public_economy.vote", requestId: "vote", proposalId: proposal.id, approve: true }, jonas);
    send({ type: "public_economy.execute", requestId: "execute", proposalId: proposal.id });
    send({ type: "public_economy.execute", requestId: "repeat", proposalId: proposal.id });
    expect(store.getPublicEconomy().inventory).toEqual([]);
    expect(store.getPublicEconomy().funds[0]!.balance).toBe(Math.floor(owned.purchasePrice / 3));
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(purchase.economy.coinBalance);
  });
});
