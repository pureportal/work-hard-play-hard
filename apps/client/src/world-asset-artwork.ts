import { ASSET_RASTER_SIZE, getAssetRasterSize, requireAssetVariant } from "@workhard/shared";
import type { AssetDefinition, AssetKind, AssetRotation, Rect } from "@workhard/shared";
import artworkSource from "./world-asset-artwork.json";

interface AssetArtwork {
  elevation: number;
  variants: Record<string, { path: string; width: number; height: number; frames: readonly Rect[] }>;
}

export interface WorldAssetArtwork {
  path: string;
  frame: Rect;
  bounds: Rect;
  atlasWidth: number;
  atlasHeight: number;
}

const artwork: Record<string, AssetArtwork> = artworkSource;
const floorProjections = new Set<AssetKind>(["floor-tile", "desk", "sofa", "table", "garden", "pool", "rug", "storage", "bookshelf", "appliance"]);
const flatObjects = new Set(["plant-planter-row", "decor-books"]);

export function getWorldAssetArtwork(asset: AssetDefinition, variantId: string, rotation: AssetRotation): WorldAssetArtwork {
  requireAssetVariant(asset, variantId);
  const entry = artwork[asset.id];
  const variant = entry?.variants[variantId];
  if (!entry || !variant) throw new Error(`Missing artwork for ${asset.id}/${variantId}`);
  const index = rotation / 90;
  const crop = variant.frames[index]!;
  const size = getAssetRasterSize(asset, rotation);
  const elevation = entry.elevation;
  const width = size.width * ASSET_RASTER_SIZE;
  const height = size.height * ASSET_RASTER_SIZE + elevation;
  const projectsFootprint = floorProjections.has(asset.kind) || flatObjects.has(asset.id);
  const displayWidth = projectsFootprint ? width : Math.min(width, crop.width * height / crop.height);
  return {
    path: variant.path,
    frame: crop,
    bounds: {
      x: (width - displayWidth) / 2,
      y: -elevation,
      width: displayWidth,
      height,
    },
    atlasWidth: variant.width,
    atlasHeight: variant.height,
  };
}
