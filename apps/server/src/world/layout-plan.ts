import {
  ASSET_RASTER_SIZE, detectLayoutRooms, getAssetPlacementError, getAssetRasterSize,
  getDefaultAssetVariantId, getOutdoorBounds, requireAssetDefinition, requireAssetVariant,
  type AssetRotation, type Floor, type FloorLayout, type RoomTemplate, type WorldObject,
} from "@workhard/shared";

export class LayoutPlan {
  readonly layout: FloorLayout;

  constructor(readonly floor: Floor) {
    this.layout = { floorId: floor.id, revision: 0, walls: [], openings: [], tiles: [], objects: [], rooms: [] };
  }

  wall(id: string, x1: number, y1: number, x2: number, y2: number): void {
    this.layout.walls.push({ id: `${this.floor.id}-${id}`, start: { x: x1, y: y1 }, end: { x: x2, y: y2 } });
  }

  opening(wallId: string, offset: number, type: "door" | "window"): void {
    const opening = { id: `${this.floor.id}-${wallId}-${type}-${offset}`, wallId: `${this.floor.id}-${wallId}`, offset };
    this.layout.openings.push(type === "door"
      ? { ...opening, type, width: 64 }
      : { ...opening, type, width: 96, light: { color: "#fff0d1", intensity: 0.18, depth: 128 } });
  }

  object(id: string, assetId: string, x: number, y: number, variantId?: string, rotation: AssetRotation = 0): WorldObject {
    const definition = requireAssetDefinition(assetId);
    const variant = variantId ?? getDefaultAssetVariantId(definition);
    requireAssetVariant(definition, variant);
    const object: WorldObject = { id: `${this.floor.id}-${id}`, floorId: this.floor.id, assetId, x, y, variantId: variant, rotation };
    const error = getAssetPlacementError(this.layout, getOutdoorBounds(this.floor), object);
    if (error) throw new Error(`${object.id}: ${error}`);
    this.layout.objects.push(object);
    return object;
  }

  flooring(id: string, assetId: string, variantId: string, x: number, y: number, width: number, height: number): void {
    const size = getAssetRasterSize(requireAssetDefinition(assetId));
    const stepX = size.width * ASSET_RASTER_SIZE;
    const stepY = size.height * ASSET_RASTER_SIZE;
    if (width % stepX || height % stepY) throw new Error(`${id}: FLOORING_SIZE_INVALID`);
    for (let row = 0; row < height / stepY; row++) {
      for (let column = 0; column < width / stepX; column++) {
        this.object(`${id}-${column}-${row}`, assetId, x + column * stepX, y + row * stepY, variantId);
      }
    }
  }

  finish(rooms: RoomTemplate[]): FloorLayout {
    const layout = detectLayoutRooms(this.layout, this.floor, rooms);
    if (layout.rooms.length !== rooms.length || rooms.some((room) => !layout.rooms.some(({ id }) => id === room.id))) {
      throw new Error(`${this.floor.id}: ROOM_GEOMETRY_MISMATCH`);
    }
    return layout;
  }
}
