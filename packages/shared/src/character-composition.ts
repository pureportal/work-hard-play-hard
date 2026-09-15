import { CHARACTER_ATLAS_HEIGHT, CHARACTER_ATLAS_SIZE } from "./character.js";

export function composeCharacterLayers(layers: readonly Uint8ClampedArray[]): Uint8ClampedArray {
  const pixelCount = CHARACTER_ATLAS_SIZE * CHARACTER_ATLAS_HEIGHT;
  const colorBytes = pixelCount * 4;
  const result = new Uint8ClampedArray(colorBytes);
  const nearest = new Uint16Array(pixelCount).fill(65535);
  for (const layer of layers) {
    if (layer.length !== colorBytes * 2) throw new Error("Invalid character layer dimensions");
    for (let pixel = 0, offset = 0; pixel < pixelCount; pixel++, offset += 4) {
      if (layer[offset + 3] === 0) continue;
      const depth = layer[offset + colorBytes]! * 256 + layer[offset + colorBytes + 1]!;
      if (depth > nearest[pixel]!) continue;
      nearest[pixel] = depth;
      result[offset] = layer[offset]!;
      result[offset + 1] = layer[offset + 1]!;
      result[offset + 2] = layer[offset + 2]!;
      result[offset + 3] = 255;
    }
  }
  return result;
}
