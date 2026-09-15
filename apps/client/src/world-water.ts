import { Container, Graphics } from "pixi.js";
import { getPlacedAssetBounds, requireAssetDefinition, type WorldObject } from "@workhard/shared";

export function createWaterAnimation(body: Container, object: WorldObject): ((now: number) => void) | undefined {
  const definition = requireAssetDefinition(object.assetId);
  if (definition.kind !== "pool" && definition.kind !== "fountain") return;
  const { width, height } = getPlacedAssetBounds(object);
  const fountain = definition.kind === "fountain";
  const elevation = (fountain ? 8.95 : 2.5) / Math.SQRT2;
  const surface = new Graphics({ label: "water-animation" });
  const mask = new Graphics();
  if (fountain) mask.circle(width / 2, height / 2 - elevation, width / 2 - 5).fill(0xffffff);
  else mask.rect(6, 6 - elevation, width - 12, height - 12).fill(0xffffff);
  surface.mask = mask;
  body.addChild(mask, surface);
  let previousFrame = -1;
  return (now: number) => {
    const frame = Math.floor(now / 120) % 48;
    if (frame === previousFrame) return;
    previousFrame = frame;
    const phase = frame / 48 * Math.PI * 2;
    surface.clear();
    if (fountain) {
      for (let index = 0; index < 3; index++) {
        const radius = 24 + ((frame / 48 + index / 3) % 1) * 10;
        surface.arc(width / 2, height / 2 - elevation, radius, 0.15, Math.PI - 0.15).stroke({ color: 0xe2fbf5, alpha: 0.45, width: 0.7 });
      }
    } else {
      for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) {
        const x = 13 + col * (width - 25) / 6 + Math.sin(phase + row) * 2;
        const y = 13 + row * (height - 25) / 5 - elevation;
        surface.moveTo(x, y).quadraticCurveTo(x + 3, y + Math.sin(phase + col) * 1.3, x + 7, y).stroke({ color: 0xe0fbf6, alpha: 0.32 + Math.sin(phase + col + row) * 0.1, width: 0.7 });
      }
      if (object.assetId === "outdoor-koi-pond") for (let index = 0; index < 3; index++) {
        const angle = phase + index * Math.PI * 2 / 3;
        const x = width / 2 + Math.cos(angle) * width * 0.26;
        const y = height / 2 + Math.sin(angle) * height * 0.24 - elevation;
        surface.ellipse(x, y, 4, 1.9).fill(index === 1 ? 0xffefdc : 0xdf9c80);
        surface.poly([x - 3, y, x - 6, y - 2, x - 6, y + 2]).fill(0xffead7);
        surface.ellipse(x + 0.7, y, 1.4, 1.3).fill(index === 1 ? 0xd3957d : 0xffe8ce);
      }
    }
  };
}
