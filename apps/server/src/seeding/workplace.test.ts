import {
  ASSET_CATALOG, canUseWorkObject, detectRooms, getAssetPlacementError, getFloorPortals, getOpeningCenter,
  getOutdoorBounds, getPlacedAssetBounds, getPlacedAssetInteractions, getRoomDoorPosition, getSpawnPlacementError,
  getWallLength, isPointInRoom, requireAssetDefinition, roomAccessAllows, roomBuildAllows,
  type Floor, type FloorLayout, type Position,
} from "@workhard/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyPassword } from "../auth/passwords.js";
import { createInitialData } from "../initial-data.js";
import type { WorkspacePersistenceState } from "../persistence/application-database.js";
import { WorkspaceStore } from "../store.js";
import { canOccupy } from "../world/collision.js";
import { findPath } from "../world/pathfinding.js";
import { WorldRuntime } from "../world/world-runtime.js";
import { createSimulatedWorkplace, createWorkplaceAccounts } from "./workplace.js";

let simulation: WorkspacePersistenceState;
beforeAll(() => { simulation = createSimulatedWorkplace(); }, 30_000);

describe("workplace seeds", () => {
  it("furnishes the simulation with valid catalogue assets in detected rooms and outdoor spaces", () => {
    const { layouts, floors } = simulation.store;
    const assetIds = new Set(layouts.flatMap((layout) => layout.objects.map((object) => object.assetId)));
    expect(assetIds.size).toBeGreaterThan(200);
    expect([...assetIds].every((id) => ASSET_CATALOG.assets.some((asset) => asset.id === id))).toBe(true);
    for (const id of ["equipment-falling-blocks", "equipment-tic-tac-toe", "equipment-chess"]) expect(assetIds.has(id)).toBe(true);
    expect(layouts.flatMap((layout) => layout.rooms)).toHaveLength(21);
    for (const floor of floors) verifyLayout(floor, layouts.find((layout) => layout.floorId === floor.id)!);
    expect(new Set(getFloorPortals(floors, layouts).map((portal) => portal.destinationFloorId))).toEqual(new Set(floors.map((floor) => floor.id)));
  }, 30_000);

  it("furnishes the three open starter rooms and leaves the surrounding land empty", () => {
    const data = createInitialData();
    const layout = data.layouts[0]!;
    verifyLayout(data.floors[0]!, layout);
    expect(layout.rooms.map((room) => room.name)).toEqual(["Lounge", "Studio", "Kitchen"]);
    for (const room of layout.rooms) expect(layout.objects.some((object) => {
      const bounds = getPlacedAssetBounds(object);
      return requireAssetDefinition(object.assetId).kind !== "floor-tile" && isPointInRoom(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, room);
    })).toBe(true);
    expect(layout.rooms.every((room) => room.access.mode === "open" && !room.organisationUnitId && !room.access.knockable)).toBe(true);
    for (const records of [data.members, data.messages, data.meetings, data.invitations, data.scores, data.organisation.units, data.organisation.assignments]) {
      expect(records).toEqual([]);
    }
    expect(layout.objects.every((object) => {
      const bounds = getPlacedAssetBounds(object);
      return layout.rooms.some((room) => isPointInRoom(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, room));
    })).toBe(true);
  });

  it("restores valid relationships, real inventory instances and score-derived rewards", () => {
    const store = new WorkspaceStore();
    store.restoreMutableState(simulation.store);
    expect(store.getMembers()).toHaveLength(16);
    expect(store.getOrganisation().units).toHaveLength(9);
    expect(store.getOrganisation().assignments).toHaveLength(15);
    expect(store.getGameSettings().roomBuild.mode).toBe("none");
    expect(simulation.store.economy.accounts.flatMap((account) => account.inventory)).toHaveLength(6);
    expect(simulation.store.economy.accounts.flatMap((account) => account.inventory).filter((asset) => asset.placement)).toHaveLength(3);
    expect(simulation.store.scores).toHaveLength(6);
    const runtime = new WorldRuntime(store);
    try {
      runtime.restorePlayers(simulation.players);
      for (const player of runtime.serializePlayers()) {
        const seeded = simulation.players.find(({ userId }) => userId === player.userId)!;
        expect({ x: player.x, y: player.y }).toEqual({ x: seeded.x, y: seeded.y });
        expect(player.proximity).toBeUndefined();
      }
    } finally { runtime.stop(); }
    const members = new Set(store.getMembers().map(({ id }) => id));
    for (const conversation of simulation.store.conversations) {
      for (const id of conversation.participantIds ?? []) expect(members.has(id)).toBe(true);
      const messages = simulation.store.messages.filter(({ conversationId }) => conversationId === conversation.id);
      expect(messages.map(({ sequence }) => sequence)).toEqual(messages.map((_, index) => index + 1));
      for (const message of messages) expect(members.has(message.userId)).toBe(true);
    }
    for (const meeting of simulation.store.meetings) {
      expect(meeting.location.type).toBe("room");
      expect(store.getRoom(meeting.location.roomId)).toBeDefined();
      expect(meeting.participantIds).toEqual([]);
    }
  });

  it.each([
    ["room-leadership", "person-rowan", true, true], ["room-leadership", "person-imani", false, false],
    ["room-delivery", "person-imani", true, true], ["room-delivery", "person-mei", false, false],
    ["room-product", "person-lucia", true, true], ["room-product", "person-yuki", false, false],
    ["room-engineering", "person-mei", true, true], ["room-engineering", "person-tess", true, false],
    ["room-design", "person-celia", true, true], ["room-workshop", "person-soren", true, true],
    ["room-workshop", "person-mei", true, false], ["room-games", "person-tess", true, false],
  ])("respects %s permissions for %s", (roomId, userId, access, build) => {
    const state = simulation.store;
    const room = state.layouts.flatMap((layout) => layout.rooms).find(({ id }) => id === roomId)!;
    expect(roomAccessAllows(room, userId, state.economy.gameSettings, state.organisation)).toBe(access);
    expect(roomBuildAllows(room, userId, state.economy.gameSettings, state.organisation)).toBe(build);
    if (!access) {
      const layout = state.layouts.find(({ floorId }) => floorId === room.floorId)!;
      const floor = state.floors.find(({ id }) => id === room.floorId)!;
      const door = layout.openings.find((opening) => opening.id === room.doorIds[0] && opening.type === "door")!;
      expect(door.type).toBe("door");
      if (door.type !== "door") return;
      const inside = getRoomDoorPosition(layout, room, door, "inside");
      expect(canOccupy(layout, getOutdoorBounds(floor), userId, floor.spawn.x, floor.spawn.y, inside.x, inside.y)).toBe(false);
      expect(room.access.knockable).toBe(true);
    }
  });

  it("creates role usernames and the shared seed password without active sessions", async () => {
    const { auth, credentials } = await createWorkplaceAccounts(simulation);
    expect(auth.accounts.map(({ id }) => id)).toEqual(simulation.store.members.map(({ id }) => id));
    expect(credentials.map(({ username }) => username)).toEqual([
      "owner", "admin", "member", "member2", "member3", "member4", "member5", "member6",
      "member7", "member8", "member9", "admin2", "member10", "member11", "member12", "guest",
    ]);
    expect(new Set(credentials.map(({ password }) => password))).toEqual(new Set(["password"]));
    expect(auth.sessions).toEqual([]);
    expect(auth.magicLinks).toEqual([]);
    for (const [index, account] of auth.accounts.entries()) {
      expect(account.username).toBe(credentials[index]!.username);
      expect(account.email).toBe(simulation.store.members[index]!.email);
      expect(await verifyPassword("password", account.passwordHash)).toBe(true);
      expect(await verifyPassword("northstar", account.passwordHash)).toBe(false);
    }
  }, 60_000);
});

function verifyLayout(floor: Floor, layout: FloorLayout): void {
  const bounds = getOutdoorBounds(floor);
  const access = new Set(layout.rooms.map(({ id }) => id));
  expect(getSpawnPlacementError(layout, bounds, floor.spawn)).toBeUndefined();
  const detected = detectRooms({ floorId: floor.id, ...floor, walls: layout.walls, openings: layout.openings });
  expect(detected.map(({ bounds }) => bounds)).toEqual(layout.rooms.map(({ bounds }) => bounds));
  for (const object of layout.objects) expect(getAssetPlacementError(layout, bounds, object), object.id).toBeUndefined();
  for (const opening of layout.openings) {
    const wall = layout.walls.find(({ id }) => id === opening.wallId)!;
    expect(wall, opening.id).toBeDefined();
    expect(opening.offset).toBeGreaterThanOrEqual(0);
    expect(opening.offset + opening.width).toBeLessThanOrEqual(getWallLength(wall));
    for (const other of layout.openings.filter((candidate) => candidate.wallId === wall.id && candidate.id !== opening.id)) {
      expect(opening.offset >= other.offset + other.width || opening.offset + opening.width <= other.offset).toBe(true);
    }
    if (opening.type === "door") reaches(getOpeningCenter(wall, opening));
  }
  for (const room of layout.rooms) {
    expect(room.doorIds.length).toBeGreaterThan(0);
    if (room.access.mode === "assigned") expect(room.privateEligible).toBe(true);
    for (const doorId of room.doorIds) {
      const door = layout.openings.find((opening) => opening.id === doorId)!;
      if (door.type === "door") reaches(getRoomDoorPosition(layout, room, door, "inside", 48));
    }
  }
  for (const object of layout.objects.filter((object) => requireAssetDefinition(object.assetId).kind !== "floor-tile")) {
    const definition = requireAssetDefinition(object.assetId);
    if (!definition.workKind && !definition.interactions?.length && !["game", "portal", "gong"].includes(definition.kind)) continue;
    const objectBounds = getPlacedAssetBounds(object);
    const candidates: Position[] = [];
    for (let x = objectBounds.x - 32; x <= objectBounds.x + objectBounds.width + 32; x += 16) {
      for (const y of [objectBounds.y - 32, objectBounds.y + objectBounds.height + 32]) candidates.push({ x, y });
    }
    for (let y = objectBounds.y; y <= objectBounds.y + objectBounds.height; y += 16) {
      for (const x of [objectBounds.x - 32, objectBounds.x + objectBounds.width + 32]) candidates.push({ x, y });
    }
    const reachable = candidates.find((point) => canOccupy(layout, bounds, "inspection", floor.spawn.x, floor.spawn.y, point.x, point.y, 13, access)
      && (!definition.workKind || canUseWorkObject(object, layout, { ...point, floorId: floor.id }))
      && reachesDestination(point));
    expect(reachable, `${object.id} must be usable from the spawn`).toBeDefined();
    for (const interaction of getPlacedAssetInteractions(object)) expect(interaction.cells.length).toBeGreaterThan(0);
  }
  function reachesDestination(point: Position): boolean {
    if (point.x === floor.spawn.x && point.y === floor.spawn.y) return true;
    const end = findPath(layout, bounds, "inspection", floor.spawn, point, access).at(-1);
    return Boolean(end && Math.hypot(end.x - point.x, end.y - point.y) < 1);
  }
  function reaches(point: Position): void { expect(reachesDestination(point), `Unreachable ${floor.id} ${point.x},${point.y}`).toBe(true); }
}
