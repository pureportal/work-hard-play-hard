import { ASSET_RASTER_SIZE, getAssetRasterSize, requireAssetDefinition, type AssetRotation, type WorldObject } from "./assets.js";
import { getAssetPlacementError, getAssetsSupportedBy, type AssetPlacementBounds, type AssetPlacementError } from "./asset-placement.js";
import type { FloorLayout } from "./building.js";

export function getMovedAssetCandidates(layout: FloorLayout, candidate: WorldObject): WorldObject[] {
  const source = layout.objects.find((object) => object.id === candidate.id);
  if (!source) return [candidate];

  const rotation = ((candidate.rotation - source.rotation + 360) % 360) as AssetRotation;
  const size = getAssetRasterSize(requireAssetDefinition(source.assetId), source.rotation);
  return [candidate, ...getAssetsSupportedBy(layout, source).map((object) => {
    const itemSize = getAssetRasterSize(requireAssetDefinition(object.assetId), object.rotation);
    const x = (object.x - source.x) / ASSET_RASTER_SIZE;
    const y = (object.y - source.y) / ASSET_RASTER_SIZE;
    const position = rotation === 90
      ? { x: size.height - y - itemSize.height, y: x }
      : rotation === 180
        ? { x: size.width - x - itemSize.width, y: size.height - y - itemSize.height }
        : rotation === 270
          ? { x: y, y: size.width - x - itemSize.width }
          : { x, y };
    return {
      ...object,
      x: candidate.x + position.x * ASSET_RASTER_SIZE,
      y: candidate.y + position.y * ASSET_RASTER_SIZE,
      rotation: ((object.rotation + rotation) % 360) as AssetRotation,
    };
  })];
}

export function getMovedAssetPlacementError(
  layout: FloorLayout,
  bounds: AssetPlacementBounds,
  moved: readonly WorldObject[],
): AssetPlacementError | undefined {
  if (moved.length === 1) return getAssetPlacementError(layout, bounds, moved[0]!);
  const replacements = new Map(moved.map((object) => [object.id, object]));
  const next = { ...layout, objects: layout.objects.map((object) => replacements.get(object.id) ?? object) };
  for (const object of moved) {
    const error = getAssetPlacementError(next, bounds, object);
    if (error) return error;
  }
  return undefined;
}
