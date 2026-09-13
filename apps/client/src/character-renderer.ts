import { CHARACTER_ATLAS_SIZE, getCharacterLayerPaths, type CharacterAppearance } from "@workhard/shared";

const images = new Map<string, { request: Promise<HTMLImageElement>; bytes: number }>();
const maximumCachedBytes = 96 * 1024 * 1024;
let cachedBytes = 0;

export async function loadCharacterLayers(appearance: CharacterAppearance, artwork: "animation" | "portrait" = "animation"): Promise<HTMLImageElement[]> {
  const paths = getCharacterLayerPaths(appearance, artwork);
  return Promise.all(paths.map((path) => {
    const existing = images.get(path);
    if (existing) {
      images.delete(path);
      images.set(path, existing);
      return existing.request;
    }
    const request = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const entry = images.get(path);
        if (entry) {
          entry.bytes = image.naturalWidth * image.naturalHeight * 4;
          cachedBytes += entry.bytes;
          for (const [key, cached] of images) {
            if (cachedBytes <= maximumCachedBytes) break;
            if (!cached.bytes) continue;
            images.delete(key);
            cachedBytes -= cached.bytes;
          }
        }
        resolve(image);
      };
      image.onerror = () => {
        images.delete(path);
        reject(new Error("Character could not load. Try again."));
      };
      image.src = path;
    });
    images.set(path, { request, bytes: 0 });
    return request;
  }));
}

export async function renderCharacter(appearance: CharacterAppearance): Promise<HTMLCanvasElement> {
  const layers = await loadCharacterLayers(appearance);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = CHARACTER_ATLAS_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Character preview is unavailable in this browser.");
  context.imageSmoothingEnabled = true;
  layers.forEach((layer) => context.drawImage(layer, 0, 0));
  return canvas;
}
