import { CHARACTER_ATLAS_HEIGHT, CHARACTER_ATLAS_SIZE, getCharacterLayerPaths, type CharacterAppearance, type Rect } from "@workhard/shared";
import { ImageCache } from "./image-cache";
import { getOptimizedImagePath } from "./optimized-images";
import { decodeImage } from "./image-decoding";

interface CharacterLayer {
  source: HTMLImageElement | Uint8ClampedArray;
}

const layerBytes = CHARACTER_ATLAS_SIZE * CHARACTER_ATLAS_HEIGHT * 8;
const layers = new ImageCache<CharacterLayer>(7 * layerBytes, () => layerBytes);
const waitingLayers: Array<() => void> = [];
let loadingLayers = 0;

async function loadLayer(path: string): Promise<CharacterLayer> {
  if (loadingLayers >= 2) await new Promise<void>(resolve => waitingLayers.push(resolve));
  else loadingLayers++;
  try {
    return await new Promise<CharacterLayer>((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = async () => {
        try {
          await decodeImage(image);
          if (image.naturalWidth !== CHARACTER_ATLAS_SIZE || image.naturalHeight !== CHARACTER_ATLAS_HEIGHT * 2) {
            throw new Error("Character artwork has invalid dimensions.");
          }
          resolve({ source: image });
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error("Character could not load. Try again."));
      image.src = getOptimizedImagePath(path);
    });
  } finally {
    const next = waitingLayers.shift();
    if (next) next();
    else loadingLayers--;
  }
}

function readRegion(layer: CharacterLayer, region: Rect): Uint8ClampedArray {
  const { x, y, width, height } = region;
  const fullAtlas = x === 0 && y === 0 && width === CHARACTER_ATLAS_SIZE && height === CHARACTER_ATLAS_HEIGHT;
  if (layer.source instanceof Uint8ClampedArray) {
    if (fullAtlas) return layer.source;
    const pixels = new Uint8ClampedArray(width * height * 8);
    for (let plane = 0; plane < 2; plane++) {
      for (let row = 0; row < height; row++) {
        const sourceOffset = ((y + plane * CHARACTER_ATLAS_HEIGHT + row) * CHARACTER_ATLAS_SIZE + x) * 4;
        pixels.set(layer.source.subarray(sourceOffset, sourceOffset + width * 4), (plane * height + row) * width * 4);
      }
    }
    return pixels;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height * 2;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Character preview is unavailable in this browser.");
    context.drawImage(layer.source, x, y, width, height, 0, 0, width, height);
    context.drawImage(layer.source, x, y + CHARACTER_ATLAS_HEIGHT, width, height, 0, height, width, height);
    const pixels = context.getImageData(0, 0, width, height * 2).data;
    if (fullAtlas) layer.source = pixels;
    return pixels;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export function loadCharacterLayers(appearance: CharacterAppearance, region: Rect): Promise<Uint8ClampedArray[]> {
  return Promise.all(getCharacterLayerPaths(appearance).map(path => layers.get(path, () => loadLayer(path)).then(layer => readRegion(layer, region))));
}
