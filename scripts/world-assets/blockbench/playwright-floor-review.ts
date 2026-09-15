import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application, Sprite } from "../../../apps/client/node_modules/pixi.js";
import { ASSET_CATALOG, ASSET_ROTATIONS, getAssetVariants, type WorldObject } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../playwright-fixture.js";
import { installWorldProbe } from "../../characters/playwright-animation.js";

const output = fileURLToPath(new URL("../../../artifacts/floor-types-2026-09-15/gameplay/", import.meta.url));
const requested = process.argv.find(argument => argument.startsWith("--assets="))?.slice(9).split(",");
const assets = ASSET_CATALOG.assets.filter(asset => asset.kind === "floor-tile" && (!requested || requested.includes(asset.id)));
assert(assets.length > 0 && (!requested || requested.length === assets.length), "Every requested floor must exist in the catalog");
const sharp = createRequire(new URL("../../../apps/server/package.json", import.meta.url))("sharp") as typeof import("../../../apps/server/node_modules/sharp");
await mkdir(`${output}/scenes`, { recursive: true });
await mkdir(`${output}/fields`, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const fixture = await installAssetFixture(context, "user-maya", { x: 704, y: 800 }, { currentPlayerOnly: true });
const layout = fixture.store.getLayout("floor-studio")!;
Object.assign(layout, { objects: [], tiles: [], walls: [], openings: [], rooms: [], revision: layout.revision + 1 });
const page = await context.newPage();
await installWorldProbe(page);
const errors: string[] = [];
const coverage: { assetId: string; variantId: string; rotation: number; evidence: string }[] = [];
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => {
  if (/\/world-assets\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
});
try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const closePeople = page.getByRole("button", { name: "Close people", exact: true });
  if (await closePeople.isVisible()) await closePeople.click();
  await page.waitForFunction(() => Boolean(globalThis.avatarWorld?.stage.children?.length));
  await page.waitForTimeout(800);
  for (const asset of assets) {
    const composites: { input: Buffer; left: number; top: number }[] = [];
    const labels = [`<text x="12" y="22">${asset.name} · gameplay scale (0.78) · 3 × 3 repeated tiles</text>`];
    for (const [design, variant] of getAssetVariants(asset).entries()) for (const [direction, rotation] of ASSET_ROTATIONS.entries()) {
      const single: WorldObject = { id: "single", assetId: asset.id, variantId: variant.id, rotation, floorId: layout.floorId, x: 320, y: 448 };
      layout.objects = [single, ...Array.from({ length: 9 }, (_, index) => ({ ...single, id: `repeat-${index}`, x: 544 + index % 3 * 64, y: 384 + Math.floor(index / 3) * 64 }))];
      layout.revision++;
      fixture.publish({ type: "layout.updated", layout });
      await page.waitForFunction(async expected => {
        const artwork = (await import("/src/world-asset-artwork.json?import" as string)).default;
        const app = globalThis.avatarWorld as unknown as Application;
        return expected.every(object => {
          const sprite = app?.stage.getChildByLabel(`world-asset:${object.id}`, true)?.getChildByLabel("artwork")?.children.at(-1) as Sprite | undefined;
          const frame = artwork[object.assetId].variants[object.variantId].frames[object.rotation / 90];
          return sprite?.visible && sprite.texture.frame.x === frame.x && sprite.texture.frame.y === frame.y;
        });
      }, layout.objects);
      const clip = await page.evaluate(() => {
        const app = globalThis.avatarWorld as unknown as Application;
        app.render();
        const canvas = app.canvas.getBoundingClientRect();
        const start = app.stage.children[0]!.toGlobal({ x: 536, y: 376 });
        const end = app.stage.children[0]!.toGlobal({ x: 744, y: 584 });
        const scale = canvas.width / app.screen.width;
        return { x: Math.floor(canvas.x + start.x * scale), y: Math.floor(canvas.y + start.y * scale), width: Math.ceil((end.x - start.x) * scale), height: Math.ceil((end.y - start.y) * scale) };
      });
      assert(clip.width >= 161 && clip.width <= 164, `Review must retain default gameplay scale: ${clip.width}`);
      const evidence = `fields/${asset.id}-${variant.id}-${rotation}.png`;
      await page.screenshot({ path: `${output}/${evidence}`, clip });
      if (rotation === 0) await page.screenshot({ path: `${output}/scenes/${asset.id}-${variant.id}.png` });
      composites.push({ input: await readFile(`${output}/${evidence}`), left: 12 + direction * 176, top: 62 + design * 204 });
      labels.push(`<text x="${12 + direction * 176}" y="${52 + design * 204}">${variant.name} · ${rotation}°</text>`);
      coverage.push({ assetId: asset.id, variantId: variant.id, rotation, evidence });
    }
    composites.push({ input: Buffer.from(`<svg width="716" height="666" xmlns="http://www.w3.org/2000/svg"><g font-family="Arial" font-size="11" fill="#514552">${labels.join("")}</g></svg>`), left: 0, top: 0 });
    await sharp({ create: { width: 716, height: 666, channels: 4, background: "#eee8df" } }).composite(composites).png().toFile(`${output}/${asset.id}.png`);
    console.log(`Captured ${asset.id}: three designs, four rotations, repeated fields at gameplay scale`);
  }
  assert.equal(coverage.length, assets.length * 12);
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/coverage${requested ? "-" + requested.join("-") : ""}.json`, JSON.stringify({ coverage, errors }, null, 2));
  fixture.stop();
  await browser.close();
}
