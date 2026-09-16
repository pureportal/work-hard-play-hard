import type { AssetRotation } from "@workhard/shared";
import imageSource from "./optimized-images.json";

const images: Record<string, readonly string[]> = imageSource;

export function getOptimizedImagePath(source: string): string {
  const image = images[source]?.[0];
  if (!image) throw new Error(`Missing optimized image: ${source}`);
  return `/optimized-images/${image}.webp`;
}

export function getAssetPreviewPath(source: string, rotation: AssetRotation): string {
  const image = images[source]?.[rotation / 90 + 1];
  if (!image) throw new Error(`Missing asset preview: ${source}/${rotation}`);
  return `/optimized-images/${image}.webp`;
}
