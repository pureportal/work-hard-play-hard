import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { CHARACTER_ATLAS_SIZE, CHARACTER_CANVAS_SIZE, CHARACTER_WORLD_SIZE } from "../../packages/shared/src/character.js";

interface DisplayNode {
  label?: string;
  visible: boolean;
  children?: DisplayNode[];
  parent?: DisplayNode;
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: { x: number; y: number };
  toGlobal: (point: { x: number; y: number }) => { x: number; y: number };
  getBounds: () => { x: number; y: number; width: number; height: number };
  texture?: { frame: { x: number; y: number }; source?: { width: number; scaleMode: string } };
}

declare global {
  var avatarWorld: { stage: DisplayNode } | undefined;
  var findAvatar: (name: string) => DisplayNode | undefined;
}

export async function installWorldProbe(page: Page) {
  await page.addInitScript((atlasSize) => {
    (globalThis as typeof globalThis & { __PIXI_APP_INIT__: (app: { stage: DisplayNode }) => void }).__PIXI_APP_INIT__ = (app) => { globalThis.avatarWorld = app; };
    globalThis.findAvatar = (name) => {
      const queue = globalThis.avatarWorld ? [globalThis.avatarWorld.stage] : [];
      for (const node of queue) {
        if (node.children?.some((child) => child.text === name)) {
          const sprite = node.children.flatMap((child) => child.children ?? []).find((child) => child.texture?.source?.width === atlasSize);
          if (sprite) return sprite;
        }
        queue.push(...node.children ?? []);
      }
      return undefined;
    };
  }, CHARACTER_ATLAS_SIZE);
}

export async function worldReady(page: Page) {
  for (const name of ["You", "Elena", "Theo"]) {
    await page.waitForFunction((label) => Boolean(globalThis.findAvatar(label)), name);
    const size = await page.evaluate((label) => {
      const sprite = globalThis.findAvatar(label)!;
      return { width: sprite.width, height: sprite.height, scaleMode: sprite.texture?.source?.scaleMode };
    }, name);
    assert(Math.abs(size.width - CHARACTER_WORLD_SIZE) < 0.01);
    assert(Math.abs(size.height - CHARACTER_WORLD_SIZE) < 0.01);
    assert.equal(size.scaleMode, "linear");
  }
}

export async function verifyWorldMovement(page: Page) {
  const results = [];
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  for (const [key, direction] of [["ArrowRight", 2], ["ArrowLeft", 1], ["ArrowDown", 0], ["ArrowUp", 3]] as const) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction((row) => globalThis.findAvatar("You")?.texture?.frame.y === row, (4 + direction) * CHARACTER_CANVAS_SIZE);
      const positions = await page.evaluate(async () => {
        const samples: { frame: number; x: number; y: number; time: number }[] = [];
        const started = performance.now();
        while (performance.now() - started < 650) {
          const sprite = globalThis.findAvatar("You")!;
          const player = sprite.parent!.parent!;
          samples.push({ frame: sprite.texture!.frame.x, x: player.x, y: player.y, time: performance.now() });
          await new Promise(requestAnimationFrame);
        }
        return samples;
      });
      assert(new Set(positions.map((sample) => sample.frame)).size >= 3);
      const first = positions[0]!;
      const last = positions.at(-1)!;
      const distance = Math.hypot(last.x - first.x, last.y - first.y);
      assert(distance > 10, `${key} should move the player`);
      results.push({ key, distance: Math.round(distance), durationMs: Math.round(last.time - first.time) });
    } finally {
      await page.keyboard.up(key);
    }
    await page.waitForFunction((row) => globalThis.findAvatar("You")?.texture?.frame.y === row, direction * CHARACTER_CANVAS_SIZE);
  }
  return results;
}
