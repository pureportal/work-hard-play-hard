import {
  ASSET_RASTER_SIZE, getAssetPlacementError, getOutdoorBounds, getPlacedAssetCells,
  getPlacedAssetInteractions, getRoomDoorPosition, getSpawnPlacementError, isPointInRoom,
  requireAssetDefinition,
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
    const destinations = [{ x: floor.spawn.x, y: 896 }];
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

  it("furnishes and floors the rooms while leaving the outdoors empty", () => {
    const { floor, layout } = createStartingHouse();
    const flooringCells = new Set<string>();
    for (const object of layout.objects) {
      expect(getAssetPlacementError(layout, getOutdoorBounds(floor), object), object.id).toBeUndefined();
      const cells = getPlacedAssetCells(object);
      for (const cell of cells) {
        expect(layout.rooms.some((room) => isPointInRoom(cell.worldX + 8, cell.worldY + 8, room)), object.id).toBe(true);
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
});
