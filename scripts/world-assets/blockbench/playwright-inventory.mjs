import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { CHARACTER_HAIRSTYLES, CHARACTER_FACES, CHARACTER_OUTFITS, CHARACTER_HEADWEAR } from "../../../packages/shared/src/character.ts";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "artifacts/blockbench-refinement";
await mkdir(output, { recursive: true });
const world = JSON.parse(await readFile("apps/client/src/world-asset-artwork.json", "utf8"));
const architecture = JSON.parse(await readFile("apps/client/src/world-architecture-artwork.json", "utf8"));
const characters = JSON.parse(await readFile("scripts/characters/blockbench/manifest.json", "utf8"));
const expected = [...Object.values(world), ...Object.values(architecture)].flatMap(asset => Object.values(asset.variants).map(variant => variant.path));
expected.push(...characters.layers.map(layer => layer.path.replace("apps/client/public", "")));
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(`${directory}/${entry.name}`) : `${directory}/${entry.name}`))).flat();
}
const inventory = (await Promise.all(["world-assets", "world-architecture", "characters"].map(directory => files(`apps/client/public/${directory}`)))).flat();
assert.deepEqual(inventory.map(path => path.replace("apps/client/public", "")).sort(), expected.toSorted());
assert.deepEqual(await files("apps/client/src/assets"), ["apps/client/src/assets/blockbench-office.webp"]);
let texturedFaces = 0;
for (const layer of characters.layers) {
  const model = JSON.parse(await readFile(layer.model, "utf8"));
  for (const element of model.elements) for (const face of Object.values(element.faces)) {
    assert(Number.isInteger(face.texture) && model.textures[face.texture], `${layer.name}/${element.name}: missing material`);
    texturedFaces++;
  }
}
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
const report = { atlases: [], previews: [], characterModels: characters.layers.length, texturedCharacterFaces: texturedFaces, errors };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (/\/(characters|world-assets|world-architecture)\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.locator(".auth-visual img").evaluate(image => image.decode());
  assert((await page.locator(".auth-visual img").getAttribute("src")).includes("blockbench-office.webp"));
  await page.screenshot({ path: `${output}/auth-after.png` });
  for (let index = 0; index < expected.length; index += 4) {
    const batch = await page.evaluate(async paths => Promise.all(paths.map(async path => {
      const response = await fetch(path);
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error(`Artwork failed to load: ${path}`);
      const bytes = await response.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const image = await createImageBitmap(new Blob([bytes]));
      const result = { path, width: image.width, height: image.height, sha256: Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("") };
      image.close();
      return result;
    })), expected.slice(index, index + 4));
    for (const entry of batch) assert.equal(entry.sha256, createHash("sha256").update(await readFile(`apps/client/public${entry.path}`)).digest("hex"), `${entry.path}: served artwork differs from disk`);
    report.atlases.push(...batch);
  }
  console.log(`Decoded and matched ${report.atlases.length} served atlases against the complete public inventory.`);
  await page.getByLabel("Username or email").fill("maya");
  await page.getByLabel("Password", { exact: true }).fill("northstar");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".character-editor-actions .primary-button")?.disabled === false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const previewsReady = () => page.waitForFunction(counts => {
    const previews = [...document.querySelectorAll(".character-option canvas")];
    const category = document.querySelector('.character-categories [aria-selected="true"]').id.replace("character-tab-", "");
    const expectedCount = counts[category];
    return previews.length === expectedCount && previews.every(canvas => {
      const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels.some((value, index) => index % 4 === 3 && value > 0);
    });
  }, { face: CHARACTER_FACES.length, hairstyle: CHARACTER_HAIRSTYLES.length, upperBody: CHARACTER_OUTFITS.length, lowerBody: CHARACTER_OUTFITS.length, shoes: CHARACTER_OUTFITS.length, headwear: CHARACTER_HEADWEAR.length });
  for (const direction of ["Front", "Left", "Back", "Right"]) {
    await page.getByRole("button", { name: direction, exact: true }).click();
    for (const category of ["Face", "Hair", "Tops", "Bottoms", "Shoes", "Headwear"]) {
      await page.getByRole("tab", { name: category, exact: true }).click();
      await previewsReady();
      const previews = await page.locator(".character-option canvas").evaluateAll(canvases => canvases.map(canvas => ({
        width: canvas.width, height: canvas.height, cssWidth: canvas.getBoundingClientRect().width,
        rendering: getComputedStyle(canvas).imageRendering,
      })));
      assert(previews.every(preview => preview.rendering === "pixelated"));
      report.previews.push({ direction, category, options: previews });
      await page.locator(".character-options").screenshot({ path: `${output}/options-${category}-${direction}.png` });
    }
  }
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await page.getByRole("tab", { name: "Face", exact: true }).click();
  await page.screenshot({ path: `${output}/creator-after.png` });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Use dark mode", exact: true }).click();
  await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".character-editor-actions .primary-button")?.disabled === false);
  await page.screenshot({ path: `${output}/creator-dark.png` });
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole("tab", { name: "Headwear", exact: true }).click();
    await previewsReady();
    const stageContainsCanvas = await page.locator(".character-stage canvas").evaluate(canvas => {
      const bounds = canvas.getBoundingClientRect();
      const stage = canvas.closest(".character-stage").getBoundingClientRect();
      return bounds.top >= stage.top && bounds.bottom <= stage.bottom && bounds.left >= stage.left && bounds.right <= stage.right;
    });
    assert(stageContainsCanvas, "The stage must contain the full character canvas");
    await page.getByRole("button", { name: "Cat ears", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".character-editor-actions .primary-button")?.disabled === false);
    await previewsReady();
    await page.screenshot({ path: `${output}/creator-${viewport.width}.png` });
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Sit & listen", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".character-editor-actions .primary-button")?.disabled === false);
    await page.locator(".character-stage canvas").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/creator-${viewport.width}-playback.png` });
    assert(await page.getByRole("button", { name: "Use character", exact: true }).isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".character-editor-actions .primary-button")?.disabled === false);
  assert.equal(await page.locator(".character-stage canvas").evaluate(canvas => getComputedStyle(canvas).imageRendering), "pixelated");
  report.reloaded = true;
  assert.deepEqual(errors, []);
  console.log(`Reviewed all ${report.previews.reduce((sum, preview) => sum + preview.options.length, 0)} option previews across four directions, both themes and three compact layouts.`);
} finally {
  await writeFile(`${output}/inventory-report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
