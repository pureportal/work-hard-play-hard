import { clientCommandSchema } from "../protocol.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicEconomy, createOrganisation, type ClientCommand, type ServerEvent } from "@workhard/shared";
import { createTestData } from "../testing/workspace-data.js";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

const runtimes: WorldRuntime[] = [];
afterEach(() => { for (const runtime of runtimes.splice(0)) runtime.stop(); vi.useRealTimers(); });

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
  it.each([false, true])("broadcasts the deadline result without another command (read first: %s)", (readFirst) => {
    vi.useFakeTimers();
    const { store, runtime, events, send } = setup();
    send({ type: "public_economy.propose", requestId: "rules", title: "Open rooms", action: {
      kind: "game.settings", settings: store.getGameSettings(),
    } });
    const proposal = store.getPublicEconomy().proposals[0]!;
    expect(Date.parse(proposal.expiresAt) - Date.parse(proposal.createdAt)).toBe(10_000);
    runtime.start();
    vi.advanceTimersByTime(9_999);
    expect(store.publicEconomy.proposal(proposal.id).status).toBe("open");
    events.length = 0;
    if (readFirst) {
      vi.setSystemTime(new Date(proposal.expiresAt));
      expect(store.getPublicEconomy().proposals[0]!.status).toBe("approved");
    }
    vi.advanceTimersByTime(100);
    expect(events).toContainEqual(expect.objectContaining({ type: "public_economy.updated", economy: expect.objectContaining({
      proposals: [expect.objectContaining({ id: proposal.id, status: "approved", required: 1 })],
    }) }));
    send({ type: "public_economy.execute", requestId: "apply", proposalId: proposal.id });
    expect(store.getPublicEconomy().proposals[0]!.status).toBe("applied");
  });

  it("restores an overdue vote and resolves it on the next tick", () => {
    vi.useFakeTimers();
    const { store, send } = setup();
    send({ type: "public_economy.propose", requestId: "rules", title: "Open rooms", action: {
      kind: "game.settings", settings: store.getGameSettings(),
    } });
    const saved = store.exportMutableState();
    vi.advanceTimersByTime(10_000);
    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState(saved);
    const runtime = new WorldRuntime(restored);
    runtimes.push(runtime);
    runtime.runTickForTest();
    expect(restored.getPublicEconomy().proposals[0]).toMatchObject({ status: "approved", required: 1 });
  });

  it.each(["fund", "room", "permission"])("rejects deleting a unit used by a %s before requesting votes", (use) => {
    const { store, send, events } = setup();
    const organisation = store.getOrganisation();
    organisation.units.push({ id: "design", name: "Design", kind: "department", parentId: null });
    if (use === "fund") store.publicEconomy.applyFundAction("user-maya", { kind: "fund.create", unitId: "design", mode: "equal" }, "fund");
    else if (use === "permission") store.updateGameSettings({ ...store.getGameSettings(), roomBuild: {
      mode: "assigned", assignedPersonIds: [], unitGrants: [{ unitId: "design", rank: "members", descendants: false }],
    } });
    else store.getLayout("floor-studio")!.rooms.push({
      id: "design-room", floorId: "floor-studio", name: "Design", color: "#ffffff", capacity: 4,
      bounds: { x: 96, y: 96, width: 64, height: 64 }, footprint: [{ x: 96, y: 96, width: 64, height: 64 }],
      boundary: [], doorIds: [], windowIds: [], privateEligible: false, organisationUnitId: "design",
      access: { mode: "open", assignedPersonIds: [], knockable: false },
    });
    send({ type: "public_economy.propose", requestId: "delete-unit", title: "Remove Design", action: {
      kind: "organisation", baseRevision: organisation.revision, edit: { type: "unit.delete", unitId: "design" },
    } });
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "delete-unit", code: "ORGANISATION_UNIT_IN_USE" }));
    expect(store.getPublicEconomy().proposals).toEqual([]);
    expect(store.getOrganisation().units).toContainEqual(expect.objectContaining({ id: "design" }));
  });

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
    store.publicEconomy.applyFundAction("user-maya", { kind: "fund.create", unitId: "design", mode: "equal" }, "department");
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
      action: { kind: "project", project: { quote: { assetChanges: [], cost: 0 } } } }).success).toBe(false);
    expect(clientCommandSchema.safeParse({ type: "economy.donate", requestId: "negative", amount: -50, fundId: "workspace" }).success).toBe(false);
  });

  it("does not spend the same demolition refund across competing projects", () => {
    const { store, send, events, maya, jonas } = setup();
    send({ type: "economy.donate", requestId: "fund-refund-test", fundId: "workspace", amount: 48 });
    send({ type: "project.edit", requestId: "initial-wall", baseRevision: 0, fundId: "workspace",
      edit: { tool: "wall", start: { x: -256, y: -256 }, end: { x: -128, y: -256 } } });
    const initial = events.findLast((event) => event.type === "project.preview")!;
    send({ type: "project.submit", requestId: "initial-submit", draftId: initial.project.id, title: "Initial wall" });
    const built = store.getPublicEconomy().proposals.at(-1)!;
    send({ type: "public_economy.vote", requestId: "initial-vote", proposalId: built.id, approve: true }, jonas);
    send({ type: "public_economy.execute", requestId: "initial-apply", proposalId: built.id });
    expect(store.getPublicEconomy().funds[0]!.balance).toBe(0);
    const layout = store.getLayout("floor-studio")!;
    const proposals = [maya, jonas].map((peer, index) => {
      send({ type: "project.edit", requestId: `remove-${index}`, baseRevision: layout.revision, fundId: "workspace",
        edit: { tool: "item.remove", item: { type: "wall", id: layout.walls[0]!.id } } }, peer);
      const removal = events.findLast((event) => event.type === "project.preview")!;
      send({ type: "project.edit", requestId: `replace-${index}`, baseRevision: layout.revision, fundId: "workspace", draftId: removal.project.id,
        edit: { tool: "wall", start: { x: -256, y: -192 }, end: { x: -224, y: -192 } } }, peer);
      const replacement = events.findLast((event) => event.type === "project.preview")!;
      expect(replacement.project.quote).toMatchObject({ cost: 12, refund: 16 });
      send({ type: "project.submit", requestId: `submit-${index}`, draftId: replacement.project.id, title: `Replacement ${index}` }, peer);
      const proposal = store.getPublicEconomy().proposals.at(-1)!;
      expect(proposal.reserved).toBe(0);
      send({ type: "public_economy.vote", requestId: `vote-${index}`, proposalId: proposal.id, approve: true }, peer === maya ? jonas : maya);
      return proposal;
    });
    send({ type: "public_economy.execute", requestId: "apply-first", proposalId: proposals[0]!.id });
    send({ type: "public_economy.execute", requestId: "apply-second", proposalId: proposals[1]!.id }, jonas);
    send({ type: "public_economy.execute", requestId: "repeat-first", proposalId: proposals[0]!.id });
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "apply-second", code: "PROJECT_STALE" }));
    expect(store.getPublicEconomy().funds[0]!.balance).toBe(4);
    expect(store.getPublicEconomy().transactions.filter((transaction) => transaction.kind === "refund")).toHaveLength(1);
    expect(store.getLayout("floor-studio")!.walls).toHaveLength(1);
  });

  it("donates assets without paying private money back from the public fund", () => {
    const { store, send } = setup();
    const purchase = store.purchaseAsset("user-maya", "plant-floor", "buy");
    const owned = store.getOwnedAsset("user-maya", purchase.transaction.ownedAssetId!);
    send({ type: "economy.donate_asset", requestId: "give", ownedAssetId: owned.id, fundId: "workspace" });
    send({ type: "economy.donate_asset", requestId: "give", ownedAssetId: owned.id, fundId: "workspace" });
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(purchase.economy.coinBalance);
    expect(store.getPlayerEconomy("user-maya").inventory).toEqual(purchase.economy.inventory.filter((asset) => asset.id !== owned.id));
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
    const owned = store.getOwnedAsset("user-maya", purchase.transaction.ownedAssetId!);
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
