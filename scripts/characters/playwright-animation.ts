import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { CHARACTER_ANIMATIONS, CHARACTER_ATLAS_SIZE, CHARACTER_CANVAS_SIZE, CHARACTER_WORLD_SIZE } from "../../packages/shared/src/character.js";
import { sharp } from "./raster.mjs";

interface DisplayNode {
  label?: string;
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
    if (process.argv.includes("--baseline")) continue;
    assert.equal(size.scaleMode, "linear");
  }
}

export async function verifyPlayback(page: Page, output: string) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const directions = [];
  for (const motion of ["idle", "walk", "sit"] as const) for (const direction of ["Front", "Left", "Right", "Back"]) {
    await page.getByRole("button", { name: { idle: "Idle", walk: "Walk", sit: "Sit" }[motion], exact: true }).click();
    await page.getByRole("button", { name: direction, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".character-editor-actions .primary-button")?.disabled);
    const samples = await page.locator(".character-stage canvas").evaluate(async (element) => {
      const canvas = element as HTMLCanvasElement;
      const times: number[] = [];
      const frames = new Set<string>();
      const images: string[] = [];
      let previous = "";
      const started = performance.now();
      while (performance.now() - started < 1800) {
        const image = canvas.toDataURL();
        if (image !== previous) { times.push(performance.now()); frames.add(image); images.push(image); previous = image; }
        await new Promise(requestAnimationFrame);
      }
      return { times, frames: frames.size, images, width: canvas.width, height: canvas.height };
    });
    assert(samples.frames >= (motion === "walk" ? 6 : 3), `${direction} ${motion} frames must change`);
    const durations = samples.times.slice(2).map((time, index) => time - samples.times[index + 1]!);
    const median = durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]!;
    assert(Math.abs(median - CHARACTER_ANIMATIONS[motion].frameDuration) < 45, `${motion} ${direction} cadence: ${median}`);
    const raw = await Promise.all(samples.images.map((image) => sharp(Buffer.from(image.split(",")[1]!, "base64")).ensureAlpha().raw().toBuffer()));
    await sharp(Buffer.concat(raw), { raw: { width: samples.width, height: raw.length * samples.height, channels: 4, pageHeight: samples.height } })
      .webp({ loop: 0, delay: samples.times.map((time, index) => Math.max(20, Math.round((samples.times[index + 1] ?? time + median) - time))) })
      .toFile(`${output}/${motion}-${direction.toLowerCase()}.webp`);
    const unique = [...new Set(samples.images)];
    const tiles = await Promise.all(unique.map(async (image, index) => ({ input: await sharp(Buffer.from(image.split(",")[1]!, "base64")).resize(180, 180, { fit: "contain", background: "#00000000" }).png().toBuffer(), left: index * 180, top: 0 })));
    await sharp({ create: { width: tiles.length * 180, height: 180, channels: 4, background: "#ede9e3" } }).composite(tiles).png().toFile(`${output}/${motion}-${direction.toLowerCase()}-frames.png`);
    directions.push({ motion, direction, frames: samples.frames, medianFrameMs: Math.round(median) });
  }
  await page.getByRole("button", { name: "Idle", exact: true }).click();
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  return directions;
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
