import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { ASSET_CATALOG, getAssetVariants, isPermanentAsset } from "../../packages/shared/src/index.js";
import { installAssetFixture } from "../world-assets/playwright-fixture.js";
import { installBuiltAssetClient } from "../world-assets/built-client.js";
import { installWorldProbe } from "../characters/playwright-animation.js";

const output = fileURLToPath(new URL("../../artifacts/image-optimization-2026-09-16/runtime/", import.meta.url));
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile(new URL("manifest.json", import.meta.url), "utf8"));
const delivered = new Map<string, number>();
for (const record of Object.values(manifest) as { image: { id: string; bytes: number }; previews?: { id: string; bytes: number }[] }[]) {
  for (const image of [record.image, ...record.previews ?? []]) delivered.set(`/optimized-images/${image.id}.webp`, image.bytes);
}
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await installBuiltAssetClient(context);
const fixture = await installAssetFixture(context, "user-jonas", { x: 640, y: 480 }, { currentPlayerOnly: true });
await context.route("**/v1/members/me/character", async route => {
  assert.equal(route.request().method(), "PUT");
  const member = fixture.store.updateMemberCharacter("user-jonas", route.request().postDataJSON());
  await route.fulfill({ json: member });
});
const layout = fixture.store.getLayout("floor-studio")!;
const room = { ...layout.rooms[0]!, bounds: { x: 256, y: 256, width: 768, height: 512 }, footprint: [{ x: 256, y: 256, width: 768, height: 512 }],
  access: { mode: "open" as const, assignedPersonIds: [], knockable: false }, build: { mode: "open" as const, assignedPersonIds: [] } };
Object.assign(layout, {
  walls: [], openings: [], tiles: [], rooms: [room], revision: layout.revision + 1,
  objects: [
    ["table-workbench", 416, 416, 0], ["food-sushi", 448, 432, 90],
    ["plant-croton", 592, 400, 270], ["outdoor-mini-windmill", 736, 432, 180],
    ["decor-jellyfish-lamp", 480, 432, 0],
  ].map(([assetId, x, y, rotation], index) => {
    const asset = ASSET_CATALOG.assets.find(asset => asset.id === assetId)!;
    return { id: `image-review-${index}`, assetId, variantId: getAssetVariants(asset)[0]!.id, floorId: layout.floorId, x, y, rotation };
  }),
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
await installWorldProbe(page);
const errors: string[] = [], imageRequests = new Set<string>(), checks: unknown[] = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => {
  const path = new URL(request.url()).pathname;
  if (/^\/(optimized-images|world-assets|world-architecture|characters)\//.test(path)) imageRequests.add(path);
});
page.on("response", response => {
  if (response.status() >= 400 && response.url().includes("/optimized-images/")) errors.push(`${response.status()} ${response.url()}`);
});

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await page.waitForFunction(() => Boolean(globalThis.findAvatar("You")));
  await page.waitForFunction(() => {
    const queue = globalThis.avatarWorld ? [globalThis.avatarWorld.stage] : [];
    let loaded = 0;
    for (const node of queue) {
      if (node.label?.startsWith("/world-assets/") && node.texture?.source && node.texture.source.width > 1) loaded++;
      queue.push(...node.children ?? []);
    }
    return loaded >= 5;
  });
  const startupImages = [...imageRequests];
  checks.push({ world: "five placed assets and the avatar loaded", startupImages: startupImages.length, startupBytes: startupImages.reduce((sum, path) => sum + (delivered.get(path) ?? 0), 0) });
  await page.screenshot({ path: `${output}/world.png` });
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.isVisible()) await people.click();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("tab", { name: "Shop", exact: true }).click();
  for (const category of ASSET_CATALOG.categories.filter(category => ASSET_CATALOG.assets.some(asset => asset.category === category.id && asset.shop && !isPermanentAsset(asset.id)))) {
    await page.getByRole("tab", { name: category.name, exact: true }).click();
    const paths = await page.locator(".shop-asset image").evaluateAll(images => images.map(image => image.getAttribute("href")!));
    assert.equal(paths.length, ASSET_CATALOG.assets.filter(asset => asset.category === category.id && asset.shop && !isPermanentAsset(asset.id)).length);
    assert(paths.every(path => path.startsWith("/optimized-images/") && path.endsWith(".webp")));
    await page.evaluate(async paths => {
      for (const path of paths) { const image = new Image(); image.src = path; await image.decode(); if (Math.max(image.naturalWidth, image.naturalHeight) > 128) throw new Error("Oversized Shop preview"); }
    }, paths);
    checks.push({ shopCategory: category.id, images: paths.length });
  }
  await page.getByRole("tab", { name: "Food", exact: true }).click();
  await page.screenshot({ path: `${output}/food-shop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/food-shop-mobile.png` });
  checks.push({ mobile: { width: 390, height: 844, foodImages: await page.locator(".shop-asset image").count() } });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
  const editor = page.locator(".character-editor");
  const ready = () => page.waitForFunction(() => (document.querySelector(".character-editor-actions .primary-button") as HTMLButtonElement | null)?.disabled === false);
  await ready();
  await ready();
  for (const [tab, option] of [["Face", "Shy"], ["Hair", "Ink hime cut"], ["Tops", "Lilac kimono"], ["Bottoms", "Sailor trousers"], ["Shoes", "Leather boots"], ["Headwear", "Goggles"]]) {
    await editor.getByRole("tab", { name: tab!, exact: true }).click();
    await editor.getByRole("button", { name: option!, exact: true }).click();
    await ready();
  }
  for (const motion of ["Idle", "Walk", "Sit", "Listen", "Sit & listen"]) {
    await editor.getByRole("button", { name: motion, exact: true }).click();
    for (const direction of ["Front", "Left", "Back", "Right"]) {
      await editor.getByRole("button", { name: direction, exact: true }).click();
      await ready();
      const visible = await editor.locator(".character-stage canvas").evaluate(canvas => {
        const image = canvas as HTMLCanvasElement;
        return image.getContext("2d")!.getImageData(0, 0, image.width, image.height).data.some((value, index) => index % 4 === 3 && value > 0);
      });
      assert(visible);
      checks.push({ avatar: { motion, direction, visible } });
    }
  }
  await page.screenshot({ path: `${output}/avatar.png` });
  await editor.getByRole("button", { name: "Use character", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  const character = fixture.store.getMember("user-jonas")!.character;
  assert.deepEqual(character, { face: "shy", hairstyle: "hime", upperBody: "kimono", lowerBody: "sailor", shoes: "ranger", headwear: "goggles" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await page.waitForFunction(() => Boolean(globalThis.findAvatar("You")));
  checks.push({ savedAppearanceReloaded: character });
  assert.deepEqual([...imageRequests].filter(path => !path.startsWith("/optimized-images/")), [], "The app requested original PNGs");
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, imageRequests: [...imageRequests], errors }, null, 2) + "\n");
  fixture.stop();
  await browser.close();
}
console.log(`Verified ${checks.length} production client checks with optimized images.`);
