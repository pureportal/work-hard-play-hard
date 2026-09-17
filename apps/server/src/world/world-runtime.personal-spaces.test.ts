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

  it("rejects moving private property outside its personal area without a proposal", () => {
    const { store, room, buy, place, current, send, events } = setup();
    store.updateRoomSettings(room().id, { ...room(), personalAreas: [{ id: "area", name: "Maya", ownerUserId: "user-maya", bounds: { x: 96, y: 96, width: 160, height: 160 } }] });
    const owned = buy(); place(owned.id);
    const object = current().objects[0]!;
    send({ type: "player_asset.move", requestId: "outside", baseRevision: current().revision, objectId: object.id, position: { x: 320, y: 320 }, variantId: object.variantId, rotation: 0 });
    expect(events.findLast((event) => event.type === "command.error")).toMatchObject({ code: "PROJECT_APPROVAL_REQUIRED" });
    expect(current().objects[0]!.x).toBe(128);
  });

  it("rejects overlapping areas, stolen inventory and changes to another owner's assets", () => {
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
