import {
  ASSET_RASTER_SIZE, canUseWorkObject, getAssetPlacementError, getGameArea, getOutdoorBounds, getPlacedAssetCells,
  getPlacedAssetInteractions, getRoomDoorPosition, getSpawnPlacementError, isPointInRoom,
  requireAssetDefinition, SPECIAL_PROP_RANGE,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { canOccupy } from "./collision.js";
import { findPath } from "./pathfinding.js";
import { canReachSeat } from "./seat-reachability.js";
import { createStartingHouse } from "./starting-house.js";

describe("starting house", () => {
  it("keeps the start point, every doorway, and the garden reachable", () => {
    const { floor, layout } = createStartingHouse();
    const bounds = getOutdoorBounds(floor);
    expect(getSpawnPlacementError(layout, bounds, floor.spawn)).toBeUndefined();
    const destinations = [{ x: floor.spawn.x, y: 896 }, { x: 976, y: 944 }];
    for (const room of layout.rooms) {
      for (const opening of layout.openings) {
        if (opening.type !== "door" || !room.doorIds.includes(opening.id)) continue;
        destinations.push(getRoomDoorPosition(layout, room, opening, "inside"));
        destinations.push(getRoomDoorPosition(layout, room, opening, "outside"));
      }
    }
    for (const destination of destinations) {
      expect(findPath(layout, bounds, "player", floor.spawn, destination).at(-1)).toEqual(destination);
    }
  });

  it("floors every room and keeps the outdoor furnishings on a small patio", () => {
    const { floor, layout } = createStartingHouse();
    const flooringCells = new Set<string>();
    for (const object of layout.objects) {
      expect(getAssetPlacementError(layout, getOutdoorBounds(floor), object), object.id).toBeUndefined();
      const cells = getPlacedAssetCells(object);
      for (const cell of cells) {
        const indoors = layout.rooms.some((room) => isPointInRoom(cell.worldX + 8, cell.worldY + 8, room));
        if (!indoors) {
          expect(cell.worldX, object.id).toBeGreaterThanOrEqual(768);
          expect(cell.worldX, object.id).toBeLessThan(1152);
          expect(cell.worldY, object.id).toBeGreaterThanOrEqual(832);
          expect(cell.worldY, object.id).toBeLessThan(960);
        }
        if (requireAssetDefinition(object.assetId).kind === "floor-tile") {
          flooringCells.add(`${cell.worldX}:${cell.worldY}`);
        }
      }
    }
    expect(layout.tiles).toEqual([]);
    for (const room of layout.rooms) {
      for (const rect of room.footprint) {
        for (let y = rect.y; y < rect.y + rect.height; y += ASSET_RASTER_SIZE) {
          for (let x = rect.x; x < rect.x + rect.width; x += ASSET_RASTER_SIZE) {
            expect(flooringCells.has(`${x}:${y}`), `${room.name}: ${x},${y}`).toBe(true);
          }
        }
      }
    }
  });

  it("provides a furnished meeting room and a studio without desks or chairs", () => {
    const { layout } = createStartingHouse();
    const meetingRoom = layout.rooms.find((room) => room.meetingRoom)!;
    expect(meetingRoom.name).toBe("Meeting room");
    expect(meetingRoom.doorIds.length).toBeGreaterThan(0);
    expect(layout.objects.some((object) => object.assetId === "table-round" && isPointInRoom(object.x, object.y, meetingRoom))).toBe(true);
    const studio = layout.rooms.find((room) => room.name === "Studio")!;
    const studioFurniture = layout.objects.filter((object) => isPointInRoom(object.x, object.y, studio))
      .map((object) => requireAssetDefinition(object.assetId).kind);
    expect(studioFurniture).not.toContain("desk");
    expect(studioFurniture).not.toContain("table");
    expect(studioFurniture).not.toContain("chair");
    expect(layout.objects.some((object) => object.assetId === "outdoor-bench")).toBe(true);
  });

  it("leaves a walkable approach to every seat", () => {
    const { floor, layout } = createStartingHouse();
    const bounds = getOutdoorBounds(floor);
    for (const object of layout.objects) {
      for (const seat of getPlacedAssetInteractions(object)) {
        const candidates = [
          { x: seat.bounds.x - 16, y: seat.center.y },
          { x: seat.bounds.x + seat.bounds.width + 16, y: seat.center.y },
          { x: seat.center.x, y: seat.bounds.y - 16 },
          { x: seat.center.x, y: seat.bounds.y + seat.bounds.height + 16 },
        ];
        const reachable = candidates.some((point) => {
          if (!canOccupy(layout, bounds, "player", floor.spawn.x, floor.spawn.y, point.x, point.y)
            || !canReachSeat(layout, point, seat.center)) return false;
          const endpoint = findPath(layout, bounds, "player", floor.spawn, point).at(-1);
          return endpoint?.x === point.x && endpoint.y === point.y;
        });
        expect(reachable, `${object.id}: ${seat.id}`).toBe(true);
      }
    }
  });

  it("keeps the starter games, whiteboard, and fortune dispenser reachable in their rooms", () => {
    const { floor, layout } = createStartingHouse();
    const bounds = getOutdoorBounds(floor);
    const activities = [
      { assetId: "equipment-falling-blocks", roomId: "room-main", approach: { x: 832, y: 752 } },
      { assetId: "equipment-chess", roomId: "room-main", approach: { x: 688, y: 768 } },
      { assetId: "equipment-whiteboard", roomId: "room-meeting", approach: { x: 688, y: 352 } },
      { assetId: "special-fortune", roomId: "room-kitchen", approach: { x: 1104, y: 640 } },
    ];
    for (const { assetId, roomId, approach } of activities) {
      const objects = layout.objects.filter((object) => object.assetId === assetId);
      expect(objects, assetId).toHaveLength(1);
      const object = objects[0]!;
      const room = layout.rooms.find((candidate) => candidate.id === roomId)!;
      expect(isPointInRoom(object.x, object.y, room), assetId).toBe(true);
      expect(isPointInRoom(approach.x, approach.y, room), assetId).toBe(true);
      expect(findPath(layout, bounds, "player", floor.spawn, approach).at(-1), assetId).toEqual(approach);
      if (requireAssetDefinition(assetId).kind === "game") {
        const area = getGameArea(object);
        expect(Math.hypot(floor.spawn.x - area.x, floor.spawn.y - area.y), assetId).toBeGreaterThan(area.radius);
        expect(Math.hypot(approach.x - area.x, approach.y - area.y), assetId).toBeLessThan(area.radius);
      } else if (assetId === "equipment-whiteboard") {
        expect(canUseWorkObject(object, layout, { ...approach, floorId: floor.id })).toBe(true);
      } else {
        expect(Math.hypot(approach.x - object.x, approach.y - object.y)).toBeLessThan(SPECIAL_PROP_RANGE);
      }
    }
  });
});
