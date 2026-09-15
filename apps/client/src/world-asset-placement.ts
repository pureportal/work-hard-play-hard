import {
  ASSET_RASTER_SIZE, getCenteredAssetPosition, getPlacedAssetCells, requireAssetDefinition, worldCellKey,
  type AssetDefinition, type AssetRotation, type FloorLayout, type Position, type Rect, type WorldObject,
} from "@workhard/shared";
import { getWorldAssetArtwork, getWorldAssetSurfaceHeight } from "./world-asset-artwork";

interface Surface {
  height: number;
  object: WorldObject;
}

const surfaceCache = new WeakMap<FloorLayout, { revision: number; objects: WorldObject[]; count: number; cells: Map<string, Surface> }>();

function getSurfaces(layout: FloorLayout): Map<string, Surface> {
  const cached = surfaceCache.get(layout);
  if (cached?.revision === layout.revision && cached.objects === layout.objects && cached.count === layout.objects.length) return cached.cells;
  const cells = new Map<string, Surface>();
  for (const object of layout.objects) {
    const asset = requireAssetDefinition(object.assetId);
    if (asset.placement.layer !== "floor") continue;
    const supporting = getPlacedAssetCells(object).filter(cell => cell.allows.includes("decoration"));
    if (!supporting.length) continue;
    const surface = { height: getWorldAssetSurfaceHeight(asset.id), object };
    for (const cell of supporting) cells.set(worldCellKey(cell), surface);
  }
  surfaceCache.set(layout, { revision: layout.revision, objects: layout.objects, count: layout.objects.length, cells });
  return cells;
}

export function getWorldAssetSurfaceOffset(layout: FloorLayout, object: WorldObject): number {
  if (requireAssetDefinition(object.assetId).placement.layer !== "surface") return 0;
  const surfaces = getSurfaces(layout);
  const height = Math.max(0, ...getPlacedAssetCells(object).map(cell => surfaces.get(worldCellKey(cell))?.height ?? 0));
  return height === 0 ? 0 : -height / Math.SQRT2;
}

export function getPlacedWorldAssetArtwork(layout: FloorLayout, object: WorldObject) {
  const artwork = getWorldAssetArtwork(requireAssetDefinition(object.assetId), object.variantId, object.rotation);
  return { ...artwork, bounds: { ...artwork.bounds, y: artwork.bounds.y + getWorldAssetSurfaceOffset(layout, object) } };
}

export function getPlacedWorldAssetBounds(layout: FloorLayout, object: WorldObject): Rect {
  const bounds = getPlacedWorldAssetArtwork(layout, object).bounds;
  return { ...bounds, x: object.x + bounds.x, y: object.y + bounds.y };
}

export function getWorldAssetPlacementPosition(layout: FloorLayout, asset: AssetDefinition, rotation: AssetRotation, point: Position): Position {
  if (asset.placement.layer === "surface") {
    const surfaces = getSurfaces(layout);
    const ordered = [...new Set(surfaces.values())].sort((left, right) => right.object.y - left.object.y);
    for (const surface of ordered) {
      const ground = { x: point.x, y: point.y + surface.height / Math.SQRT2 };
      const key = `${Math.floor(ground.x / ASSET_RASTER_SIZE)}:${Math.floor(ground.y / ASSET_RASTER_SIZE)}`;
      if (surfaces.get(key) === surface) return getCenteredAssetPosition(asset, rotation, ground);
    }
  }
  return getCenteredAssetPosition(asset, rotation, point);
}
