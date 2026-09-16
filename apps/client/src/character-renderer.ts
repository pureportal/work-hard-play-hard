import { CHARACTER_ATLAS_HEIGHT, CHARACTER_ATLAS_SIZE, characterAppearanceKey, composeCharacterLayers, type CharacterAppearance, type Rect } from "@workhard/shared";
import { loadCharacterLayers } from "./character-layers";
import { ImageCache } from "./image-cache";

const characters = new ImageCache<HTMLCanvasElement>(8 * CHARACTER_ATLAS_SIZE * CHARACTER_ATLAS_HEIGHT * 4, canvas => canvas.width * canvas.height * 4);
const atlasRegion: Rect = { x: 0, y: 0, width: CHARACTER_ATLAS_SIZE, height: CHARACTER_ATLAS_HEIGHT };

export function renderCharacter(appearance: CharacterAppearance, region: Rect = atlasRegion): Promise<HTMLCanvasElement> {
  const { x, y, width, height } = region;
  const key = `${characterAppearanceKey(appearance)}:${x}:${y}:${width}:${height}`;
  return characters.get(key, async () => {
    const images = await loadCharacterLayers(appearance, region);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Character preview is unavailable in this browser.");
    const pixels = context.createImageData(width, height);
    pixels.data.set(composeCharacterLayers(images, width, height));
    context.putImageData(pixels, 0, 0);
    return canvas;
  });
}
