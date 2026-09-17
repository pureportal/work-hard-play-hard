import { ASSET_RASTER_SIZE, getPlacedAssetCells, type WorldObject } from "./assets.js";
import { isPointInRoom, type FloorLayout, type Room, type RoomSettings } from "./building.js";
import { rectanglesOverlap, type Rect } from "./geometry.js";

export function roomContainsBounds(room: Room, bounds: Rect): boolean {
  if (bounds.x < room.bounds.x || bounds.y < room.bounds.y
    || bounds.x + bounds.width > room.bounds.x + room.bounds.width
    || bounds.y + bounds.height > room.bounds.y + room.bounds.height) return false;
  for (let x = bounds.x; x < bounds.x + bounds.width; x += ASSET_RASTER_SIZE) {
    for (let y = bounds.y; y < bounds.y + bounds.height; y += ASSET_RASTER_SIZE) {
      if (!isPointInRoom(x + ASSET_RASTER_SIZE / 2, y + ASSET_RASTER_SIZE / 2, room)) return false;
    }
  }
  return true;
}

export function isInPersonalSpace(layout: FloorLayout, object: WorldObject, userId: string): boolean {
  const cells = getPlacedAssetCells(object);
  return cells.length > 0 && layout.rooms.some((room) => {
    if (room.ownerUserId === userId) return cells.every((cell) => isPointInRoom(cell.worldX + ASSET_RASTER_SIZE / 2, cell.worldY + ASSET_RASTER_SIZE / 2, room));
    return room.personalAreas?.some((area) => area.ownerUserId === userId && cells.every((cell) =>
      cell.worldX >= area.bounds.x && cell.worldY >= area.bounds.y
      && cell.worldX + ASSET_RASTER_SIZE <= area.bounds.x + area.bounds.width
      && cell.worldY + ASSET_RASTER_SIZE <= area.bounds.y + area.bounds.height));
  });
}

export function validatePersonalSpaces(room: Room, settings: RoomSettings, memberIds: readonly string[]): void {
  if (settings.ownerUserId && !memberIds.includes(settings.ownerUserId)) throw new Error("ROOM_ASSIGNEE_NOT_FOUND");
  const areas = settings.personalAreas ?? [];
  if (areas.length > 100 || new Set(areas.map((area) => area.id)).size !== areas.length
    || settings.ownerUserId && areas.length) throw new Error("PERSONAL_AREA_INVALID");
  for (const area of areas) {
    if (!memberIds.includes(area.ownerUserId)) throw new Error("ROOM_ASSIGNEE_NOT_FOUND");
    if (!area.id || !area.name.trim() || area.name.length > 60
      || Object.values(area.bounds).some((value) => !Number.isSafeInteger(value) || value % ASSET_RASTER_SIZE !== 0)
      || area.bounds.width <= 0 || area.bounds.height <= 0 || !roomContainsBounds(room, area.bounds)
      || areas.some((other) => other.id !== area.id && rectanglesOverlap(area.bounds, other.bounds))) throw new Error("PERSONAL_AREA_INVALID");
  }
}
