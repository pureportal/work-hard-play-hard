import { afterEach, describe, expect, it } from "vitest";
import { createOrganisation, createPublicEconomy, detectLayoutRooms, getAssetDefinition, getDefaultAssetVariantId, permissionsForMemberRole,
  type ClientCommand, type ProjectEdit, type ServerEvent } from "@workhard/shared";
import { WorkspaceStore } from "../store.js";
import { createTestData } from "../testing/workspace-data.js";
import { WorldRuntime } from "./world-runtime.js";

const runtimes: WorldRuntime[] = [];
afterEach(() => { for (const runtime of runtimes.splice(0)) runtime.stop(); });

function setup() {
  const data = createTestData();
  data.members = data.members.filter((member) => ["user-maya", "user-jonas", "user-priya"].includes(member.id));
  for (const member of data.members) {
    member.position = { x: 640, y: 576 };
    member.permissions = permissionsForMemberRole(member.role);
  }
  data.organisation = createOrganisation("user-maya");
  data.publicEconomy = createPublicEconomy("hierarchical");
  data.gameSettings = { roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } };
  data.layouts = data.layouts.map((layout) => ({ ...layout, revision: 0, objects: [], walls: [], openings: [], rooms: [], tiles: [] }));
  const layout = data.layouts[0]!;
  layout.walls = [
    { id: "top", start: { x: 64, y: 64 }, end: { x: 512, y: 64 } },
    { id: "left", start: { x: 64, y: 64 }, end: { x: 64, y: 512 } },
    { id: "right", start: { x: 512, y: 64 }, end: { x: 512, y: 512 } },
    { id: "bottom", start: { x: 64, y: 512 }, end: { x: 512, y: 512 } },
  ];
  layout.openings = [{ id: "door", wallId: "bottom", type: "door", offset: 160, width: 64 }];
  data.layouts[0] = detectLayoutRooms(layout, data.floors[0]!);
  const store = new WorkspaceStore(data);
  const runtime = new WorldRuntime(store);
  runtimes.push(runtime);
  const events: ServerEvent[] = [];
  const peers = new Map(data.members.map((member) => [member.id, runtime.connect(member.id, layout.floorId, (event) => events.push(event))]));
  const send = (command: ClientCommand, userId = "user-maya") => runtime.handleCommand(peers.get(userId)!, command);
  const current = () => store.getLayout(layout.floorId)!;
  const room = () => current().rooms[0]!;
  const draft = (edit: ProjectEdit, draftId?: string, userId = "user-maya") => {
    const requestId = crypto.randomUUID();
    send({ type: "project.edit", requestId, fundId: "workspace", baseRevision: current().revision, edit, ...(draftId ? { draftId } : {}) }, userId);
    const result = events.findLast((event) => event.type === "project.preview" && event.requestId === requestId);
    if (result?.type !== "project.preview") throw new Error(JSON.stringify(events.findLast((event) => event.type === "command.error")));
    return result.project;
  };
  const approve = (proposalId: string) => {
    const proposal = store.publicEconomy.proposal(proposalId);
    for (const userId of proposal.electorate) {
      if (proposal.status === "open" && !proposal.ballots.some((ballot) => ballot.userId === userId)) send({ type: "public_economy.vote", requestId: crypto.randomUUID(), proposalId, approve: true }, userId);
    }
    send({ type: "public_economy.execute", requestId: crypto.randomUUID(), proposalId });
  };
  const buy = (userId = "user-maya") => store.purchaseAsset(userId, "plant-floor", crypto.randomUUID()).economy.inventory.at(-1)!;
  const place = (ownedAssetId: string, x = 128, y = 128, userId = "user-maya") => send({ type: "player_asset.place", requestId: crypto.randomUUID(), baseRevision: current().revision,
    ownedAssetId, position: { x, y }, variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 }, userId);
  return { store, runtime, send, events, current, room, draft, approve, buy, place };
}

describe("personal spaces and public approvals", () => {
  it("applies an owner's routine shared furnishing without opting in or opening approvals", () => {
    const { store, room, draft, send, current, events } = setup();
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-maya" });
    store.donateMoney("user-maya", "workspace", 150, "fund");
    const project = draft({ tool: "asset", assetId: "plant-floor", position: { x: 128, y: 128 }, variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 });
    expect(project.quote.requiresApproval).toBe(false);
    const submit = { type: "project.submit", requestId: "apply", draftId: project.id, title: "Room plant" } as const;
    send(submit);
    send(submit);
    expect(current().objects).toHaveLength(1);
    expect(store.getPublicEconomy().proposals).toHaveLength(1);
    expect(store.getPublicEconomy().proposals[0]).toMatchObject({ status: "applied", required: 0 });
    expect(events.filter((event) => event.type === "project.submitted")).toEqual([
      { type: "project.submitted", requestId: "apply" }, { type: "project.submitted", requestId: "apply" },
    ]);
  });

  it("keeps votes for significant shared purchases, structural changes and edits outside the owner's room", () => {
    const { store, room, draft } = setup();
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-maya" });
    const plant = { tool: "asset", assetId: "plant-floor", position: { x: 128, y: 128 }, variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 } as const;
    let project = draft(plant);
    for (let index = 1; index < 5; index++) project = draft({ ...plant, position: { x: 128 + index * 64, y: 128 } }, project.id);
    expect(project.quote.cost).toBeGreaterThan(250);
    expect(project.quote.requiresApproval).toBe(true);
    const structural = draft({ tool: "wall", start: { x: -256, y: -256 }, end: { x: -192, y: -256 } });
    expect(structural.quote.requiresApproval).toBe(true);
    const outside = draft({ ...plant, position: { x: 576, y: 128 } });
    expect(outside.quote.requiresApproval).toBe(true);
  });

  it("rechecks owner delegation at submission", () => {
    const { store, room, draft, send } = setup();
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-maya" });
    const project = draft({ tool: "asset", assetId: "plant-floor", position: { x: 128, y: 128 }, variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 });
    expect(project.quote.requiresApproval).toBe(false);
    store.updateRoomSettings(room().id, { ...room(), ownerBuildApproval: "vote" });
    send({ type: "project.submit", requestId: "submit", draftId: project.id, title: "Plant" });
    expect(store.getPublicEconomy().proposals[0]).toMatchObject({ status: "open", approvalRate: 51 });
  });

  it("requires approval for shared furnishing in an owned room without a door", () => {
    const { store, room, draft, send, current, events } = setup();
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-maya" });
    store.replaceLayout(detectLayoutRooms({ ...current(), revision: current().revision + 1, openings: [] }, store.getFloor(current().floorId)!));
    expect(room().privateEligible).toBe(false);
    store.donateMoney("user-maya", "workspace", 100, "fund-room");
    const project = draft({ tool: "asset", assetId: "plant-floor", position: { x: 128, y: 128 },
      variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 });
    expect(project.quote.requiresApproval).toBe(true);
    send({ type: "project.submit", requestId: "doorless-room", draftId: project.id, title: "Plant" });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "command.error", requestId: "doorless-room" }));
    expect(store.getPublicEconomy().proposals[0]).toMatchObject({ status: "open", approvalRate: 51 });
    expect(store.getPublicEconomy().funds[0]!.balance).toBe(100);
    expect(current().objects).toHaveLength(0);
  });

  it("keeps automatic approval when revising an unfunded project with voting disabled", () => {
    const { store, draft, send, current, events } = setup();
    store.publicEconomy.updateApprovalRates({ ...store.publicEconomy.getApprovalRates(), building: 0 });
    const plant = { tool: "asset", assetId: "plant-floor", position: { x: 128, y: 128 },
      variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 } as const;
    const project = draft(plant);
    send({ type: "project.submit", requestId: "unfunded", draftId: project.id, title: "Plants" });
    const proposal = store.getPublicEconomy().proposals[0]!;
    expect(proposal).toMatchObject({ status: "approved", required: 0, action: { project: { quote: { requiresApproval: false } } } });
    send({ type: "project.edit", requestId: "revise-unfunded", fundId: "workspace", baseRevision: current().revision,
      draftId: project.id, proposalId: proposal.id, edit: { ...plant, position: { x: 256, y: 128 } } });
    send({ type: "project.submit", requestId: "resubmit-unfunded", draftId: project.id, proposalId: proposal.id, title: "Two plants" });
    expect(store.publicEconomy.proposal(proposal.id)).toMatchObject({ status: "approved", required: 0 });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "command.error" }));
  });

  it("buys and places atomically and replays without another debit or placement", () => {
    const { store, room, current, send, events } = setup();
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-maya" });
    const command = { type: "player_asset.purchase_place", requestId: "furnish", baseRevision: current().revision, assetId: "plant-floor", position: { x: 128, y: 128 }, variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 } as const;
    send(command);
    send(command);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "command.error", requestId: command.requestId }));
    expect(current().objects).toHaveLength(1);
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(250 - getAssetDefinition("plant-floor")!.shop!.price);
    expect(store.getPlayerEconomy("user-maya").inventory.filter((item) => item.assetId === "plant-floor")).toHaveLength(1);
    send({ ...command, rotation: 90 });
    expect(events.findLast((event) => event.type === "command.error")).toMatchObject({ code: "ECONOMY_REQUEST_CONFLICT" });
  });

  it("uses an existing personal copy without charging again", () => {
    const { store, room, buy, current, send } = setup();
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-maya" });
    const owned = buy();
    const before = store.getPlayerEconomy("user-maya");
    send({ type: "player_asset.purchase_place", requestId: "use-owned", baseRevision: current().revision, assetId: owned.assetId, position: { x: 128, y: 128 }, variantId: getDefaultAssetVariantId(getAssetDefinition(owned.assetId)!), rotation: 0 });
    expect(current().objects[0]?.ownedAssetId).toBe(owned.id);
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(before.coinBalance);
    expect(store.getPlayerEconomy("user-maya").inventory).toHaveLength(before.inventory.length);
  });

  it("rolls a purchase back when placement is blocked and does not charge for stale layouts", () => {
    const { store, room, current, send, events } = setup();
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-maya" });
    const before = store.getPlayerEconomy("user-maya");
    const command = { type: "player_asset.purchase_place", requestId: "blocked", baseRevision: current().revision, assetId: "plant-floor", position: { x: 64, y: 64 }, variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 } as const;
    send(command);
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "blocked" }));
    expect(store.getPlayerEconomy("user-maya")).toEqual(before);
    expect(current().objects).toHaveLength(0);
    send({ ...command, requestId: "stale", baseRevision: 999 });
    expect(events).toContainEqual(expect.objectContaining({ type: "layout.conflict", requestId: "stale" }));
    expect(store.getPlayerEconomy("user-maya")).toEqual(before);
  });

  it("keeps personal furnishing in a shared room behind approval and returns the same draft on retry", () => {
    const { store, current, send, events } = setup();
    const command = { type: "player_asset.purchase_place", requestId: "shared-placement", baseRevision: current().revision, assetId: "plant-floor", position: { x: 128, y: 128 }, variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 } as const;
    send(command);
    send(command);
    const previews = events.filter((event) => event.type === "project.preview" && event.requestId === command.requestId);
    expect(previews).toHaveLength(2);
    expect(previews[0]).toEqual(previews[1]);
    expect(current().objects).toHaveLength(0);
    if (previews[0]?.type !== "project.preview") throw new Error("Missing preview");
    expect(previews[0].project.quote.requiresApproval).toBe(true);
    expect(previews[0].project.quote.cost).toBe(0);
    expect(store.getPlayerEconomy("user-maya").inventory.filter((item) => item.assetId === "plant-floor")).toHaveLength(1);
  });

  it.each(["submitted", "replaced", "restart"] as const)("acknowledges a completed purchase when its draft was %s", (state) => {
    const { store, runtime, current, send, events, draft } = setup();
    const command = { type: "player_asset.purchase_place", requestId: "purchase-to-draft", baseRevision: current().revision,
      assetId: "plant-floor", position: { x: 128, y: 128 }, variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 } as const;
    send(command);
    const preview = events.findLast((event) => event.type === "project.preview" && event.requestId === command.requestId);
    if (preview?.type !== "project.preview") throw new Error("Missing purchase preview");
    if (state === "submitted") send({ type: "project.submit", requestId: "submit-purchase", draftId: preview.project.id, title: "Plant" });
    else if (state === "replaced") draft({ tool: "asset", assetId: command.assetId, position: { x: 256, y: 128 }, variantId: command.variantId, rotation: 0 });
    let retry = () => send(command);
    let replayStore = store;
    if (state === "restart") {
      runtime.stop();
      const restored = new WorkspaceStore(createTestData());
      restored.restoreMutableState(store.exportMutableState());
      replayStore = restored;
      const resumed = new WorldRuntime(restored);
      runtimes.push(resumed);
      const peer = resumed.connect("user-maya", current().floorId, (event) => events.push(event));
      retry = () => resumed.handleCommand(peer, command);
    }
    const before = replayStore.getPlayerEconomy("user-maya");
    const checkpoint = replayStore.exportMutableState();
    events.length = 0;
    retry();
    expect(events).not.toContainEqual(expect.objectContaining({ type: "command.error", requestId: command.requestId }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: "project.preview", requestId: command.requestId }));
    expect(events).toContainEqual(expect.objectContaining({ type: "economy.updated", requestId: command.requestId, economy: before }));
    expect(replayStore.exportMutableState()).toEqual(checkpoint);
  });

  it("does not restore a cancelled proposal's draft when a completed purchase is retried", () => {
    const { store, current, send, events, draft, buy } = setup();
    const owned = buy();
    const variantId = getDefaultAssetVariantId(getAssetDefinition(owned.assetId)!);
    const project = draft({ tool: "personal_asset", ownedAssetId: owned.id, position: { x: 128, y: 128 }, variantId, rotation: 0 });
    send({ type: "project.submit", requestId: "original", draftId: project.id, title: "Plants" });
    const proposalId = store.getPublicEconomy().proposals[0]!.id;
    const command = { type: "player_asset.purchase_place", requestId: "revision-purchase", baseRevision: current().revision,
      draftId: project.id, proposalId, assetId: owned.assetId, position: { x: 256, y: 128 }, variantId, rotation: 0 } as const;
    send(command);
    expect(events).toContainEqual(expect.objectContaining({ type: "project.preview", requestId: command.requestId }));
    send({ type: "public_economy.cancel", requestId: "cancel", proposalId });
    const before = store.getPlayerEconomy("user-maya");
    events.length = 0;
    send(command);
    expect(events).not.toContainEqual(expect.objectContaining({ type: "command.error", requestId: command.requestId }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: "project.preview", requestId: command.requestId }));
    expect(events).toContainEqual(expect.objectContaining({ type: "economy.updated", requestId: command.requestId, economy: before }));
    expect(store.getPlayerEconomy("user-maya")).toEqual(before);
    expect(store.publicEconomy.proposal(proposalId).status).toBe("cancelled");
  });

  it.each(["project.edit", "player_asset.purchase_place"] as const)("rejects %s on an expired proposal before editing or buying", (type) => {
    const { store, draft, send, current, events } = setup();
    const edit = { tool: "asset", assetId: "plant-floor", position: { x: 128, y: 128 },
      variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 } as const;
    const project = draft(edit);
    send({ type: "project.submit", requestId: "original", draftId: project.id, title: "Plants" });
    const proposalId = store.getPublicEconomy().proposals[0]!.id;
    send({ type: "project.edit", requestId: "revision", baseRevision: current().revision, fundId: "workspace",
      draftId: project.id, proposalId, edit: { ...edit, position: { x: 256, y: 128 } } });
    send({ type: "project.submit", requestId: "resubmit", draftId: project.id, proposalId, title: "Two plants" });
    const proposal = store.publicEconomy.proposal(proposalId);
    proposal.expiresAt = new Date(Date.now() - 1).toISOString();
    const economy = store.getPlayerEconomy("user-maya");
    const command = { requestId: "expired-edit", baseRevision: current().revision, draftId: project.id, proposalId: proposal.id };
    if (type === "project.edit") send({ ...command, type, fundId: "workspace", edit: { ...edit, position: { x: 384, y: 128 } } });
    else send({ ...command, type, assetId: edit.assetId, variantId: edit.variantId, rotation: edit.rotation, position: { x: 384, y: 128 } });
    expect(events.findLast((event) => event.type === "command.error" && event.requestId === command.requestId)).toMatchObject({ code: "PROJECT_STALE" });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "project.preview", requestId: command.requestId }));
    expect(store.getPlayerEconomy("user-maya")).toEqual(economy);
    expect(store.publicEconomy.proposal(proposal.id).action).toEqual(proposal.action);
    expect(current().objects).toHaveLength(0);
  });

  it("requires a revision's proposal ID and includes it when checking submission retries", () => {
    const { store, draft, send, current, events } = setup();
    const edit = { tool: "asset", assetId: "plant-floor", position: { x: 128, y: 128 },
      variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 } as const;
    const project = draft(edit);
    send({ type: "project.submit", requestId: "original", draftId: project.id, title: "Plants" });
    const proposalId = store.getPublicEconomy().proposals[0]!.id;
    send({ type: "project.edit", requestId: "revision", baseRevision: current().revision, fundId: "workspace",
      draftId: project.id, proposalId, edit: { ...edit, position: { x: 256, y: 128 } } });
    send({ type: "project.edit", requestId: "unlinked-edit", baseRevision: current().revision, fundId: "workspace",
      draftId: project.id, edit: { ...edit, position: { x: 384, y: 128 } } });
    expect(events.findLast((event) => event.type === "command.error" && event.requestId === "unlinked-edit")).toMatchObject({ code: "PROJECT_STALE" });
    send({ type: "project.submit", requestId: "missing-link", draftId: project.id, title: "Two plants" });
    expect(events.findLast((event) => event.type === "command.error" && event.requestId === "missing-link")).toMatchObject({ code: "PROJECT_STALE" });
    expect(store.getPublicEconomy().proposals).toHaveLength(1);
    const submission = { type: "project.submit", requestId: "linked", draftId: project.id, proposalId, title: "Two plants" } as const;
    send(submission);
    send(submission);
    const proposal = store.publicEconomy.proposal(proposalId);
    expect(proposal.title).toBe("Two plants");
    if (proposal.action.kind !== "project") throw new Error("Missing project");
    expect(proposal.action.project.layout.objects).toHaveLength(2);
    expect(store.getPublicEconomy().proposals).toHaveLength(1);
    send({ ...submission, proposalId: crypto.randomUUID() });
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: submission.requestId, code: "ECONOMY_REQUEST_CONFLICT" }));
  });

  it("restores a proposal and its draft when automatic revision application is blocked", () => {
    const { store, runtime, room, draft, send, current, events } = setup();
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-maya" });
    const edit = { tool: "asset", assetId: "plant-floor", position: { x: 128, y: 128 },
      variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0 } as const;
    const project = draft(edit);
    send({ type: "project.submit", requestId: "original", draftId: project.id, title: "One plant" });
    const proposalId = store.getPublicEconomy().proposals[0]!.id;
    send({ type: "project.edit", requestId: "revision", baseRevision: current().revision, fundId: "workspace",
      draftId: project.id, proposalId, edit: { ...edit, position: { x: 256, y: 128 } } });
    store.donateMoney("user-maya", "workspace", 150, "fund");
    const checkpoint = store.exportMutableState();
    const players = runtime.serializePlayers();
    runtime.restorePlayers(players.map((player) => player.userId === "user-maya" ? { ...player, x: 256, y: 128 } : player));
    const submission = { type: "project.submit", requestId: "apply-revision", draftId: project.id, proposalId, title: "Two plants" } as const;
    send(submission);
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: submission.requestId, code: "PLAYER_IN_THE_WAY" }));
    expect(store.exportMutableState()).toEqual(checkpoint);
    expect(store.dirty).toBe(true);
    runtime.restorePlayers(players);
    send(submission);
    expect(current().objects).toHaveLength(2);
    expect(store.publicEconomy.proposal(proposalId)).toMatchObject({ status: "applied", title: "Two plants" });
  });

  it("uses unused copies when editing a submitted proposal and supports subsequent revisions", () => {
    const { store, current, send, events, draft, buy } = setup();
    const first = buy();
    const second = buy();
    const variantId = getDefaultAssetVariantId(getAssetDefinition(first.assetId)!);
    const project = draft({ tool: "personal_asset", ownedAssetId: first.id, position: { x: 128, y: 128 }, variantId, rotation: 0 });
    send({ type: "project.submit", requestId: "submit-original", draftId: project.id, title: "Plants" });
    const proposalId = store.getPublicEconomy().proposals[0]!.id;
    const balance = store.getPlayerEconomy("user-maya").coinBalance;
    const command = { type: "player_asset.purchase_place", requestId: "revise-plants", baseRevision: current().revision,
      draftId: project.id, proposalId, assetId: first.assetId, position: { x: 256, y: 128 }, variantId, rotation: 0 } as const;
    send(command);
    const revised = events.findLast((event) => event.type === "project.preview" && event.requestId === command.requestId);
    expect(revised).toMatchObject({ project: { layout: { objects: [
      expect.objectContaining({ ownedAssetId: first.id }), expect.objectContaining({ ownedAssetId: second.id }),
    ] } } });
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(balance);
    send({ type: "project.submit", requestId: "submit-revision", draftId: project.id, proposalId, title: "Two plants" });
    send({ ...command, requestId: "revise-again", position: { x: 384, y: 128 } });
    expect(events.findLast((event) => event.type === "project.preview" && event.requestId === "revise-again"))
      .toMatchObject({ project: { layout: { objects: expect.arrayContaining([
        expect.objectContaining({ ownedAssetId: first.id }), expect.objectContaining({ ownedAssetId: second.id }),
      ]) } } });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "command.error" }));
    expect(store.getPlayerEconomy("user-maya").inventory.filter((item) => item.assetId === first.assetId)).toHaveLength(3);
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(balance - first.purchasePrice);
  });

  it.each(["room", "area"] as const)("protects an owned %s from wall demolition and subdivision", (kind) => {
    const { store, room, current, send, events } = setup();
    store.updateRoomSettings(room().id, { ...room(), ...(kind === "room" ? { ownerUserId: "user-jonas" } : {
      personalAreas: [{ id: "jonas", name: "Jonas", ownerUserId: "user-jonas", bounds: { x: 96, y: 96, width: 128, height: 128 } }],
    }) });
    const before = structuredClone(current());
    for (const edit of [
      { tool: "item.remove", item: { type: "wall", id: "right" } },
      { tool: "erase", position: { x: 512, y: 256 } },
      { tool: "wall", start: { x: 384, y: 64 }, end: { x: 384, y: 512 } },
    ] satisfies ProjectEdit[]) {
      for (const userId of ["user-maya", "user-jonas"]) {
        const requestId = crypto.randomUUID();
        send({ type: "project.edit", requestId, fundId: "workspace", baseRevision: before.revision, edit }, userId);
        expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId, code: "ROOM_PRIVACY_PROTECTED" }));
        expect(current()).toEqual(before);
      }
    }
  });

  it("does not let room owners take public property through personal storage", () => {
    const { store, room, current, send, events } = setup();
    const inventory = store.getPlayerEconomy("user-maya").inventory;
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-maya" });
    store.replaceLayout({ ...current(), revision: current().revision + 1, objects: [{
      id: "public-plant", floorId: current().floorId, assetId: "plant-floor", x: 128, y: 128,
      variantId: getDefaultAssetVariantId(getAssetDefinition("plant-floor")!), rotation: 0, publicFundId: "workspace",
    }] });
    send({ type: "player_asset.remove", requestId: "take-public", baseRevision: current().revision, objectId: "public-plant" });
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "take-public", code: "ASSET_NOT_OWNED" }));
    expect(current().objects.map((object) => object.id)).toEqual(["public-plant"]);
    expect(store.getPlayerEconomy("user-maya").inventory).toEqual(inventory);
  });

  it("gives server administrators configuration permissions without gameplay privileges", () => {
    expect(permissionsForMemberRole("admin")).toEqual(["manage_members"]);
    expect(permissionsForMemberRole("owner")).toEqual(["manage_members"]);
    const { store, send, room, current, events } = setup();
    for (const command of [
      { type: "room.update_settings", requestId: "room", baseRevision: current().revision, roomId: room().id, settings: { name: "Bypass", color: room().color, access: room().access } },
      { type: "game.settings_update", requestId: "game", settings: store.getGameSettings() },
      { type: "kidnapping.global_settings_update", requestId: "carrying", settings: store.getGlobalKidnappingSettings() },
      { type: "organisation.edit", requestId: "org", baseRevision: store.getOrganisation().revision, edit: { type: "ceo.promote", userId: "user-jonas" } },
    ] satisfies ClientCommand[]) send(command);
    expect(events.filter((event) => event.type === "command.error").map((event) => event.code)).toEqual(Array(4).fill("PROJECT_APPROVAL_REQUIRED"));
    expect(room().name).not.toBe("Bypass");
  });

  it.each(["room", "area"] as const)("places paid personal assets in an owned %s immediately and persists ownership", (kind) => {
    const { store, room, buy, place, current } = setup();
    store.updateRoomSettings(room().id, { ...room(), build: { mode: "none", assignedPersonIds: [] }, ...(kind === "room" ? { ownerUserId: "user-maya" } : {
      personalAreas: [{ id: "workspace", name: "Maya", ownerUserId: "user-maya", bounds: { x: 96, y: 96, width: 160, height: 160 } }],
    }) });
    const owned = buy();
    place(owned.id);
    expect(current().objects).toHaveLength(1);
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(250 - owned.purchasePrice);
    expect(store.getPublicEconomy().funds[0]!.balance).toBe(0);
    expect(store.getPublicEconomy().proposals).toHaveLength(0);
    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState(store.exportMutableState());
    expect(restored.getLayout(current().floorId)).toEqual(current());
  });

  it("requires approval for private placement in public and for a mixed construction project", () => {
    const { store, send, events, draft, approve, buy, place, current } = setup();
    const owned = buy();
    place(owned.id);
    expect(events.findLast((event) => event.type === "command.error")).toMatchObject({ code: "PROJECT_APPROVAL_REQUIRED" });
    expect(current().objects).toHaveLength(0);
    store.donateMoney("user-maya", "workspace", 150, "donation");
    const variantId = getDefaultAssetVariantId(getAssetDefinition("plant-floor")!);
    let project = draft({ tool: "personal_asset", ownedAssetId: owned.id, position: { x: 128, y: 128 }, variantId, rotation: 0 });
    project = draft({ tool: "asset", assetId: "plant-floor", position: { x: 256, y: 128 }, variantId, rotation: 0 }, project.id);
    project = draft({ tool: "wall", start: { x: -256, y: -256 }, end: { x: -192, y: -256 } }, project.id);
    expect(project.quote.assetChanges.map(({ object }) => object.ownerUserId)).toEqual(["user-maya", undefined]);
    expect(project.quote.cost).toBe(owned.purchasePrice + 24);
    send({ type: "project.submit", requestId: "submit", draftId: project.id, title: "Workspace refresh" });
    const proposal = store.getPublicEconomy().proposals[0]!;
    expect(proposal.status).toBe("open");
    expect(current().objects).toHaveLength(0);
    approve(proposal.id);
    expect(current().objects).toHaveLength(2);
    expect(store.getPublicEconomy().funds[0]!.balance).toBe(150 - project.quote.cost);
    expect(store.getOwnedAsset("user-maya", owned.id).placement?.objectId).toBe(current().objects[0]!.id);
  });

  it("lets owners recover their assets after entry and build access are revoked", () => {
    const { store, room, buy, place, current, send } = setup();
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-maya" });
    const owned = buy();
    place(owned.id);
    const object = current().objects[0]!;
    store.updateRoomSettings(room().id, { ...room(), access: { mode: "none", assignedPersonIds: [], knockable: false }, build: { mode: "none", assignedPersonIds: [] } });
    send({ type: "player_asset.remove", requestId: "recover", baseRevision: current().revision, objectId: object.id });
    expect(current().objects).toHaveLength(0);
    expect(store.getOwnedAsset("user-maya", owned.id).placement).toBeUndefined();
    expect(store.getPublicEconomy().proposals).toHaveLength(0);
  });

  it("stores an owned item on another floor using that floor's revision", () => {
    const { store, room, buy, place, current, send, events } = setup();
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-maya" });
    const owned = buy();
    place(owned.id);
    const object = current().objects[0]!;
    const remote = store.getLayouts().find((layout) => layout.floorId !== current().floorId)!;
    store.replaceLayout({ ...current(), revision: current().revision + 1, objects: [] });
    store.replaceLayout({ ...remote, revision: remote.revision + 1, objects: [{ ...object, floorId: remote.floorId }] });
    const local = structuredClone(current());
    const balance = store.getPlayerEconomy("user-maya").coinBalance;
    const revision = store.getLayout(remote.floorId)!.revision;
    send({ type: "player_asset.remove", requestId: "remote-stale", baseRevision: revision + 1, objectId: object.id });
    expect(events).toContainEqual(expect.objectContaining({ type: "layout.conflict", requestId: "remote-stale", revision }));
    expect(store.getLayout(remote.floorId)!.objects).toHaveLength(1);
    send({ type: "player_asset.remove", requestId: "remote-foreign", baseRevision: revision, objectId: object.id }, "user-jonas");
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "remote-foreign", code: "ASSET_NOT_OWNED" }));
    send({ type: "player_asset.remove", requestId: "remote-store", baseRevision: revision, objectId: object.id });
    expect(events).not.toContainEqual(expect.objectContaining({ type: "command.error", requestId: "remote-store" }));
    expect(store.getLayout(remote.floorId)!.objects).toHaveLength(0);
    expect(store.getOwnedAsset("user-maya", owned.id).placement).toBeUndefined();
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(balance);
    expect(current()).toEqual(local);
  });

  it("rejects moving private property outside its personal area without a proposal", () => {
    const { store, room, buy, place, current, send, events } = setup();
    store.updateRoomSettings(room().id, { ...room(), personalAreas: [{ id: "area", name: "Maya", ownerUserId: "user-maya", bounds: { x: 96, y: 96, width: 160, height: 160 } }] });
    const owned = buy(); place(owned.id);
    const object = current().objects[0]!;
    send({ type: "player_asset.move", requestId: "outside", baseRevision: current().revision, objectId: object.id, position: { x: 320, y: 320 }, variantId: object.variantId, rotation: 0 });
    expect(events.findLast((event) => event.type === "command.error")).toMatchObject({ code: "PROJECT_APPROVAL_REQUIRED" });
    expect(current().objects[0]!.x).toBe(128);
  });

  it("lets room builders move another player's item through a project without changing its owner", () => {
    const { store, room, buy, place, current, draft, send, approve } = setup();
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-jonas" });
    const owned = buy("user-jonas");
    place(owned.id, 128, 128, "user-jonas");
    const object = current().objects[0]!;

    const project = draft({ tool: "asset.move", objectId: object.id, position: { x: 320, y: 128 },
      variantId: object.variantId, rotation: 90 });
    expect(project.quote.assetChanges).toEqual([{ change: "move", object: expect.objectContaining({
      id: object.id, ownerUserId: "user-jonas", ownedAssetId: owned.id, x: 320, y: 128, rotation: 90,
    }) }]);
    send({ type: "project.submit", requestId: "move-foreign-item", draftId: project.id, title: "Move plant" });
    approve(store.getPublicEconomy().proposals[0]!.id);

    expect(current().objects[0]).toMatchObject({ id: object.id, ownerUserId: "user-jonas", ownedAssetId: owned.id,
      x: 320, y: 128, rotation: 90 });
    expect(store.getOwnedAsset("user-jonas", owned.id).placement?.objectId).toBe(object.id);
  });

  it("requires build rights in the room to move another player's item", () => {
    const { store, room, buy, place, current, send, events } = setup();
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-jonas" });
    const owned = buy("user-jonas");
    place(owned.id, 128, 128, "user-jonas");
    store.updateRoomSettings(room().id, { ...room(), build: { mode: "assigned", assignedPersonIds: ["user-jonas"] } });
    const object = current().objects[0]!;

    send({ type: "project.edit", requestId: "move-without-rights", fundId: "workspace", baseRevision: current().revision,
      edit: { tool: "asset.move", objectId: object.id, position: { x: 320, y: 128 }, variantId: object.variantId, rotation: 0 } });

    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "move-without-rights", code: "ASSET_ROOM_FORBIDDEN" }));
    expect(current().objects[0]).toMatchObject({ id: object.id, x: 128, y: 128 });
  });

  it("rejects overlapping areas, stolen inventory and removal of another owner's assets", () => {
    const { store, room, buy, place, current, send, events } = setup();
    const area = { id: "one", name: "Desk", ownerUserId: "user-maya", bounds: { x: 96, y: 96, width: 128, height: 128 } };
    expect(() => store.updateRoomSettings(room().id, { ...room(), personalAreas: [area, { ...area, id: "two" }] })).toThrow("PERSONAL_AREA_INVALID");
    store.updateRoomSettings(room().id, { ...room(), ownerUserId: "user-jonas" });
    const owned = buy("user-jonas");
    place(owned.id, 128, 128, "user-jonas");
    send({ type: "project.edit", requestId: "steal", fundId: "workspace", baseRevision: current().revision,
      edit: { tool: "item.remove", item: { type: "asset", id: current().objects[0]!.id } } });
    expect(events.findLast((event) => event.type === "command.error")).toMatchObject({ code: "PRIVATE_ASSET_PROTECTED" });
    place(owned.id);
    expect(events.findLast((event) => event.type === "command.error")).toMatchObject({ code: "ASSET_NOT_OWNED" });
  });
});
