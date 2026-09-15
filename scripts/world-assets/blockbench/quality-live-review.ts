import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application, Sprite } from "../../../apps/client/node_modules/pixi.js";
import { ASSET_CATALOG, ASSET_ROTATIONS, getAssetVariants, type WorldObject } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../playwright-fixture.js";
import { installWorldProbe } from "../../characters/playwright-animation.js";

const sharp = createRequire(new URL("../../../apps/server/package.json", import.meta.url))("sharp") as typeof import("../../../apps/server/node_modules/sharp");
const output = process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "C:/Development/work-hard-play-hard/artifacts/asset-quality-2026-09-15/after/live-world";
const requested = process.argv.find(value => value.startsWith("--asset="))?.slice(8).split(",");
const assets = ASSET_CATALOG.assets.filter(asset => !requested || requested.includes(asset.id));
assert(assets.length > 0 && (!requested || assets.length === requested.length), `Unknown asset selection: ${JSON.stringify(requested)}`);
const designs = assets.flatMap(asset => getAssetVariants(asset).map(variant => ({ asset, variant })));
await mkdir(`${output}/scenes`, { recursive: true });
await mkdir(`${output}/crops`, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const fixture = await installAssetFixture(context, "user-maya", { x: 704, y: 576 }, { currentPlayerOnly: true });
const layout = fixture.store.getLayout("floor-studio")!;
Object.assign(layout, { walls: [], openings: [], rooms: [], tiles: [], objects: [], revision: layout.revision + 1 });
const page = await context.newPage();
const errors: string[] = [];
const report: { views: { id: string; rotation: number; evidence: string; scene: string; scale: number }[]; errors: string[] } = { views: [], errors };
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => { if (/\/(world-assets|world-architecture|characters)\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
await installWorldProbe(page);
const slots = [[320, 320], [640, 320], [960, 320], [320, 576], [960, 576], [320, 832], [640, 832], [960, 832]];
try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const closePeople = page.getByRole("button", { name: "Close people", exact: true });
  if (await closePeople.isVisible()) await closePeople.click();
  await page.waitForFunction(() => Boolean(globalThis.avatarWorld?.stage.children?.length));
  await page.waitForTimeout(350);
  for (let start = 0; start < designs.length; start += slots.length) {
    const group = designs.slice(start, start + slots.length);
    for (const rotation of ASSET_ROTATIONS) {
      layout.objects = group.flatMap(({ asset, variant }, index) => {
        const [x, y] = slots[index]!;
        const placed: WorldObject = { id: `quality-${asset.id}-${variant.id}`, assetId: asset.id, variantId: variant.id, rotation, x: x!, y: y!, floorId: layout.floorId };
        if (asset.placement.layer !== "surface") return [placed];
        return [{ id: `support-${placed.id}`, assetId: "table-workbench", variantId: "oak", rotation: 0, x: x! - 32, y: y!, floorId: layout.floorId }, placed];
      });
      layout.revision++;
      fixture.publish({ type: "layout.updated", layout });
      await page.waitForFunction(async objects => {
        const app = globalThis.avatarWorld as unknown as Application;
        const artwork = (await import("/src/world-asset-artwork.json?import" as string)).default;
        return objects.every(object => {
          const sprites = app.stage.getChildByLabel(`world-asset:${object.id}`, true)?.getChildByLabel("artwork")?.children.filter((node): node is Sprite => node.label.startsWith("/world-assets/"));
          const frames = artwork[object.assetId].variants[object.variantId].frames.filter((_frame: unknown, index: number) => index % 4 === object.rotation / 90);
          return sprites?.length && sprites.every(sprite => sprite.visible) && frames.some((frame: { x: number; y: number }) => sprites.at(-1)!.texture.frame.x === frame.x && sprites.at(-1)!.texture.frame.y === frame.y);
        });
      }, layout.objects);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const regions = await page.evaluate(async ({ ids, layout }) => {
        const app = globalThis.avatarWorld as unknown as Application;
        const { getPlacedWorldAssetArtwork } = await import("/src/world-asset-placement.ts" as string);
        app.render();
        const canvas = app.canvas.getBoundingClientRect();
        const sx = canvas.width / app.screen.width;
        const sy = canvas.height / app.screen.height;
        return ids.map(id => {
          const objects = layout.objects.filter(object => object.id === id || object.id === `support-${id}`);
          const bounds = objects.map(object => {
            const node = app.stage.getChildByLabel(`world-asset:${object.id}`, true)!;
            const bounds = getPlacedWorldAssetArtwork(layout, object).bounds;
            const start = node.toGlobal({ x: bounds.x, y: bounds.y });
            const end = node.toGlobal({ x: bounds.x + bounds.width + 3, y: bounds.y + bounds.height + 4 });
            return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y };
          });
          const left = Math.floor(canvas.x + Math.min(...bounds.map(rect => rect.x)) * sx - 12);
          const top = Math.floor(canvas.y + Math.min(...bounds.map(rect => rect.y)) * sy - 12);
          const right = Math.ceil(canvas.x + Math.max(...bounds.map(rect => rect.x + rect.width)) * sx + 12);
          const bottom = Math.ceil(canvas.y + Math.max(...bounds.map(rect => rect.y + rect.height)) * sy + 12);
          return { id, left, top, width: right - left, height: bottom - top, scale: app.stage.children[0]!.scale.x * sx };
        });
      }, { ids: group.map(({ asset, variant }) => `quality-${asset.id}-${variant.id}`), layout });
      const scene = `${output}/scenes/scene-${String(start / slots.length + 1).padStart(2, "0")}-${rotation}.png`;
      const screenshot = await page.screenshot({ path: scene });
      for (const [index, region] of regions.entries()) {
        assert(Math.abs(region.scale - 0.78) < 0.001, `Unexpected gameplay scale ${region.scale}`);
        assert(region.left >= 72 && region.top >= 80 && region.left + region.width <= 1440 && region.top + region.height < 920, `Artwork outside the visible scene: ${JSON.stringify(region)}`);
        const { asset, variant } = group[index]!;
        const evidence = `${output}/crops/${asset.id}-${variant.id}-${rotation}.png`;
        await sharp(screenshot).extract({ left: region.left, top: region.top, width: region.width, height: region.height }).toFile(evidence);
        report.views.push({ id: `${asset.id}/${variant.id}`, rotation, evidence, scene, scale: region.scale });
      }
    }
    console.log(`Captured in-game designs ${Math.min(start + slots.length, designs.length)}/${designs.length}, all four directions`);
  }
  const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  for (let start = 0; start < designs.length; start += 9) {
    const group = designs.slice(start, start + 9);
    const composites: { input: Buffer; left: number; top: number }[] = [];
    const labels = ['<text x="12" y="22">Running game · screenshot crops at original size · zoom 0.78</text>'];
    let top = 40;
    for (const { asset, variant } of group) {
      const images = await Promise.all(ASSET_ROTATIONS.map(async rotation => {
        const input = await readFile(`${output}/crops/${asset.id}-${variant.id}-${rotation}.png`);
        return { input, metadata: await sharp(input).metadata() };
      }));
      const rowHeight = Math.max(108, ...images.map(image => image.metadata.height! + 18));
      labels.push(`<text x="12" y="${top + 20}">${escape(asset.name)}</text><text x="12" y="${top + 38}">${escape(variant.name)}</text>`);
      images.forEach((image, index) => composites.push({ input: image.input, left: 190 + index * 220 + Math.floor((210 - image.metadata.width!) / 2), top: top + Math.floor((rowHeight - image.metadata.height!) / 2) }));
      top += rowHeight;
    }
    composites.push({ input: Buffer.from(`<svg width="1080" height="${top}" xmlns="http://www.w3.org/2000/svg"><g font-family="Arial" font-size="12" fill="#514552">${labels.join("")}</g></svg>`), left: 0, top: 0 });
    await sharp({ create: { width: 1080, height: top, channels: 4, background: "#eae5df" } }).composite(composites).png().toFile(`${output}/gameplay-${String(start / 9 + 1).padStart(2, "0")}.png`);
  }
  assert.equal(report.views.length, designs.length * 4);
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/coverage.json`, JSON.stringify(report, null, 2) + "\n");
  fixture.stop();
  await browser.close();
}
