import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application } from "../../../apps/client/node_modules/pixi.js";
import { ASSET_CATALOG, ASSET_ROTATIONS, getAssetVariants, getPlacedAssetBounds, type WorldObject } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../playwright-fixture.js";
import { installWorldProbe } from "../../characters/playwright-animation.js";

const output = "C:/Development/work-hard-play-hard/artifacts/asset-quality-2026-09-15/after/live-floors";
const sharp = createRequire(new URL("../../../apps/server/package.json", import.meta.url))("sharp") as typeof import("../../../apps/server/node_modules/sharp");
await mkdir(`${output}/scenes`, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const fixture = await installAssetFixture(context, "user-maya", { x: 704, y: 800 }, { currentPlayerOnly: true });
const layout = fixture.store.getLayout("floor-studio")!;
Object.assign(layout, { objects: [], tiles: [], walls: [], openings: [], rooms: [], revision: layout.revision + 1 });
const page = await context.newPage();
await installWorldProbe(page);
const errors: string[] = [];
const coverage: { id: string; rotation: number; columns: number; rows: number; evidence: string }[] = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const closePeople = page.getByRole("button", { name: "Close people", exact: true });
  if (await closePeople.isVisible()) await closePeople.click();
  await page.waitForTimeout(800);
  for (const asset of ASSET_CATALOG.assets.filter(asset => asset.placement.layer === "ground")) for (const variant of getAssetVariants(asset)) {
    const composites: { input: Buffer; left: number; top: number }[] = [];
    const labels = [`<text x="12" y="20">${asset.name} / ${variant.name} | running game | individual + repeated field | zoom 0.78</text>`];
    for (const [index, rotation] of ASSET_ROTATIONS.entries()) {
      const single: WorldObject = { id: "single", assetId: asset.id, variantId: variant.id, rotation, floorId: layout.floorId, x: 320, y: 448 };
      const bounds = getPlacedAssetBounds(single);
      const columns = Math.floor(384 / bounds.width);
      const rows = Math.floor(320 / bounds.height);
      layout.objects = [single, ...Array.from({ length: columns * rows }, (_, index) => ({ ...single, id: `repeat-${index}`, x: 544 + index % columns * bounds.width, y: 384 + Math.floor(index / columns) * bounds.height }))];
      layout.revision++;
      fixture.publish({ type: "layout.updated", layout });
      await page.waitForFunction(async ({ ids, assetId, variantId, rotation }) => {
        const artwork = (await import("/src/world-asset-artwork.json?import" as string)).default;
        const frame = artwork[assetId].variants[variantId].frames[rotation / 90];
        const app = globalThis.avatarWorld as unknown as Application;
        return ids.every(id => {
          const sprite = app?.stage.getChildByLabel(`world-asset:${id}`, true)?.getChildByLabel("artwork")?.children.at(-1) as import("../../../apps/client/node_modules/pixi.js").Sprite | undefined;
          return sprite?.visible && sprite.texture.frame.x === frame.x && sprite.texture.frame.y === frame.y;
        });
      }, { ids: layout.objects.map(object => object.id), assetId: asset.id, variantId: variant.id, rotation });
      const clip = await page.evaluate(() => {
        const app = globalThis.avatarWorld as unknown as Application;
        app.render();
        const canvas = app.canvas.getBoundingClientRect();
        const point = app.stage.children[0]!.toGlobal({ x: 288, y: 352 });
        const scale = canvas.width / app.screen.width;
        return { x: Math.floor(canvas.x + point.x * scale), y: Math.floor(canvas.y + point.y * scale), width: 530, height: 300 };
      });
      const scene = `${output}/scenes/${asset.id}-${variant.id}-${rotation}.png`;
      await page.screenshot({ path: scene });
      const evidence = `${output}/${asset.id}-${variant.id}-${rotation}.png`;
      await page.screenshot({ path: evidence, clip });
      composites.push({ input: await readFile(evidence), left: index % 2 * 540, top: 55 + Math.floor(index / 2) * 330 });
      labels.push(`<text x="${12 + index % 2 * 540}" y="${45 + Math.floor(index / 2) * 330}">${rotation} degrees | ${columns} x ${rows}</text>`);
      coverage.push({ id: `${asset.id}/${variant.id}`, rotation, columns, rows, evidence });
    }
    composites.push({ input: Buffer.from(`<svg width="1080" height="690" xmlns="http://www.w3.org/2000/svg"><g font-family="Arial" font-size="12" fill="#514552">${labels.join("")}</g></svg>`), left: 0, top: 0 });
    await sharp({ create: { width: 1080, height: 690, channels: 4, background: "#eae5df" } }).composite(composites).png().toFile(`${output}/${asset.id}-${variant.id}.png`);
    console.log(`Verified repeated in-game floor ${asset.id}/${variant.id}`);
  }
  assert.equal(coverage.length, ASSET_CATALOG.assets.filter(asset => asset.placement.layer === "ground").reduce((total, asset) => total + getAssetVariants(asset).length * ASSET_ROTATIONS.length, 0));
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/coverage.json`, JSON.stringify({ coverage, errors }, null, 2));
  fixture.stop();
  await browser.close();
}
