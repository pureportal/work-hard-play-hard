import { getAssetPlacementError, getPlacedAssetBounds, roomContainsBounds, type FloorLayout, type ProjectEdit, type Room, type WorldObject } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { fillRoomWithTiles } from "./room-tile-fill.js";

const bounds = { width: 512, height: 512 };
const room: Room = {
  id: "room", floorId: "floor", name: "Room", color: "#ffffff", capacity: 4,
  bounds: { x: 64, y: 64, width: 192, height: 128 },
  footprint: [{ x: 64, y: 64, width: 192, height: 128 }],
  boundary: [], doorIds: [], windowIds: [], privateEligible: false,
  access: { mode: "open", assignedPersonIds: [], knockable: false },
};
const tile = (id: string, x: number, y: number, assetId = "floor-wood"): WorldObject => ({
  id, floorId: "floor", assetId, variantId: assetId === "floor-wood" ? "oak" : "limestone", rotation: 0, x, y,
});
const edit: Extract<ProjectEdit, { tool: "room.fill_tiles" }> = {
  tool: "room.fill_tiles", roomId: room.id, assetId: "floor-wood", variantId: "oak",
  mode: "keep", rotation: 0, randomRotation: false,
};
const layout = (objects: WorldObject[] = []): FloorLayout => ({
  floorId: "floor", revision: 0, walls: [], openings: [], tiles: [], objects, rooms: [room],
});

describe("room tile fill", () => {
  it("keeps existing tiles and fills the remaining room without overlap", () => {
    const existing = tile("existing", 64, 64, "floor-stone-tiles");
    const outside = tile("outside", 256, 64);
    const result = fillRoomWithTiles(layout([existing, outside]), bounds, edit, "workspace");

    expect(result.objects).toContainEqual(existing);
    expect(result.objects).toContainEqual(outside);
    expect(result.objects.filter((object) => roomContainsBounds(room, getPlacedAssetBounds(object)))).toHaveLength(6);
    for (const object of result.objects.slice(2)) {
      expect(roomContainsBounds(room, getPlacedAssetBounds(object))).toBe(true);
      expect(getAssetPlacementError({ ...result, objects: result.objects.filter((candidate) => candidate.id !== object.id) }, bounds, object)).toBeUndefined();
    }
  });

  it("replaces only tiles wholly inside the selected room and assigns per-tile rotations", () => {
    const existing = tile("existing", 64, 64, "floor-stone-tiles");
    const crossing = tile("crossing", 224, 64);
    const rotations = [0, 0.25, 0.5, 0.75];
    let index = 0;
    const result = fillRoomWithTiles(layout([existing, crossing]), bounds,
      { ...edit, mode: "replace", randomRotation: true }, "workspace", () => rotations[index++ % rotations.length]!);

    expect(result.objects.some((object) => object.id === existing.id)).toBe(false);
    expect(result.objects).toContainEqual(crossing);
    expect(new Set(result.objects.filter((object) => object.id !== crossing.id).map((object) => object.rotation)))
      .toEqual(new Set([0, 90, 180, 270]));
    expect(result.objects.filter((object) => roomContainsBounds(room, getPlacedAssetBounds(object)))).toHaveLength(5);
  });

  it("uses available pockets in a stepped room", () => {
    const steppedRoom = { ...room, footprint: [
      { x: 64, y: 64, width: 192, height: 64 },
      { x: 64, y: 128, width: 64, height: 64 },
    ] };
    const result = fillRoomWithTiles({ ...layout(), rooms: [steppedRoom] }, bounds, edit, "workspace");

    expect(result.objects.map((object) => [object.x, object.y])).toEqual([
      [64, 64], [128, 64], [192, 64], [64, 128],
    ]);
  });

  it("rejects an edit that cannot add any tile", () => {
    const full = layout(Array.from({ length: 6 }, (_, index) => tile(`tile-${index}`, 64 + index % 3 * 64, 64 + Math.floor(index / 3) * 64)));
    expect(() => fillRoomWithTiles(full, bounds, edit, "workspace")).toThrow("ROOM_FILL_NO_SPACE");
    expect(() => fillRoomWithTiles(full, bounds, { ...edit, assetId: "chair-office" }, "workspace")).toThrow("ASSET_UNAVAILABLE");
  });
});
