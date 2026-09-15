import { ASSET_RASTER_SIZE, getPlacedAssetCells, type WorldObject } from "./assets.js";
import { isPointInRoom, type FloorLayout } from "./building.js";
import type { GameSettings } from "./economy.js";
import type { OrganisationState } from "./organisation.js";
import { roomBuildAllows } from "./room-permissions.js";

export type PlayerAssetRoomError =
  | "ASSET_ROOM_REQUIRED"
  | "ASSET_ROOM_FORBIDDEN";

export function getPlayerAssetRoomError(
  layout: FloorLayout,
  object: WorldObject,
  userId: string,
  settings: GameSettings,
  organisation: OrganisationState,
  allowOutsideRooms = false,
): PlayerAssetRoomError | undefined {
  const cells = getPlacedAssetCells(object);
  const room = layout.rooms.find((candidate) => cells.every((cell) => isPointInRoom(
    cell.worldX + ASSET_RASTER_SIZE / 2,
    cell.worldY + ASSET_RASTER_SIZE / 2,
    candidate,
  )));
  if (!room) {
    const touchesRoom = layout.rooms.some((candidate) => cells.some((cell) => isPointInRoom(cell.worldX + ASSET_RASTER_SIZE / 2, cell.worldY + ASSET_RASTER_SIZE / 2, candidate)));
    return allowOutsideRooms && !touchesRoom ? undefined : "ASSET_ROOM_REQUIRED";
  }
  return roomBuildAllows(room, userId, settings, organisation) ? undefined : "ASSET_ROOM_FORBIDDEN";
}
