import { CHARACTER_ATLAS_HEIGHT, CHARACTER_ATLAS_SIZE, characterAppearanceKey, composeCharacterLayers, getCharacterLayerPaths, type CharacterAppearance } from "@workhard/shared";

const layers = new Map<string, Promise<Uint8ClampedArray>>();
const characters = new Map<string, Promise<HTMLCanvasElement>>();
const maximumLayers = 7;
const maximumCharacters = 8;

export async function loadCharacterLayers(appearance: CharacterAppearance): Promise<Uint8ClampedArray[]> {
  return Promise.all(getCharacterLayerPaths(appearance).map(path => {
    let request = layers.get(path);
    if (request) layers.delete(path);
    else {
      request = new Promise<Uint8ClampedArray>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          try {
            if (image.naturalWidth !== CHARACTER_ATLAS_SIZE || image.naturalHeight !== CHARACTER_ATLAS_HEIGHT * 2) throw new Error("Character artwork has invalid dimensions.");
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) throw new Error("Character preview is unavailable in this browser.");
            context.drawImage(image, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            canvas.width = canvas.height = 0;
            resolve(pixels);
          } catch (error) { reject(error); }
        };
        image.onerror = () => reject(new Error("Character could not load. Try again."));
        image.src = path;
      }).catch(error => { layers.delete(path); throw error; });
    }
    layers.set(path, request);
    while (layers.size > maximumLayers) layers.delete(layers.keys().next().value!);
    return request;
  }));
}

export async function renderCharacter(appearance: CharacterAppearance): Promise<HTMLCanvasElement> {
  const key = characterAppearanceKey(appearance);
  let request = characters.get(key);
  if (request) characters.delete(key);
  else request = loadCharacterLayers(appearance).then(images => {
    const canvas = document.createElement("canvas");
    canvas.width = CHARACTER_ATLAS_SIZE;
    canvas.height = CHARACTER_ATLAS_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Character preview is unavailable in this browser.");
    const pixels = context.createImageData(canvas.width, canvas.height);
    pixels.data.set(composeCharacterLayers(images));
    context.putImageData(pixels, 0, 0);
    return canvas;
  }).catch(error => { characters.delete(key); throw error; });
  characters.set(key, request);
  while (characters.size > maximumCharacters) characters.delete(characters.keys().next().value!);
  return request;
}
