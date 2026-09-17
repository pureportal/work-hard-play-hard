import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application, Sprite } from "../../../apps/client/node_modules/pixi.js";
import { CHARACTER_CANVAS_SIZE, CHARACTER_DIRECTIONS, getCharacterLayerPaths, type CharacterAppearance } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../../world-assets/playwright-fixture.js";
import { installWorldProbe } from "../playwright-animation.js";

const sharp = createRequire(new URL("../../../apps/server/package.json", import.meta.url))("sharp") as typeof import("../../../apps/server/node_modules/sharp");
const root = "C:/Development/work-hard-play-hard/artifacts/asset-quality-2026-09-15";
const output = `${root}/after/live-characters`;
const samples = JSON.parse(await readFile(`${root}/before/characters/coverage.json`, "utf8")).samples as { id: string; appearance: CharacterAppearance; layers: string[] }[];
const manifest = JSON.parse(await readFile(new URL("manifest.json", import.meta.url), "utf8"));
assert.deepEqual([...new Set(samples.flatMap(sample => getCharacterLayerPaths(sample.appearance)))].map(path => path.replace("/characters/seated/chair/", "/characters/blockbench/")).sort(), manifest.layers.map((layer: { path: string }) => layer.path.replace("apps/client/public", "")).sort());
await mkdir(`${output}/crops`, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const fixture = await installAssetFixture(context, "user-maya", { x: 704, y: 576 }, { currentPlayerOnly: true });
const layout = fixture.store.getLayout("floor-studio")!;
Object.assign(layout, { objects: [], tiles: [], walls: [], openings: [], rooms: [], revision: layout.revision + 1 });
const page = await context.newPage();
await installWorldProbe(page);
const errors: string[] = [];
const views: { id: string; direction: string; evidence: string; layers: string[] }[] = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const closePeople = page.getByRole("button", { name: "Close people", exact: true });
  if (await closePeople.isVisible()) await closePeople.click();
  for (const [index, sample] of samples.entries()) {
    fixture.store.updateMemberCharacter("user-maya", sample.appearance);
    fixture.publish({ type: "presence.changed", member: fixture.store.getMember("user-maya")! });
    await page.waitForFunction(async appearance => {
      const { renderCharacter } = await import("/src/character-renderer.ts" as string);
      const sprite = globalThis.findAvatar("You") as unknown as Sprite | undefined;
      return sprite?.texture.source.resource === await renderCharacter(appearance);
    }, sample.appearance);
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    for (const [directionIndex, direction] of CHARACTER_DIRECTIONS.entries()) {
      const key = { down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp" }[direction];
      await page.keyboard.down(key);
      try {
        await page.waitForFunction(row => globalThis.findAvatar("You")?.texture?.frame.y === row, (4 + directionIndex) * CHARACTER_CANVAS_SIZE);
      } finally {
        await page.keyboard.up(key);
      }
      await page.waitForFunction(row => globalThis.findAvatar("You")?.texture?.frame.y === row, directionIndex * CHARACTER_CANVAS_SIZE);
      const clip = await page.evaluate(frameSize => {
        const app = globalThis.avatarWorld as unknown as Application;
        const sprite = globalThis.findAvatar("You") as unknown as Sprite;
        const canvas = app.canvas.getBoundingClientRect();
        const start = sprite.toGlobal({ x: -sprite.anchor.x * frameSize, y: -sprite.anchor.y * frameSize });
        const end = sprite.toGlobal({ x: (1 - sprite.anchor.x) * frameSize, y: (1 - sprite.anchor.y) * frameSize });
        const scale = canvas.width / app.screen.width;
        return { x: Math.floor(canvas.x + start.x * scale - 6), y: Math.floor(canvas.y + start.y * scale - 6), width: Math.ceil((end.x - start.x) * scale + 12), height: Math.ceil((end.y - start.y) * scale + 12) };
      }, CHARACTER_CANVAS_SIZE);
      assert.equal(clip.width, 75);
      const evidence = `${output}/crops/${sample.id}-${direction}.png`;
      await page.screenshot({ path: evidence, clip });
      views.push({ id: sample.id, direction, evidence, layers: sample.layers });
    }
    if (index % 10 === 9) console.log(`Verified ${index + 1}/${samples.length} in-game character compositions`);
  }
  for (let start = 0; start < samples.length; start += 20) {
    const group = samples.slice(start, start + 20);
    const labels = ['<text x="12" y="20">Running game | 62.4px characters | down / left / right / up</text>'];
    const composites: { input: Buffer; left: number; top: number }[] = [];
    for (const [row, sample] of group.entries()) {
      labels.push(`<text x="12" y="${55 + row * 82}">${sample.id}</text>`);
      for (const [column, direction] of CHARACTER_DIRECTIONS.entries()) composites.push({ input: await readFile(`${output}/crops/${sample.id}-${direction}.png`), left: 235 + column * 90, top: 32 + row * 82 });
    }
    const height = 32 + group.length * 82;
    composites.push({ input: Buffer.from(`<svg width="610" height="${height}" xmlns="http://www.w3.org/2000/svg"><g font-family="Arial" font-size="12" fill="#514552">${labels.join("")}</g></svg>`), left: 0, top: 0 });
    await sharp({ create: { width: 610, height, channels: 4, background: "#eae5df" } }).composite(composites).png().toFile(`${output}/characters-${String(start / 20 + 1).padStart(2, "0")}.png`);
  }
  assert.equal(views.length, 560);
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/coverage.json`, JSON.stringify({ views, errors }, null, 2));
  fixture.stop();
  await browser.close();
}
