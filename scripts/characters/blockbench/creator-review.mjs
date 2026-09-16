import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { CHARACTER_HAIRSTYLES, CHARACTER_FACES, CHARACTER_OUTFITS, CHARACTER_HEADWEAR, DEFAULT_CHARACTER_APPEARANCE } from "../../../packages/shared/src/character.ts";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "artifacts/avatar-anime/after";
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile("scripts/characters/blockbench/manifest.json", "utf8"));
const newStyles = [["pixie", "Ash pixie"], ["curtains", "Chestnut curtains"], ["hime", "Ink hime cut"], ["tousled", "Silver tousle"], ["buns", "Peach buns"], ["swept", "Copper side sweep"], ["curls", "Cocoa curls"], ["longbraid", "Pearl braid"]];
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const report = { atlases: [], options: [], saved: [], layouts: [], upperPaths: [], errors: [] };
let original;
let savedAppearance;
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("response", response => {
    if (response.url().includes("/characters/") && response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`);
  });
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith("/characters/blockbench/upper/")) return;
    if (!report.upperPaths.includes(path)) report.upperPaths.push(path);
    if (!CHARACTER_OUTFITS.some(outfit => path.endsWith(`/${outfit}.png`))) report.errors.push(`Unexpected upper-body asset: ${path}`);
  });
  await page.addInitScript(() => {
    globalThis.__PIXI_APP_INIT__ = app => { globalThis.avatarReviewWorld = app; };
    globalThis.avatarReviewSprite = () => {
      const queue = globalThis.avatarReviewWorld ? [globalThis.avatarReviewWorld.stage] : [];
      for (const node of queue) {
        if (node.children?.some(child => child.text === "You")) {
          const sprite = node.children.flatMap(child => child.children ?? []).find(child => child.texture?.source?.width === 960);
          if (sprite) return sprite;
        }
        queue.push(...node.children ?? []);
      }
    };
  });
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Username or email").fill("maya");
  await page.getByLabel("Password", { exact: true }).fill("northstar");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Customize avatar", exact: true }).waitFor();
  for (const layer of manifest.layers) {
    const path = layer.path.replace("apps/client/public", "");
    const served = await page.evaluate(async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Cannot load ${path}`);
      const buffer = await response.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", buffer);
      const bitmap = await createImageBitmap(new Blob([buffer]));
      const result = { width: bitmap.width, height: bitmap.height, hash: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("") };
      bitmap.close();
      return result;
    }, path);
    assert.equal(served.hash, createHash("sha256").update(await readFile(layer.path)).digest("hex"));
    assert.deepEqual([served.width, served.height], [960, 3840]);
    report.atlases.push({ path, ...served });
  }
  const playerReady = () => page.waitForFunction(() => Boolean(globalThis.avatarReviewSprite()));
  const ready = () => page.waitForFunction(() => document.querySelector(".character-editor-actions .primary-button")?.disabled === false);
  const openCreator = async () => {
    await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
    await ready();
  };
  const optionsReady = count => page.waitForFunction(count => {
    const canvases = [...document.querySelectorAll(".character-option canvas")];
    return canvases.length === count && canvases.every(canvas => canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0));
  }, count);
  await playerReady();
  const members = await page.evaluate(async () => (await (await fetch("/v1/bootstrap")).json()).members);
  assert(members.every(member => Object.keys(member.character).sort().join() === Object.keys(DEFAULT_CHARACTER_APPEARANCE).sort().join()), "Saved appearances must contain only current selections");
  original = members.find(member => member.id === "user-maya").character;
  report.original = original;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCreator();
  assert.equal(await page.getByRole("button", { name: /^(Female|Male)$/ }).count(), 0);
  assert.equal(await page.getByRole("group", { name: /breast size/i }).count(), 0);
  assert.equal(await page.getByRole("button", { name: /^(No Breast|Flat|Medium|Big)$/ }).count(), 0);
  for (const [tab, name] of [["Face", "Calm"], ["Tops", "Bomber jacket"], ["Bottoms", "Denim trousers"], ["Shoes", "Sneakers"], ["Headwear", "None"]]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
    await ready();
  }
  for (const [hairstyle, name] of newStyles) {
    const outfit = hairstyle === "curls" ? "traveler" : hairstyle === "longbraid" ? "festival" : "street";
    const headwear = hairstyle === "curls" ? "goggles" : hairstyle === "longbraid" ? "blossom" : "none";
    for (const [tab, label] of outfit === "street"
      ? [["Tops", "Bomber jacket"], ["Bottoms", "Denim trousers"], ["Shoes", "Sneakers"], ["Headwear", "None"]]
      : outfit === "traveler"
      ? [["Tops", "Traveler jacket"], ["Bottoms", "Travel breeches"], ["Shoes", "Travel boots"], ["Headwear", "Goggles"]]
      : [["Tops", "Festival haori"], ["Bottoms", "Indigo hakama"], ["Shoes", "Tabi sandals"], ["Headwear", "Blossom clip"]]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await page.getByRole("button", { name: label, exact: true }).click();
      await ready();
    }
    await page.getByRole("tab", { name: "Hair", exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
    await ready();
    const expected = { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle, upperBody: outfit, lowerBody: outfit, shoes: outfit, headwear };
    const previewMatches = await page.locator(".character-stage canvas").evaluate(async (canvas, appearance) => {
      const { renderCharacter } = await import("/src/character-renderer.ts");
      const atlas = await renderCharacter(appearance);
      const expected = atlas.getContext("2d").getImageData(24, 0, 72, 120).data;
      const actual = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    }, expected);
    assert(previewMatches, `${hairstyle}: creator composition`);
    await page.screenshot({ path: `${output}/creator-${hairstyle}.png` });
    const saved = page.waitForResponse(response => response.url().endsWith("/v1/members/me/character") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Use character", exact: true }).click();
    assert.deepEqual((await (await saved).json()).character, expected);
    savedAppearance = expected;
    await page.reload({ waitUntil: "domcontentloaded" });
    await playerReady();
    const persisted = await page.evaluate(async () => (await (await fetch("/v1/bootstrap")).json()).members.find(member => member.id === "user-maya").character);
    assert.deepEqual(persisted, expected);
    const world = await page.evaluate(async appearance => {
      const { renderCharacter } = await import("/src/character-renderer.ts");
      const expected = await renderCharacter(appearance);
      const sprite = globalThis.avatarReviewSprite();
      const actual = sprite.texture.source.resource;
      const actualPixels = actual.getContext("2d").getImageData(0, 0, 960, 1920).data;
      const expectedPixels = expected.getContext("2d").getImageData(0, 0, 960, 1920).data;
      return { matches: actualPixels.every((value, index) => value === expectedPixels[index]), width: sprite.width, height: sprite.height, anchor: { x: sprite.anchor.x, y: sprite.anchor.y }, bounds: { x: sprite.getBounds().x, y: sprite.getBounds().y, width: sprite.getBounds().width, height: sprite.getBounds().height } };
    }, expected);
    assert(world.matches, `${hairstyle}: game and creator atlas must match`);
    assert.equal(world.width, 80);
    assert.equal(world.height, 80);
    assert.deepEqual(world.anchor, { x: 0.5, y: 0.95 });
    await page.screenshot({ path: `${output}/world-${hairstyle}.png` });
    report.saved.push({ appearance: expected, previewMatches, persisted: true, world });
    await openCreator();
  }
  for (const direction of ["Front", "Left", "Right", "Back"]) {
    await page.getByRole("button", { name: direction, exact: true }).click();
    for (const category of ["Face", "Hair", "Tops", "Bottoms", "Shoes", "Headwear"]) {
      await page.getByRole("tab", { name: category, exact: true }).click();
      const count = category === "Hair" ? CHARACTER_HAIRSTYLES.length : category === "Face" ? CHARACTER_FACES.length : category === "Headwear" ? CHARACTER_HEADWEAR.length : CHARACTER_OUTFITS.length;
      await optionsReady(count);
      report.options.push({ category, direction, count });
      await page.locator(".character-controls").evaluate(element => { element.scrollTop = 0; });
      await page.locator(".character-controls").screenshot({ path: `${output}/options-${category}-${direction}.png` });
      if (category === "Hair") {
        await page.getByRole("button", { name: "Pearl braid", exact: true }).scrollIntoViewIfNeeded();
        await page.locator(".character-controls").screenshot({ path: `${output}/options-Hair-${direction}-lower.png` });
      }
    }
  }
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.getByRole("tab", { name: "Hair", exact: true }).click();
      await page.getByRole("button", { name: "Pearl braid", exact: true }).click();
      await ready();
      await optionsReady(CHARACTER_HAIRSTYLES.length);
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await page.getByRole("button", { name: "Sit & listen", exact: true }).click();
      await ready();
      const fits = await page.locator(".character-stage canvas").evaluate(canvas => {
        const bounds = canvas.getBoundingClientRect();
        const stage = canvas.closest(".character-stage").getBoundingClientRect();
        return bounds.left >= stage.left && bounds.right <= stage.right && bounds.top >= stage.top && bounds.bottom <= stage.bottom && document.documentElement.scrollWidth <= innerWidth;
      });
      assert(fits);
      await page.locator(".character-stage canvas").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/creator-${theme}-${viewport.width}.png` });
      report.layouts.push({ theme, ...viewport, fits, selectedNewHair: true });
    }
  }
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(report.upperPaths.length, CHARACTER_OUTFITS.length);
  assert.deepEqual(report.errors, []);
} finally {
  try {
    if (page && original && savedAppearance) report.restored = await page.evaluate(async ({ original, savedAppearance }) => {
      const response = await fetch("/v1/bootstrap");
      if (!response.ok) throw new Error("Cannot check the saved appearance before cleanup");
      const current = (await response.json()).members.find(member => member.id === "user-maya").character;
      if (Object.keys(original).every(key => current[key] === original[key])) return true;
      if (Object.keys(savedAppearance).some(key => current[key] !== savedAppearance[key])) throw new Error("The appearance changed during review; preserving that change");
      const restored = await fetch("/v1/members/me/character", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(original) });
      if (!restored.ok) throw new Error("Could not restore the original appearance");
      const character = (await restored.json()).character;
      if (Object.keys(original).some(key => character[key] !== original[key])) throw new Error("Restored appearance does not match the initial selection");
      return true;
    }, { original, savedAppearance });
  } finally {
    await writeFile(`${output}/creator-review.json`, JSON.stringify(report, null, 2));
    await browser.close();
  }
}
console.log(`Matched ${report.atlases.length} served atlases; saved and reloaded ${report.saved.length} appearances; checked ${report.options.reduce((sum, option) => sum + option.count, 0)} previews and ${report.layouts.length} compact layouts.`);
