import {
  ASSET_CATALOG,
  canManageUnit,
  canMoveOrganisationMember,
  getAssetDefinition,
  getAssetPlacementError,
  getAssetVariants,
  getOutdoorBounds,
  getPlayerAssetRoomError,
  hasMemberPermission,
  roomAccessAllows,
  roomBuildAllows,
  type ServerEvent,
  type WorldObject,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { validateOrganisation, validateRoomPermission } from "./organisation/organisation-store.js";
import { createTestData } from "./testing/workspace-data.js";
import { WorkspaceStore } from "./store.js";
import { WorldRuntime } from "./world/world-runtime.js";

describe("seeded organisation and permissions", () => {
  it("validates every organisation and room reference without coupling ranks to app roles", () => {
    const data = createTestData();
    const memberIds = data.members.map((member) => member.id);
    validateOrganisation(data.organisation, memberIds);
    for (const layout of data.layouts) {
      for (const room of layout.rooms) {
        validateRoomPermission(room.access, data.organisation, memberIds);
        validateRoomPermission(room.build!, data.organisation, memberIds);
        if (room.organisationUnitId) {
          expect(data.organisation.units.some((unit) => unit.id === room.organisationUnitId)).toBe(true);
        }
      }
    }
    for (const permission of Object.values(data.gameSettings)) {
      validateRoomPermission(permission, data.organisation, memberIds);
    }
    expect(data.organisation.ceoIds).toEqual([data.members[0]!.id, "user-noah", "user-sam"]);
    expect(data.organisation.removalVotes).toEqual([]);
    expect(data.members.filter((member) => !data.organisation.ceoIds.includes(member.id)
      && !data.organisation.assignments.some((assignment) => assignment.userId === member.id)).map((member) => member.id))
      .toEqual(["user-theo", "user-owen"]);
    expect(hasMemberPermission(data.members.find((member) => member.id === "user-maya")!, "build")).toBe(true);
    for (const userId of ["user-jonas", "user-priya", "user-noah", "user-sam"]) {
      expect(hasMemberPermission(data.members.find((member) => member.id === userId)!, "build")).toBe(false);
    }
    expect(canManageUnit(data.organisation, "user-amara", "unit-web")).toBe(true);
    expect(canManageUnit(data.organisation, "user-amara", "unit-design")).toBe(false);
    expect(canManageUnit(data.organisation, "user-priya", "unit-research")).toBe(true);
    expect(canManageUnit(data.organisation, "user-priya", "unit-product")).toBe(false);
    expect(canMoveOrganisationMember(data.organisation, "user-elena", "user-jonas", "unit-platform")).toBe(true);
    expect(canMoveOrganisationMember(data.organisation, "user-elena", "user-theo", "unit-web")).toBe(false);
  });

  it.each([
    ["room-commons", "user-maya", true, false],
    ["room-commons", "user-jonas", true, false],
    ["room-product", "user-maya", true, true],
    ["room-product", "user-jonas", true, true],
    ["room-product", "user-theo", true, false],
    ["room-daily", "user-amara", true, true],
    ["room-daily", "user-elena", true, false],
    ["room-focus", "user-maya", true, false],
    ["room-focus", "user-priya", true, true],
    ["room-focus", "user-jonas", false, false],
    ["room-workshop", "user-elena", true, true],
    ["room-workshop", "user-jonas", true, false],
    ["room-quiet", "user-aisha", true, true],
    ["room-quiet", "user-noah", true, false],
    ["room-quiet", "user-maya", false, false],
    ["room-arcade", "user-owen", true, false],
  ])("evaluates %s for %s: access %s, build %s", (roomId, userId, access, build) => {
    const store = new WorkspaceStore(createTestData());
    const room = store.getRoom(roomId)!;
    expect(store.getGameSettings().roomBuild.mode).toBe("none");
    expect(roomAccessAllows(room, userId, store.getGameSettings(), store.getOrganisation())).toBe(access);
    expect(roomBuildAllows(room, userId, store.getGameSettings(), store.getOrganisation())).toBe(build);
  });

  it("keeps both floor categories selectable and placeable in the seeded studio", () => {
    const store = new WorkspaceStore(createTestData());
    const layout = store.getLayout("floor-studio")!;
    expect(ASSET_CATALOG.categories.filter((category) => category.id.startsWith("floor-")).map((category) => category.name))
      .toEqual(["Floor types", "Floor decor"]);
    expect(ASSET_CATALOG.categories.some((category) => category.name === "Surface")).toBe(false);
    const objects = store.getBootstrap("user-maya").layouts.flatMap((floor) => floor.objects);
    for (const assetId of ["floor-grass", "rug-woven", "rug-round", "rug-tatami"]) {
      const asset = getAssetDefinition(assetId)!;
      expect(asset).toMatchObject({ buildable: true, shop: { available: true },
        category: assetId === "floor-grass" ? "floor-types" : "floor-decorations" });
      expect(objects.some((object) => object.assetId === assetId)).toBe(true);
      for (const variant of getAssetVariants(asset)) {
        const object: WorldObject = { id: "selection", floorId: layout.floorId, assetId,
          variantId: variant.id, rotation: 0, x: 416, y: 768 };
        expect(getAssetPlacementError(layout, getOutdoorBounds(store.getFloor(layout.floorId)!), object)).toBeUndefined();
        expect(getPlayerAssetRoomError(layout, object, "user-jonas", store.getGameSettings(), store.getOrganisation())).toBeUndefined();
      }
    }
  });

  it("places Jonas's purchased desk and enforces room grants for both demo build modes", () => {
    const store = new WorkspaceStore(createTestData());
    const ownedAssetId = store.purchaseAsset("user-jonas", "desk-straight", "seed-test:desk").transaction.ownedAssetId!;
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const jonas = runtime.connect("user-jonas", "floor-studio", (event) => events.push(event));
    const maya = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));
    const revision = () => store.getLayout("floor-studio")!.revision;
    try {
      runtime.handleCommand(jonas, { type: "player_asset.place", requestId: "desk", baseRevision: revision(),
        ownedAssetId, position: { x: 416, y: 768 }, variantId: "sage", rotation: 0 });
      const placed = store.getLayout("floor-studio")!.objects.find((object) => object.ownedAssetId === ownedAssetId)!;
      expect(placed).toMatchObject({ ownerUserId: "user-jonas", assetId: "desk-straight" });
      expect(store.getOwnedAsset("user-jonas", ownedAssetId).placement?.objectId).toBe(placed.id);
      runtime.handleCommand(jonas, { type: "layout.apply", requestId: "office-denied", baseRevision: revision(),
        edit: { tool: "asset", assetId: "chair-office", variantId: "white", rotation: 0, position: { x: 560, y: 768 } } });
      expect(events.at(-1)).toMatchObject({ type: "command.error", code: "EDIT_FORBIDDEN" });
      runtime.handleCommand(maya, { type: "layout.apply", requestId: "office-chair", baseRevision: revision(),
        edit: { tool: "asset", assetId: "chair-office", variantId: "white", rotation: 0, position: { x: 560, y: 768 } } });
      expect(store.getLayout("floor-studio")!.objects).toContainEqual(expect.objectContaining({ assetId: "chair-office", x: 560, y: 768 }));
      for (const peer of [jonas, maya]) {
        if (peer === jonas) {
          runtime.handleCommand(peer, { type: "player_asset.move", requestId: `move-${peer}`, baseRevision: revision(),
            objectId: placed.id, position: { x: 128, y: 304 }, variantId: "sage", rotation: 0 });
        } else {
          runtime.handleCommand(peer, { type: "layout.apply", requestId: `move-${peer}`, baseRevision: revision(),
            edit: { tool: "asset.move", objectId: placed.id, position: { x: 128, y: 304 }, variantId: "sage", rotation: 0 } });
        }
        expect(events.at(-1)).toMatchObject({ type: "command.error", code: "ASSET_ROOM_FORBIDDEN" });
      }
      const room = store.getRoom("room-product")!;
      store.updateRoomSettings(room.id, { name: room.name, color: room.color,
        access: { mode: "none", assignedPersonIds: [], knockable: false }, build: room.build! });
      expect(roomBuildAllows(store.getRoom(room.id)!, "user-jonas", store.getGameSettings(), store.getOrganisation())).toBe(false);
      runtime.handleCommand(jonas, { type: "player_asset.remove", requestId: "recover-denied", baseRevision: revision(), objectId: placed.id });
      expect(events.at(-1)).toMatchObject({ type: "command.error", code: "ASSET_ROOM_FORBIDDEN" });
    } finally {
      runtime.stop();
    }
  });

  it("lets the seeded CEOs start a removal vote without seeding ballots or a result", () => {
    const store = new WorkspaceStore(createTestData());
    store.editOrganisation("user-maya", store.getOrganisation().revision, { type: "ceo.propose_removal", userId: "user-sam" });
    const vote = store.getOrganisation().removalVotes[0]!;
    expect(vote).toMatchObject({ status: "open", ballots: [], electorate: ["user-maya", "user-noah"] });
    store.editOrganisation("user-maya", store.getOrganisation().revision, { type: "ceo.vote", voteId: vote.id, approve: true });
    expect(store.getOrganisation().removalVotes[0]!.status).toBe("open");
    store.editOrganisation("user-noah", store.getOrganisation().revision, { type: "ceo.vote", voteId: vote.id, approve: true });
    expect(store.getOrganisation().ceoIds).toEqual(["user-maya", "user-noah"]);
    expect(store.getOrganisation().assignments.some((assignment) => assignment.userId === "user-sam")).toBe(false);
    expect(createTestData().organisation.removalVotes).toEqual([]);
  });
});
