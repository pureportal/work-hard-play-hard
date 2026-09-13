import { blank, mask, overlay, put, sample, transform } from "./raster.mjs";
import { interpolate } from "./wardrobe.mjs";
import { CHARACTER_SEAT_ANCHOR, CHARACTER_SEATED_FOOT_Y, getCharacterIdleTransform } from "../../packages/shared/src/character.ts";

export function sitLayer(input, kind, direction, frame) {
  if (kind === "head" || kind === "hair" || kind === "upper") {
    const { scaleY, translateY } = getCharacterIdleTransform(frame, CHARACTER_SEAT_ANCHOR.y);
    return transform(input, 1, 0, 0, scaleY, 0, translateY);
  }
  const output = blank();
  if (direction === "left") {
    const shin = mask(input, (_x, y) => y >= 125);
    overlay(output, transform(shin, 1, 0, 0, 1, -26, -20));
    if (kind === "lower") {
      const thigh = mask(input, (_x, y) => y >= 92 && y < 131);
      const a = 12 / 32;
      const b = 26 / 32;
      overlay(output, transform(thigh, a, b, -b, a, 90 - a * 90 + b * 96, 96 - b * 90 - a * 96));
      overlay(output, mask(input, (_x, y) => y < 99));
    }
    return output;
  }
  const joints = direction === "up" ? [95, 106, 139, 151] : [95, 112, 144, CHARACTER_SEATED_FOOT_Y];
  for (let y = 72; y < 160; y++) {
    const sourceY = y < 95 ? y : interpolate(y, joints, [95, 128, 160, 172]);
    const spread = Math.min(1, Math.max(0, (y - 95) / 17)) * 2;
    for (let x = 60; x < 120; x++) {
      const sourceX = x - Math.sign(x - 90) * spread;
      put(output, x, y, sample(input, sourceX, sourceY));
    }
  }
  return output;
}
