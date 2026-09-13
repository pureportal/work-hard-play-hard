import { blank, overlay, pixel, put, resize } from "./raster.mjs";
import { CHARACTER_PORTRAIT_SCALE as sourceScale, CHARACTER_PORTRAIT_SIZE as sourceSize } from "../../packages/shared/src/character.ts";

export function keyGreen(input) {
  const output = blank(input.width, input.height);
  const background = new Uint8Array(input.width * input.height);
  for (let index = 0; index < background.length; index++) {
    const offset = index * 4;
    if (input.data[offset + 1] > 200 && input.data[offset] < 100 && input.data[offset + 2] < 100) background[index] = 1;
  }
  for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) {
    if (background[y * input.width + x]) continue;
    const [r, g, b, a] = pixel(input, x, y);
    const spill = Math.max(0, g - Math.max(r, b));
    let edge = false;
    if (spill) for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2; dx++) {
      const sx = x + dx;
      const sy = y + dy;
      if (sx >= 0 && sy >= 0 && sx < input.width && sy < input.height && background[sy * input.width + sx]) { edge = true; break; }
    }
    if (!edge) {
      put(output, x, y, [r, g, b, a]);
      continue;
    }
    const opacity = 1 - spill / 255;
    if (opacity < 0.05) continue;
    put(output, x, y, [Math.round(r / opacity), Math.round((g - spill) / opacity), Math.round(b / opacity), Math.round(a * opacity)]);
  }
  return output;
}

export async function placeEquipment(input, anchor, position, scaleX, scaleY = scaleX) {
  const resized = await resize(input, Math.round(input.width * scaleX * sourceScale), Math.round(input.height * scaleY * sourceScale));
  return overlay(blank(sourceSize, sourceSize), resized,
    Math.round((position[0] - anchor[0] * scaleX) * sourceScale),
    Math.round((position[1] - anchor[1] * scaleY) * sourceScale));
}
