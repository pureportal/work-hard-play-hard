import { randomUUID } from "node:crypto";
import {
  ASSET_RASTER_SIZE,
  ASSET_ROTATIONS,
  BUILD_GRID_SIZE,
  MAX_LAYOUT_OBJECTS_PER_FLOOR,
  getAssetPlacementError,
  getAssetRasterSize,
  getPlacedAssetCells,
  getPlacedAssetBounds,
  requireAssetDefinition,
  requireAssetVariant,
  roomContainsBounds,
  type FloorLayout,
  type ProjectEdit,
  type WorldObject,
} from "@workhard/shared";

type FillEdit = Extract<ProjectEdit, { tool: "room.fill_tiles" }>;

export function fillRoomWithTiles(
  layout: FloorLayout,
  bounds: { x?: number; y?: number; width: number; height: number },
  edit: FillEdit,
  fundId: string,
  random: () => number = Math.random,
): FloorLayout {
  const room = layout.rooms.find((candidate) => candidate.id === edit.roomId);
  if (!room) throw new Error("ROOM_NOT_FOUND");
  const definition = requireAssetDefinition(edit.assetId);
  if (definition.kind !== "floor-tile" || !definition.buildable || !definition.shop) throw new Error("ASSET_UNAVAILABLE");
  requireAssetVariant(definition, edit.variantId);

  const objects = edit.mode === "replace"
    ? layout.objects.filter((object) => requireAssetDefinition(object.assetId).kind !== "floor-tile"
      || !roomContainsBounds(room, getPlacedAssetBounds(object)))
    : layout.objects;
  const base = { ...layout, objects };
  const size = getAssetRasterSize(definition, 0);
  const width = size.width * ASSET_RASTER_SIZE;
  const height = size.height * ASSET_RASTER_SIZE;
  const candidates: WorldObject[] = [];
  for (let y = room.bounds.y; y + height <= room.bounds.y + room.bounds.height; y += BUILD_GRID_SIZE) {
    for (let x = room.bounds.x; x + width <= room.bounds.x + room.bounds.width; x += BUILD_GRID_SIZE) {
      const candidate: WorldObject = {
        id: "fill-preview", floorId: layout.floorId, assetId: edit.assetId, variantId: edit.variantId,
        rotation: edit.rotation, x, y,
      };
      if (roomContainsBounds(room, getPlacedAssetBounds(candidate)) && !getAssetPlacementError(base, bounds, candidate)) {
        candidates.push(candidate);
      }
    }
  }

  const phases = new Map<string, WorldObject[]>();
  for (const candidate of candidates) {
    const phase = `${(candidate.x - room.bounds.x) % width}:${(candidate.y - room.bounds.y) % height}`;
    const group = phases.get(phase) ?? [];
    group.push(candidate);
    phases.set(phase, group);
  }
  let selected: WorldObject[] = [];
  for (const primary of phases.values()) {
    const occupied = new Set<string>();
    const arrangement: WorldObject[] = [];
    for (const candidate of [...primary, ...candidates]) {
      const cells = getPlacedAssetCells(candidate);
      if (cells.some((cell) => occupied.has(`${cell.worldX}:${cell.worldY}`))) continue;
      arrangement.push(candidate);
      for (const cell of cells) occupied.add(`${cell.worldX}:${cell.worldY}`);
    }
    if (arrangement.length > selected.length) selected = arrangement;
  }
  if (selected.length === 0) throw new Error("ROOM_FILL_NO_SPACE");
  if (objects.length + selected.length > MAX_LAYOUT_OBJECTS_PER_FLOOR) throw new Error("LAYOUT_CAPACITY_REACHED");
  const placed = selected.map((candidate) => ({ ...candidate, id: randomUUID(), publicFundId: fundId,
    rotation: edit.randomRotation ? ASSET_ROTATIONS[Math.floor(random() * ASSET_ROTATIONS.length)]! : edit.rotation }));
  return { ...base, objects: [...objects, ...placed] };
}
