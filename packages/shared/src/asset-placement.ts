import {
  ASSET_RASTER_SIZE,
  getPlacedAssetCells,
  requireAssetDefinition,
  type AssetLayer,
  type PlacedAssetCell,
  type WorldObject,
} from "./assets.js";
import { getWallSolidRects, type FloorLayout } from "./building.js";
import { rectanglesOverlap, type Rect } from "./geometry.js";

export type AssetPlacementError =
  | "ASSET_OFF_RASTER"
  | "ASSET_OUT_OF_RANGE"
  | "ASSET_BLOCKED"
  | "ASSET_REQUIRES_SURFACE";

export interface AssetPlacementBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

const collisionRectCache = new WeakMap<FloorLayout, {
  revision: number;
  objects: FloorLayout["objects"];
  objectCount: number;
  rects: Rect[];
}>();

interface AssetPlacementContext {
  revision: number;
  walls: FloorLayout["walls"];
  openings: FloorLayout["openings"];
  objects: FloorLayout["objects"];
  wallCount: number;
  openingCount: number;
  objectCount: number;
  wallRects: Rect[];
  occupiedCells: Record<AssetLayer, Map<string, Set<string>>>;
  supportedCells: Set<string>;
}

const placementContextCache = new WeakMap<FloorLayout, AssetPlacementContext>();

export function getAssetPlacementError(
  layout: FloorLayout,
  bounds: AssetPlacementBounds,
  candidate: WorldObject,
): AssetPlacementError | undefined {
  if (candidate.x % ASSET_RASTER_SIZE !== 0 || candidate.y % ASSET_RASTER_SIZE !== 0) {
    return "ASSET_OFF_RASTER";
  }
  const definition = requireAssetDefinition(candidate.assetId);
  const candidateCells = getPlacedAssetCells(candidate);
  const left = bounds.x ?? 0;
  const top = bounds.y ?? 0;
  const right = left + bounds.width;
  const bottom = top + bounds.height;
  if (candidateCells.some((cell) => (
    cell.worldX < left
    || cell.worldY < top
    || cell.worldX + ASSET_RASTER_SIZE > right
    || cell.worldY + ASSET_RASTER_SIZE > bottom
  ))) {
    return "ASSET_OUT_OF_RANGE";
  }
  const context = getAssetPlacementContext(layout);
  if (candidateCells.some((cell) => context.wallRects.some((wall) => rectanglesOverlap(cellRect(cell), wall)))) {
    return "ASSET_BLOCKED";
  }

  const occupiedCells = context.occupiedCells[definition.placement.layer];
  if (candidateCells.some((cell) => hasOtherOccupant(occupiedCells.get(worldCellKey(cell)), candidate.id))) {
    return "ASSET_BLOCKED";
  }
  if (definition.placement.requires !== "floor" && candidateCells.some((cell) => !context.supportedCells.has(worldCellKey(cell)))) {
    return "ASSET_REQUIRES_SURFACE";
  }
  return undefined;
}

export function getAssetsSupportedBy(layout: FloorLayout, supportingObject: WorldObject): WorldObject[] {
  const supportingDefinition = requireAssetDefinition(supportingObject.assetId);
  if (supportingDefinition.placement.layer !== "floor") {
    return [];
  }
  const supportedKeys = new Set(
    getPlacedAssetCells(supportingObject)
      .filter((cell) => cell.allows.length > 0)
      .map(worldCellKey),
  );
  return layout.objects.filter((object) => {
    if (object.id === supportingObject.id || requireAssetDefinition(object.assetId).placement.layer !== "surface") {
      return false;
    }
    return getPlacedAssetCells(object).some((cell) => supportedKeys.has(worldCellKey(cell)));
  });
}

export function getAssetCollisionRects(layout: FloorLayout): Rect[] {
  const cached = collisionRectCache.get(layout);
  if (cached && cached.revision === layout.revision && cached.objects === layout.objects && cached.objectCount === layout.objects.length) {
    return cached.rects;
  }
  const rects = layout.objects.flatMap((object) => getPlacedAssetCells(object)
    .filter((cell) => cell.solid)
    .map(cellRect));
  collisionRectCache.set(layout, {
    revision: layout.revision,
    objects: layout.objects,
    objectCount: layout.objects.length,
    rects,
  });
  return rects;
}

export function worldCellKey(cell: Pick<PlacedAssetCell, "worldX" | "worldY">): string {
  return `${cell.worldX / ASSET_RASTER_SIZE}:${cell.worldY / ASSET_RASTER_SIZE}`;
}

function getAssetPlacementContext(layout: FloorLayout): AssetPlacementContext {
  const cached = placementContextCache.get(layout);
  if (
    cached
    && cached.revision === layout.revision
    && cached.walls === layout.walls
    && cached.openings === layout.openings
    && cached.objects === layout.objects
    && cached.wallCount === layout.walls.length
    && cached.openingCount === layout.openings.length
    && cached.objectCount === layout.objects.length
  ) {
    return cached;
  }
  const occupiedCells: AssetPlacementContext["occupiedCells"] = {
    ground: new Map(),
    floor: new Map(),
    surface: new Map(),
  };
  const supportedCells = new Set<string>();
  for (const object of layout.objects) {
    const definition = requireAssetDefinition(object.assetId);
    for (const cell of getPlacedAssetCells(object)) {
      const key = worldCellKey(cell);
      const occupants = occupiedCells[definition.placement.layer].get(key) ?? new Set<string>();
      occupants.add(object.id);
      occupiedCells[definition.placement.layer].set(key, occupants);
      if (definition.placement.layer === "floor" && cell.allows.includes("decoration")) {
        supportedCells.add(key);
      }
    }
  }
  const context: AssetPlacementContext = {
    revision: layout.revision,
    walls: layout.walls,
    openings: layout.openings,
    objects: layout.objects,
    wallCount: layout.walls.length,
    openingCount: layout.openings.length,
    objectCount: layout.objects.length,
    wallRects: layout.walls.flatMap((wall) => getWallSolidRects(wall, layout.openings)),
    occupiedCells,
    supportedCells,
  };
  placementContextCache.set(layout, context);
  return context;
}

function hasOtherOccupant(occupants: Set<string> | undefined, candidateId: string): boolean {
  if (!occupants) {
    return false;
  }
  for (const objectId of occupants) {
    if (objectId !== candidateId) {
      return true;
    }
  }
  return false;
}

function cellRect(cell: PlacedAssetCell): Rect {
  return {
    x: cell.worldX,
    y: cell.worldY,
    width: ASSET_RASTER_SIZE,
    height: ASSET_RASTER_SIZE,
  };
}
