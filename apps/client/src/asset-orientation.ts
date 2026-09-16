import {
  ASSET_RASTER_SIZE,
  getAssetRasterSize,
  requireAssetDefinition,
} from "@workhard/shared";
import type { AssetRotation, Position, WorldObject } from "@workhard/shared";

const labels: Record<AssetRotation, string> = {
  0: "South",
  90: "West",
  180: "North",
  270: "East",
};

export function getAssetOrientationLabel(rotation: AssetRotation): string {
  return labels[rotation];
}

export function rotateAssetClockwise(rotation: AssetRotation): AssetRotation {
  return ((rotation + 90) % 360) as AssetRotation;
}

export function getRotatedAssetPosition(object: WorldObject, rotation: AssetRotation): Position {
  const definition = requireAssetDefinition(object.assetId);
  const base = getAssetRasterSize(definition, 0);
  const current = getAssetRasterSize(definition, object.rotation);
  const next = getAssetRasterSize(definition, rotation);
  return {
    x: object.x + (Math.ceil((base.width - next.width) / 2) - Math.ceil((base.width - current.width) / 2)) * ASSET_RASTER_SIZE,
    y: object.y + (Math.ceil((base.height - next.height) / 2) - Math.ceil((base.height - current.height) / 2)) * ASSET_RASTER_SIZE,
  };
}
