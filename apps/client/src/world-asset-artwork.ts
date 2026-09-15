import { requireAssetVariant } from "@workhard/shared";
import type { AssetDefinition, AssetRotation, Rect } from "@workhard/shared";
import artworkSource from "./world-asset-artwork.json";

interface AssetArtwork {
  elevation: number;
  seatHeight?: number;
  seatHasBack?: boolean;
  surfaceHeight?: number;
  animation?: { frames: number; frameDuration: number };
  variants: Record<string, { path: string; width: number; height: number; frames: readonly Rect[]; bounds: readonly Rect[] }>;
}

export interface WorldAssetArtwork {
  path: string;
  frame: Rect;
  bounds: Rect;
  atlasWidth: number;
  atlasHeight: number;
  seatOffset: number;
  seatHasBack: boolean;
  animation?: { frames: readonly Rect[]; frameDuration: number };
}

const artwork: Record<string, AssetArtwork> = artworkSource;

export function getWorldAssetSurfaceHeight(assetId: string): number {
  const height = artwork[assetId]?.surfaceHeight;
  if (height === undefined) throw new Error(`Missing surface height for ${assetId}`);
  return height;
}

export function getWorldAssetArtwork(asset: AssetDefinition, variantId: string, rotation: AssetRotation): WorldAssetArtwork {
  requireAssetVariant(asset, variantId);
  const entry = artwork[asset.id];
  const variant = entry?.variants[variantId];
  if (!entry || !variant) throw new Error(`Missing artwork for ${asset.id}/${variantId}`);
  const index = rotation / 90;
  const crop = variant.frames[index]!;
  return {
    path: variant.path, frame: crop, bounds: variant.bounds[index]!, atlasWidth: variant.width, atlasHeight: variant.height,
    seatOffset: -(entry.seatHeight ?? 0) / Math.SQRT2,
    seatHasBack: entry.seatHasBack === true,
    ...(entry.animation ? { animation: { frames: variant.frames.filter((_, frameIndex) => frameIndex % 4 === index), frameDuration: entry.animation.frameDuration } } : {}),
  };
}
