import { Container, Graphics, Text } from "pixi.js";
import { SPECIAL_PROPS, SPECIAL_PROP_COOLDOWN_MS, SPECIAL_PROP_EFFECT_MS, getPlacedAssetBounds, type WorldObject } from "@workhard/shared";
import type { DisplaySpecialPropUse } from "./special-props";

export interface SpecialPropView {
  container: Container;
  animate: (now: number) => void;
}

export function createSpecialPropEffect(object: WorldObject, use: DisplaySpecialPropUse): SpecialPropView {
  const effect = SPECIAL_PROPS[object.assetId]!.effect;
  const bounds = getPlacedAssetBounds(object);
  const container = new Container({ label: `special-effect:${object.id}` });
  container.position.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - 30);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const duration = use.result ? SPECIAL_PROP_COOLDOWN_MS : SPECIAL_PROP_EFFECT_MS;
  const colors = ["#eeb65f", "#e99db5", "#9cd6bf", "#9dbddd", "#f4e8ce"];
  const particles = Array.from({ length: effect === "fortune" ? 8 : 24 }, (_, index) => {
    const graphic = new Graphics();
    const color = colors[index % colors.length]!;
    if (effect === "bubbles") {
      const radius = 3 + index % 4;
      graphic.circle(0, 0, radius).fill({ color, alpha: 0.15 }).stroke({ color, width: 1.2 });
      graphic.circle(-radius * 0.3, -radius * 0.3, 1).fill("#ffffff");
    } else if (effect === "wheel") graphic.circle(0, 0, 2).fill(color);
    else graphic.rect(-1.5, -2, 3, 4).fill(color);
    container.addChild(graphic);
    return graphic;
  });
  let result: Container | undefined;
  if (use.result) {
    result = new Container({ label: "special-result" });
    const text = new Text({ text: use.result, style: { fontFamily: "Inter, Segoe UI, sans-serif", fontSize: 13, fill: "#403746", wordWrap: true, wordWrapWidth: 230, align: "center" } });
    text.anchor.set(0.5);
    result.addChild(new Graphics().roundRect(-text.width / 2 - 9, -text.height / 2 - 7, text.width + 18, text.height + 14, 7).fill("#fff4df"), text);
    result.y = -65;
    container.addChild(result);
  }
  return { container, animate: now => {
    const elapsed = Math.max(0, now - use.startedAt), t = elapsed / 1000;
    container.visible = elapsed < duration;
    container.alpha = Math.min(1, Math.max(0, (duration - elapsed) / 400));
    if (result) result.visible = reducedMotion.matches || elapsed >= 850;
    for (const [index, particle] of particles.entries()) {
      const angle = index * Math.PI * 2 / particles.length;
      particle.visible = elapsed < SPECIAL_PROP_EFFECT_MS;
      if (reducedMotion.matches) { particle.position.set(Math.cos(angle) * 18, Math.sin(angle) * 12); continue; }
      if (effect === "bubbles") {
        const age = Math.max(0, t - index * 0.035);
        particle.visible = age > 0;
        particle.position.set(Math.sin(index * 2.4 + age) * (8 + age * 18), -age * (20 + index % 5 * 7));
      } else if (effect === "wheel") {
        const turn = angle + Math.min(t, 0.85) * 15;
        particle.position.set(Math.cos(turn) * 21, Math.sin(turn) * 21);
        particle.visible = elapsed < 900;
      } else {
        particle.position.set(Math.cos(angle) * t * (20 + index % 4 * 9), -t * (45 + index % 6 * 12) + 35 * t * t);
        particle.rotation = t * (index % 2 ? 5 : -4);
      }
    }
  } };
}
