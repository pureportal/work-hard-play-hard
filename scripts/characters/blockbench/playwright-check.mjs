import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { CHARACTER_ANIMATIONS, CHARACTER_DIRECTIONS, DEFAULT_CHARACTER_APPEARANCE } from "../../../packages/shared/src/character.ts";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "artifacts/blockbench-migration";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
const playback = [];
let original;
let page;
let savedAppearance;
let savedAndReloaded = false;
let reducedMotion = false;
let restoredOriginal = false;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (/\/characters\/|\/world-assets\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(() => {
    globalThis.__PIXI_APP_INIT__ = app => { globalThis.characterReviewWorld = app; };
    globalThis.reviewNodes = () => {
      const nodes = globalThis.characterReviewWorld ? [globalThis.characterReviewWorld.stage] : [];
      for (let i = 0; i < nodes.length; i++) nodes.push(...nodes[i].children ?? []);
      return nodes;
    };
    globalThis.reviewPlayer = () => {
      const player = globalThis.reviewNodes().find(node => node.children?.some(child => child.text === "You"));
      return player?.children.flatMap(child => child.children ?? []).find(node => node.texture?.source?.width === 960);
    };
  });
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Username or email").fill("maya");
  await page.getByLabel("Password", { exact: true }).fill("northstar");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForFunction(() => Boolean(globalThis.reviewPlayer()));
  const bootstrap = await page.evaluate(async () => (await fetch("/v1/bootstrap", { credentials: "include" })).json());
  original = bootstrap.members.find(member => member.id === "user-maya").character;
  await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
  const ready = () => page.waitForFunction(() => document.querySelector(".character-editor-actions .primary-button")?.disabled === false);
  await ready();
  await page.screenshot({ path: `${output}/creator-initial.png` });
  const expected = { ...DEFAULT_CHARACTER_APPEARANCE, face: "shy", hairstyle: "longbraid", upperBody: "traveler", lowerBody: "festival", shoes: "festival", headwear: "goggles" };
  for (const [tab, option] of [["Face", "Shy"], ["Hair", "Pearl braid"], ["Tops", "Traveler jacket"], ["Bottoms", "Indigo hakama"], ["Shoes", "Tabi sandals"], ["Headwear", "Goggles"]]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await page.getByRole("button", { name: option, exact: true }).click();
    await ready();
  }
  await page.screenshot({ path: `${output}/creator-mixed.png` });
  const saved = page.waitForResponse(response => response.url().endsWith("/v1/members/me/character") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Use character", exact: true }).click();
  assert.deepEqual((await (await saved).json()).character, expected);
  savedAppearance = expected;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(globalThis.reviewPlayer()));
  const restored = await page.evaluate(async () => (await fetch("/v1/bootstrap", { credentials: "include" })).json());
  assert.deepEqual(restored.members.find(member => member.id === "user-maya").character, expected);
  savedAndReloaded = true;
  await page.screenshot({ path: `${output}/saved-world.png` });
  await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
  await ready();
  for (const [motion, clip] of Object.entries(CHARACTER_ANIMATIONS)) for (const direction of CHARACTER_DIRECTIONS) {
    const motionName = { idle: "Idle", walk: "Walk", sit: "Sit", listen: "Listen", "sit-listen": "Sit & listen" }[motion];
    const directionName = { down: "Front", left: "Left", right: "Right", up: "Back" }[direction];
    await page.getByRole("button", { name: motionName, exact: true }).click();
    await page.getByRole("button", { name: directionName, exact: true }).click();
    await ready();
    const samples = await page.locator(".character-stage canvas").evaluate(async (canvas, duration) => {
      const frames = new Set();
      const start = performance.now();
      while (performance.now() - start < duration) {
        frames.add(canvas.toDataURL());
        await new Promise(requestAnimationFrame);
      }
      const bounds = canvas.getBoundingClientRect();
      const parent = canvas.closest(".character-stage").getBoundingClientRect();
      return { frames: frames.size, fits: bounds.left >= parent.left && bounds.right <= parent.right && bounds.top >= parent.top && bounds.bottom <= parent.bottom };
    }, Math.min(1200, clip.frameDuration * 3 + 50));
    assert(samples.frames >= 2, `${motion}/${direction} must animate`);
    assert(samples.fits);
    playback.push({ motion, direction, frames: samples.frames });
    await page.locator(".character-stage").screenshot({ path: `${output}/creator-${motion}-${direction}.png` });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const frozen = await page.locator(".character-stage canvas").evaluate(async canvas => {
    await new Promise(requestAnimationFrame);
    const first = canvas.toDataURL();
    await new Promise(resolve => setTimeout(resolve, 450));
    return first === canvas.toDataURL();
  });
  assert(frozen, "Reduced motion must freeze character playback");
  reducedMotion = frozen;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Idle", exact: true }).click();
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await ready();
  await page.screenshot({ path: `${output}/creator-mobile.png` });
  assert(await page.getByRole("button", { name: "Use character", exact: true }).isVisible());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.screenshot({ path: `${output}/world-mobile.png` });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ savedAndReloaded: true, playback, reducedMotion: frozen, errors }));
} finally {
  try {
    if (page && original && savedAppearance) restoredOriginal = await page.evaluate(async ({ original, expected }) => {
      const bootstrap = await fetch("/v1/bootstrap", { credentials: "include" });
      if (!bootstrap.ok) throw new Error("Could not verify the appearance before restoring it");
      const current = (await bootstrap.json()).members.find(member => member.id === "user-maya").character;
      if (Object.keys(original).every(key => current[key] === original[key])) return true;
      if (Object.keys(expected).some(key => current[key] !== expected[key])) throw new Error("Appearance changed during review; the new selection was preserved");
      const response = await fetch("/v1/members/me/character", { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(original) });
      if (!response.ok) throw new Error("Could not restore the original appearance");
      const character = (await response.json()).character;
      if (Object.keys(original).some(key => character[key] !== original[key])) throw new Error("Restored appearance does not match the original selection");
      return true;
    }, { original, expected: savedAppearance });
  } finally {
    await writeFile(`${output}/character-playwright.json`, JSON.stringify({ savedAndReloaded, playback, reducedMotion, original, restoredOriginal, errors }, null, 2));
    await browser.close();
  }
}
