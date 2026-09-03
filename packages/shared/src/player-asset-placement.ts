import { ASSET_RASTER_SIZE, getPlacedAssetCells, type WorldObject } from "./assets.js";
import { isPointInRoom, type FloorLayout } from "./building.js";
import type { GameSettings } from "./economy.js";

export type PlayerAssetRoomError =
  | "ASSET_ROOM_REQUIRED"
  | "ASSET_ROOM_FORBIDDEN"
  | "PUBLIC_ASSET_PLACEMENT_DISABLED";

export function getPlayerAssetRoomError(
  layout: FloorLayout,
  object: WorldObject,
  userId: string,
  settings: GameSettings,
): PlayerAssetRoomError | undefined {
  const cells = getPlacedAssetCells(object);
  const room = layout.rooms.find((candidate) => cells.every((cell) => isPointInRoom(
    cell.worldX + ASSET_RASTER_SIZE / 2,
    cell.worldY + ASSET_RASTER_SIZE / 2,
    candidate,
  )));
  if (!room) {
    return "ASSET_ROOM_REQUIRED";
  }
  if (room.access.mode === "assigned") {
    return room.access.assignedPersonIds.includes(userId) ? undefined : "ASSET_ROOM_FORBIDDEN";
  }
  return settings.allowPlayerAssetPlacementInPublicRooms
    ? undefined
    : "PUBLIC_ASSET_PLACEMENT_DISABLED";
}
