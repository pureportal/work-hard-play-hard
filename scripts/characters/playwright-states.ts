import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import { CHARACTER_CANVAS_SIZE, CHARACTER_SEAT_ANCHOR, CHARACTER_DIRECTIONS, DEFAULT_CHARACTER_APPEARANCE, getDefaultAssetVariantId, getPlacedAssetInteractions, requireAssetDefinition } from "../../packages/shared/src/index.js";
import { installAssetFixture } from "../world-assets/playwright-fixture.js";
import { installWorldProbe, worldReady } from "./playwright-animation.js";
import { sharp } from "./raster.mjs";

const output = process.env.CHARACTER_SEAT_SCREENSHOTS ?? fileURLToPath(new URL("../../artifacts/characters/state-review/after/states/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors: string[] = [];
const inspected: unknown[] = [];
const tiles: { input: Buffer; left: number; top: number }[] = [];

async function pointOnScreen(page: Page, point: { x: number; y: number }) {
  return page.evaluate((position) => {
    const layer = globalThis.findAvatar("You")!.parent!.parent!.parent!;
    const point = layer.toGlobal(position);
    const canvas = document.querySelector(".world-canvas canvas")!.getBoundingClientRect();
    return { x: canvas.x + point.x, y: canvas.y + point.y };
  }, point);
}

try {
  const assetIds = process.argv.slice(2);
  assert(assetIds.length, "Pass seating asset IDs to inspect");
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    for (const assetId of assetIds) for (const rotation of [0, 90, 180, 270] as const) {
      const context = await browser.newContext({ viewport });
      const fixture = await installAssetFixture(context, "user-maya", { x: 720, y: 650 });
      const definition = requireAssetDefinition(assetId);
      const object = { id: "character-review-seat", floorId: "floor-studio", assetId, variantId: getDefaultAssetVariantId(definition), x: 688, y: 528, rotation };
      const layout = fixture.store.getLayout("floor-studio")!;
      layout.objects = [object];
      layout.revision++;
      fixture.store.updateMemberCharacter("user-maya", { ...DEFAULT_CHARACTER_APPEARANCE });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      page.on("pageerror", (error) => errors.push(`${assetId}/${rotation}/${viewport.width}: ${error.stack ?? error.message}`));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      await installWorldProbe(page);
      try {
        await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
        await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
        await worldReady(page);
        const closePeople = page.getByRole("button", { name: "Close people", exact: true });
        if (await closePeople.isVisible()) await closePeople.click();
        for (let zoom = 0; zoom < 5; zoom++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
        const interaction = getPlacedAssetInteractions(object)[0]!;
        await page.waitForFunction(() => {
          const avatar = globalThis.findAvatar("You")!.parent!.parent!;
          return Math.abs(avatar.x - 720) < 1 && Math.abs(avatar.y - 650) < 1;
        });
        const point = await pointOnScreen(page, interaction.center);
        await page.mouse.click(point.x, point.y);
        await page.getByRole("button", { name: "Sit", exact: true }).first().click();
        await page.waitForFunction(({ row, column }) => {
          const sprite = globalThis.findAvatar("You")!;
          return sprite.texture?.frame.y === row && sprite.texture.frame.x >= column;
        }, { row: CHARACTER_DIRECTIONS.indexOf(interaction.direction) * CHARACTER_CANVAS_SIZE, column: CHARACTER_CANVAS_SIZE * 4 });
        await page.waitForFunction(({ x, y }) => {
          const player = globalThis.findAvatar("You")!.parent!.parent!;
          return Math.hypot(player.x - x, player.y - y) < 0.1;
        }, interaction.center);
        assert.equal(fixture.getPlayer("user-maya")?.seat?.objectId, object.id);
        const samples = await page.evaluate(async () => {
          const samples = [];
          const start = performance.now();
          while (performance.now() - start < 1800) {
            const sprite = globalThis.findAvatar("You")!;
            const player = sprite.parent!.parent!;
            samples.push({ x: player.x, y: player.y, anchor: { x: sprite.anchor!.x, y: sprite.anchor!.y }, frame: sprite.texture!.frame.x });
            await new Promise(requestAnimationFrame);
          }
          return samples;
        });
        assert(samples.every((sample) => sample.anchor?.y === CHARACTER_SEAT_ANCHOR.y / CHARACTER_CANVAS_SIZE));
        assert(new Set(samples.map((sample) => sample.frame)).size >= 4);
        assert(Math.max(...samples.map((sample) => Math.hypot(sample.x - interaction.center.x, sample.y - interaction.center.y))) < 0.1);
        const name = `${assetId}-${rotation}-${viewport.width}`;
        await page.screenshot({ path: `${output}/${name}.png` });
        const center = await pointOnScreen(page, interaction.center);
        const crop = { x: Math.max(0, Math.round(center.x) - 100), y: Math.max(0, Math.round(center.y) - 130), width: 200, height: 240 };
        const shot = await page.screenshot({ clip: crop });
        await writeFile(`${output}/${name}-detail.png`, shot);
        const tile = await sharp(shot).resize(300, 360).png().toBuffer();
        const label = Buffer.from(`<svg width="300" height="30"><text x="150" y="21" text-anchor="middle" font-family="Arial" font-size="12">${name}</text></svg>`);
        const index = inspected.length;
        tiles.push({ input: tile, left: index % 4 * 300, top: Math.floor(index / 4) * 390 });
        tiles.push({ input: label, left: index % 4 * 300, top: Math.floor(index / 4) * 390 + 360 });
        await page.mouse.click(center.x, center.y);
        await page.getByRole("button", { name: "Stand", exact: true }).click();
        await page.waitForFunction(() => globalThis.findAvatar("You")!.anchor!.y > 0.9);
        assert.equal(fixture.getPlayer("user-maya")?.seat, undefined);
        inspected.push({ assetId, rotation, viewport, facing: interaction.direction, seatedFrames: new Set(samples.map((sample) => sample.frame)).size, entryAndExit: true });
        console.log(name);
      } finally {
        await context.close();
        fixture.stop();
      }
    }
  }
  assert.deepEqual(errors, []);
} finally {
  if (tiles.length) await sharp({ create: { width: 1200, height: Math.ceil(tiles.length / 8) * 390, channels: 4, background: "#ede9e3" } }).composite(tiles).png().toFile(`${output}/seating-contact-sheet.png`);
  await writeFile(`${output}/results.json`, JSON.stringify({ inspected, errors }, null, 2));
  await browser.close();
}
