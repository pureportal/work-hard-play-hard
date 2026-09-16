import { Container, Graphics } from "pixi.js";
import type { Rect } from "@workhard/shared";

interface FocusedAsset {
  view: Container;
  bounds: Rect;
  startedAt: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  tint: number;
}

export class WorldAssetFocus {
  readonly overlay = new Graphics({ label: "asset-focus" });
  private target: FocusedAsset | undefined;

  start(view: Container, bounds: Rect, now: number, reducedMotion: boolean): void {
    this.clear();
    this.target = { view, bounds, startedAt: now, x: view.x, y: view.y, scaleX: view.scale.x, scaleY: view.scale.y, tint: view.tint };
    this.update(now, reducedMotion);
  }

  update(now: number, reducedMotion: boolean): void {
    const target = this.target;
    if (!target) return;
    const progress = (now - target.startedAt) / 1_500;
    if (target.view.destroyed || progress >= 1) {
      this.clear();
      return;
    }
    const pulse = reducedMotion ? 0 : Math.sin(Math.max(0, progress) * Math.PI * 2) ** 2;
    const scale = 1 + pulse * 0.08;
    const centerX = target.bounds.x + target.bounds.width / 2;
    const centerY = target.bounds.y + target.bounds.height / 2;
    target.view.scale.set(target.scaleX * scale, target.scaleY * scale);
    target.view.position.set(target.x - (centerX - target.x) * (scale - 1), target.y - (centerY - target.y) * (scale - 1));
    target.view.tint = 0xffefb3;
    const padding = 7 + pulse * 5;
    this.overlay.clear().roundRect(target.bounds.x - padding, target.bounds.y - padding,
      target.bounds.width + padding * 2, target.bounds.height + padding * 2, 10)
      .fill({ color: 0xf6c967, alpha: 0.06 + pulse * 0.07 })
      .stroke({ color: 0xf6c967, width: 3, alpha: reducedMotion ? 0.95 : 0.6 + pulse * 0.35 });
    this.overlay.alpha = reducedMotion ? 1 : Math.min(1, (1 - progress) * 5);
  }

  clear(): void {
    const target = this.target;
    if (target && !target.view.destroyed) {
      target.view.position.set(target.x, target.y);
      target.view.scale.set(target.scaleX, target.scaleY);
      target.view.tint = target.tint;
    }
    this.target = undefined;
    this.overlay.clear();
  }
}
