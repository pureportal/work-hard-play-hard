import { blank, blend, mask, overlay, put, sample, transform } from "./raster.mjs";
import { interpolate } from "./wardrobe.mjs";
import { getCharacterIdleTransform } from "../../packages/shared/src/character.ts";
import { sitLayer } from "./seated-rig.mjs";

export function animateLayer(input, kind, direction, frame, motion) {
  if (motion === "sit") return sitLayer(input, kind, direction, frame);
  if (motion === "idle") {
    const { scaleY, translateY } = getCharacterIdleTransform(frame);
    return transform(input, 1, 0, 0, scaleY, 0, translateY);
  }
  const side = direction === "left";
  const phase = frame / 8 * Math.PI * 2;
  const bodyBob = [0, -0.65, 0, 0.65, 0, -0.65, 0, 0.65][frame];
  if (kind === "head" || kind === "hair") return transform(input, 1, 0, 0, 1, 0, bodyBob);
  const output = blank();
  if (kind === "upper") {
    for (let y = 35; y < 117; y++) for (let x = 47; x < 133; x++) {
      const arm = Math.max(0, Math.min(1, side ? (x - 89) / 7 : (Math.abs(x - 90) - 10) / 8));
      const progress = Math.max(0, Math.min(1, (y - 45) / 60));
      const swing = Math.sin(phase) * progress * arm;
      const swingX = side ? -swing * 8 : swing * Math.sign(x - 90) * 0.8;
      const swingY = side ? 0 : swing * Math.sign(x - 90) * 3;
      put(output, x, y, sample(input, x - swingX, y - bodyBob - swingY));
    }
    return output;
  }
  for (const leg of side ? [1, 0] : [0, 1]) {
    const legPhase = phase + leg * Math.PI;
    const stride = Math.sin(legPhase);
    const lift = Math.max(0, Math.cos(legPhase));
    const targets = [92 + bodyBob, 128 - lift * 3, 160 - lift * 6, 172 - lift * 6];
    const start = side ? 36 : leg === 0 ? 60 : 90;
    const end = side ? 144 : leg === 0 ? 90 : 120;
    for (let y = 91; y < 175; y++) {
      const sourceY = interpolate(y, targets, [92, 128, 160, 172]);
      if (sourceY < 92) continue;
      const progress = Math.max(0, Math.min(1, (sourceY - 92) / 68));
      const shift = stride * progress * (side ? 22 : 0.85);
      for (let x = start; x < end; x++) {
        const color = sample(input, x - shift, sourceY);
        if (!color[3]) continue;
        if (side && leg === 1) for (let channel = 0; channel < 3; channel++) color[channel] = Math.round(color[channel] * 0.86);
        blend(output, x, y, color);
      }
    }
  }
  if (kind === "lower") overlay(output, transform(mask(input, (_x, y) => y < 97), 1, 0, 0, 1, 0, bodyBob));
  return output;
}
