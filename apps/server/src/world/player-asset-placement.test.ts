import { describe, expect, it } from "vitest";
import { createOrganisation, getDefaultAssetVariantId, getPlayerAssetRoomError, requireAssetDefinition, type FloorLayout, type GameSettings, type Room, type WorldObject } from "@workhard/shared";

describe("player asset room authorization", () => {
  it("allows assigned players and rejects other players", () => {
    const assignedRoom = room("assigned", "assigned", ["player"]);
    const office = layout([assignedRoom]);

    expect(getPlayerAssetRoomError(office, asset(16, 16), "player", settings(false), createOrganisation())).toBeUndefined();
    expect(getPlayerAssetRoomError(office, asset(16, 16), "other", settings(true), createOrganisation())).toBe("ASSET_ROOM_FORBIDDEN");
  });

  it("uses the global setting for open rooms", () => {
    const office = layout([room("public", "open", [])]);

    expect(getPlayerAssetRoomError(office, asset(16, 16), "player", settings(false), createOrganisation())).toBe("ASSET_ROOM_FORBIDDEN");
    expect(getPlayerAssetRoomError(office, asset(16, 16), "player", settings(true), createOrganisation())).toBeUndefined();
  });

  it("requires the complete raster footprint to fit one room", () => {
    const office = layout([room("public", "open", [])]);

    expect(getPlayerAssetRoomError(office, asset(48, 16), "player", settings(true), createOrganisation())).toBe("ASSET_ROOM_REQUIRED");
    expect(getPlayerAssetRoomError(layout([]), asset(16, 16), "player", settings(true), createOrganisation())).toBe("ASSET_ROOM_REQUIRED");
  });
});

function settings(allow: boolean): GameSettings {
  return { roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: allow ? "open" : "none", assignedPersonIds: [] } };
}

function asset(x: number, y: number): WorldObject {
  const definition = requireAssetDefinition("chair-office");
  return {
    id: "asset",
    floorId: "floor",
    assetId: "chair-office",
    x,
    y,
    rotation: 0,
    variantId: getDefaultAssetVariantId(definition),
  };
}

function room(id: string, mode: Room["access"]["mode"], assignedPersonIds: string[]): Room {
  return {
    id,
    floorId: "floor",
    name: id,
    color: "#ffffff",
    capacity: 4,
    bounds: { x: 0, y: 0, width: 64, height: 64 },
    footprint: [{ x: 0, y: 0, width: 64, height: 64 }],
    boundary: [],
    doorIds: [],
    windowIds: [],
    privateEligible: true,
    access: { mode, assignedPersonIds, knockable: false },
    ...(mode === "assigned" ? { build: { mode, assignedPersonIds } } : {}),
  };
}

function layout(rooms: Room[]): FloorLayout {
  return {
    floorId: "floor",
    revision: 1,
    walls: [],
    openings: [],
    tiles: [],
    objects: [],
    rooms,
  };
}
