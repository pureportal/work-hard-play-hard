import imageSource from "./optimized-character-images.json";

const images: Record<string, readonly string[]> = imageSource;

export function getOptimizedCharacterImagePath(source: string): string {
  const image = images[source]?.[0];
  if (!image) throw new Error(`Missing optimized character image: ${source}`);
  return `/optimized-images/${image}.webp`;
}
