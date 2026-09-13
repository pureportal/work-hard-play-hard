import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import { sharp } from "./raster.mjs";
import { DEFAULT_CHARACTER_APPEARANCE, type CharacterAppearance, type ClientCommand } from "../../packages/shared/src/index.js";
import { DemoStore } from "../../apps/server/src/store.js";
import { WorldRuntime } from "../../apps/server/src/world/world-runtime.js";
import { installWorldProbe, verifyPlayback, verifyWorldMovement, worldReady } from "./playwright-animation.js";

const baseline = process.argv.includes("--baseline");
const output = process.env.CHARACTER_SCREENSHOTS ? resolve(process.env.CHARACTER_SCREENSHOTS) : fileURLToPath(new URL(`../../artifacts/characters/revision/${baseline ? "before" : "after"}/`, import.meta.url));
const origin = process.env.CHARACTER_URL ?? "http://127.0.0.1:5173";
const store = new DemoStore();
store.updateMemberCharacter("user-maya", { ...DEFAULT_CHARACTER_APPEARANCE });
const runtime = new WorldRuntime(store);
const errors: string[] = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });

async function fixture(context: BrowserContext) {
  await context.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = { "access-control-allow-origin": route.request().headers().origin ?? "*", "access-control-allow-credentials": "true" };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, PUT" } });
    } else if (path === "/v1/auth/session") {
      await route.fulfill({ json: { user: { id: "user-maya", username: "avatar-review", email: "avatar-review@example.test" }, setupRequired: false, registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity() }, headers });
    } else if (path === "/v1/bootstrap") {
      await route.fulfill({ json: store.getBootstrap("user-maya"), headers });
    } else if (path === "/v1/members/me/character" && route.request().method() === "PUT") {
      const member = store.updateMemberCharacter("user-maya", route.request().postDataJSON() as CharacterAppearance);
      runtime.publishMember(member);
      await route.fulfill({ json: member, headers });
    } else {
      errors.push(`Unexpected request ${route.request().method()} ${path}`);
      await route.fulfill({ status: 404, json: { error: "Unexpected avatar review request" }, headers });
    }
  });
  await context.routeWebSocket(/\/v1\//, (socket) => {
    const peer = runtime.connect("user-maya", "floor-studio", (event) => socket.send(JSON.stringify(event)));
    socket.onMessage((message) => runtime.handleCommand(peer, JSON.parse(String(message)) as ClientCommand));
    socket.onClose(() => runtime.disconnect(peer));
  });
}

async function ready(page: Page) {
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>(".character-editor-actions .primary-button");
    return button && !button.disabled;
  });
  assert.equal(await page.locator(".character-preview-error").count(), 0);
}

async function assertPreviewFits(page: Page) {
  const result = await page.locator(".character-stage canvas").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    let clipped = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3]! < 16) continue;
      visible++;
      if (x < 2 || y < 2 || x >= canvas.width - 2 || y >= canvas.height - 2) clipped++;
    }
    const bounds = canvas.getBoundingClientRect();
    const parent = canvas.closest(".character-stage")!.getBoundingClientRect();
    return { visible, clipped, fits: bounds.left >= parent.left && bounds.right <= parent.right && bounds.top >= parent.top && bounds.bottom <= parent.bottom, width: bounds.width };
  });
  assert(result.visible > 8000, "The complete preview must render");
  assert.equal(result.clipped, 0);
  assert(result.fits, "The preview must fit its stage");
  return result.width;
}

async function choose(page: Page, appearance: CharacterAppearance) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: appearance.gender === "male" ? "Male" : "Female", exact: true }).click();
  await dialog.getByRole("button", { name: appearance.breastSize === "none" ? "No Breast" : appearance.breastSize[0]!.toUpperCase() + appearance.breastSize.slice(1), exact: true }).click();
  const options = [
    ["Face", { calm: "Calm", bright: "Bright", fierce: "Fierce" }[appearance.face]],
    ["Hair", { bob: "Ruby bob", spiky: "Midnight spikes", ponytail: "Lavender ponytail" }[appearance.hairstyle]],
    ["Tops", { street: "Bomber jacket", ranger: "Ranger vest", arcane: "Moon armor" }[appearance.upperBody]],
    ["Bottoms", { street: "Denim shorts", ranger: "Ranger breeches", arcane: "Moon breeches" }[appearance.lowerBody]],
    ["Shoes", { street: "Sneakers", ranger: "Leather boots", arcane: "Moon boots" }[appearance.shoes]],
    ["Headwear", { none: "None", cap: "Star cap", witch: "Moon hat" }[appearance.headwear]],
  ];
  for (const [tab, option] of options) {
    await dialog.getByRole("tab", { name: tab!, exact: true }).click();
    await dialog.getByRole("button", { name: option!, exact: true }).click();
  }
  await ready(page);
  await assertPreviewFits(page);
}

runtime.start();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await fixture(context);
  const page = await context.newPage();
  await installWorldProbe(page);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.locator(".world-canvas canvas").waitFor();
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  const game = page.getByRole("button", { name: "Close game", exact: true });
  if (await game.isVisible()) await game.click();
  const leave = page.getByRole("button", { name: "Leave game", exact: true });
  if (await leave.isVisible()) await leave.click();
  await worldReady(page);
  await page.screenshot({ path: `${output}/world-desktop.png` });
  await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
  await ready(page);
  await page.screenshot({ path: `${output}/editor-desktop.png` });
  await choose(page, { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", breastSize: "none", hairstyle: "ponytail", headwear: "cap", upperBody: "arcane", lowerBody: "ranger" });
  await page.screenshot({ path: `${output}/mixed-desktop.png` });
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await ready(page);
  await page.screenshot({ path: `${output}/mixed-side.png` });
  const verified: string[] = [];
  let playback: Awaited<ReturnType<typeof verifyPlayback>> = [];
  let movement: Awaited<ReturnType<typeof verifyWorldMovement>> = [];
  if (!baseline) {
    const tiles = [];
    let index = 0;
    for (const gender of ["female", "male"] as const) for (const breastSize of ["none", "flat", "medium", "big"] as const) for (const upperBody of ["street", "ranger", "arcane"] as const) {
      const appearance: CharacterAppearance = {
        gender, breastSize, upperBody,
        face: (["calm", "bright", "fierce"] as const)[index % 3]!,
        hairstyle: (["bob", "spiky", "ponytail"] as const)[Math.floor(index / 3) % 3]!,
        lowerBody: (["street", "ranger", "arcane"] as const)[(index + 1) % 3]!,
        shoes: (["street", "ranger", "arcane"] as const)[Math.floor(index / 3) % 3]!,
        headwear: (["none", "cap", "witch"] as const)[Math.floor(index / 4) % 3]!,
      };
      await choose(page, appearance);
      for (const [directionIndex, direction] of ["Front", "Left", "Back", "Right"].entries()) {
        await page.getByRole("button", { name: direction, exact: true }).click();
        await ready(page);
        await assertPreviewFits(page);
        tiles.push({ input: await sharp(await page.locator(".character-stage > .character-preview").screenshot()).resize(240, 240, { fit: "contain", background: "#00000000" }).png().toBuffer(), left: (index % 6) * 960 + directionIndex * 240, top: Math.floor(index / 6) * 260 });
      }
      index++;
      if (index % 6 === 0) console.log(`${index}/24 appearances reviewed in four directions.`);
    }
    await sharp({ create: { width: 5760, height: 1040, channels: 4, background: "#f5f3f0" } }).composite(tiles).png().toFile(`${output}/browser-combinations.png`);
    verified.push("24 mixed appearances, all body fits and wardrobe controls, four directions, complete preview bounds");
    playback = await verifyPlayback(page, output);
    await page.getByRole("tab", { name: "Face", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("tab", { name: "Hair", exact: true }).getAttribute("aria-selected"), "true");
    await page.getByRole("button", { name: "Randomize", exact: true }).click();
    await ready(page);
    await assertPreviewFits(page);
    verified.push("keyboard category navigation, randomization, four-direction idle, walking and seated playback with recorded frames and animated WebP evidence");
    const saved: CharacterAppearance = { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", breastSize: "none", face: "fierce", hairstyle: "spiky", upperBody: "arcane", lowerBody: "ranger", shoes: "street", headwear: "witch" };
    await choose(page, saved);
    await page.getByRole("button", { name: "Use character", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.deepEqual(store.getMember("user-maya")!.character, saved);
    await worldReady(page);
    movement = await verifyWorldMovement(page);
    await page.screenshot({ path: `${output}/world-saved.png` });
    await page.locator(".nav-avatar").screenshot({ path: `${output}/portrait-navigation.png` });
    await page.reload({ waitUntil: "domcontentloaded" });
    await worldReady(page);
    await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
    await ready(page);
    assert.equal(await page.getByRole("button", { name: "Male", exact: true }).getAttribute("aria-pressed"), "true");
    await choose(page, DEFAULT_CHARACTER_APPEARANCE);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(store.getMember("user-maya")!.character, saved);
    verified.push("saving and reload using isolated workspace data, cancellation, four-direction world movement and idle transitions, player and bot sprite dimensions");
    const closePeople = page.getByRole("button", { name: "Close people", exact: true });
    if (await closePeople.isVisible()) await closePeople.click();
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
      const appearance: CharacterAppearance = { ...DEFAULT_CHARACTER_APPEARANCE, face: "bright", hairstyle: "ponytail", headwear: "witch", lowerBody: "arcane" };
      await choose(page, appearance);
      const bounds = await page.getByRole("dialog").evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height && !bounds.overflow);
      await page.getByRole("dialog").evaluate((element) => { element.scrollTop = 0; });
      await page.locator(".character-controls").evaluate((element) => { element.scrollTop = 0; });
      await page.screenshot({ path: `${output}/editor-${viewport.width}x${viewport.height}-top.png` });
      await page.getByRole("button", { name: "Moon hat", exact: true }).scrollIntoViewIfNeeded();
      const controls = await page.locator(".character-stage canvas, .character-playback button, .character-editor-actions button").evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { tag: element.tagName, left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
      }));
      assert(controls.every((box) => box.left >= 0 && box.right <= box.viewportWidth && box.top >= 0 && box.bottom <= box.viewportHeight), "Preview and actions must stay visible while browsing options");
      assert(controls.filter((box) => box.tag === "BUTTON").every((box) => box.width >= 40 && box.height >= 40), "Playback and save controls need 40px touch targets");
      await page.screenshot({ path: `${output}/editor-${viewport.width}x${viewport.height}-controls.png` });
      await page.getByRole("button", { name: "Use character", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.deepEqual(store.getMember("user-maya")!.character, appearance);
      verified.push(`${viewport.width}x${viewport.height}: preview and dialog bounds, persistent preview and save controls while browsing options, 40px playback targets, saving`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Use dark mode", exact: true }).click();
    await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
    await ready(page);
    await page.screenshot({ path: `${output}/editor-mobile-dark.png` });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
    await choose(page, { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "ponytail", headwear: "witch" });
    await page.screenshot({ path: `${output}/editor-desktop-dark.png` });
    verified.push("desktop and mobile dark appearance");
  }
  await context.close();
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ origin, baseline, verified, playback, movement, errors }, null, 2));
  console.log(`Avatar browser screenshots: ${output}`);
} finally {
  await browser.close();
  runtime.stop();
}
