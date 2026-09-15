import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Locator, type Page } from "playwright-core";
import { createReviewFixture } from "./application-review/fixture.js";

const origin = "http://127.0.0.1:5173";
const distribution = fileURLToPath(new URL("../apps/client/dist/", import.meta.url));
const baseline = process.argv.includes("--baseline");
const artifacts = fileURLToPath(new URL(`../artifacts/scroll-audit/${baseline ? "before" : "after"}/`, import.meta.url));
const fixture = await createReviewFixture();
const conversation = fixture.store.getBootstrap("user-maya").conversations.find((item) => item.type === "team")!;
for (let index = 0; index < 60; index++) {
  fixture.store.addMessage(conversation.id, index % 2 ? "user-maya" : "user-leo", `Discussion ${index + 1}. Reviewing the next release and the remaining work with the team.`);
}
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const failures: string[] = [];
const results: unknown[] = [];
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(30_000);
await mkdir(artifacts, { recursive: true });

function check(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

async function wheelScroll(locator: Locator, axis: "x" | "y", delta: number) {
  const before = await locator.evaluate((node, direction) => direction === "x" ? node.scrollLeft : node.scrollTop, axis);
  await locator.hover();
  await page.mouse.wheel(0, delta);
  await page.waitForFunction(({ selector, direction, initial }) => {
    const node = document.querySelector(selector);
    return node && (direction === "x" ? node.scrollLeft : node.scrollTop) !== initial;
  }, { selector: await locator.evaluate((node) => `.${[...node.classList].join(".")}`), direction: axis, initial: before }, { timeout: 1_500 }).catch(() => undefined);
  const after = await locator.evaluate((node, direction) => direction === "x" ? node.scrollLeft : node.scrollTop, axis);
  return delta > 0 ? after > before : after < before;
}

async function inspectScrollAreas(page: Page, name: string) {
  const areas = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".panel-scroll, .build-section-scroll, .character-controls, .character-studio, .nav-rail")]
    .filter((node) => node.checkVisibility()).map((node) => {
      const style = getComputedStyle(node);
      return { name: node.className, height: node.clientHeight, contentHeight: node.scrollHeight, overflow: style.overflowY };
    }));
  results.push({ name, areas });
}

try {
  await context.route(`${origin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = resolve(distribution, path === "/" ? "index.html" : `.${decodeURIComponent(path)}`);
    assert(file.startsWith(resolve(distribution) + sep));
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json" };
    await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] ?? "application/octet-stream" });
  });
  await fixture.install(context, "maya");
  await page.goto(origin);
  await page.locator(".world-canvas canvas").waitFor();
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 1280, height: 500 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const size = `${viewport.width}x${viewport.height}`;
    await page.getByRole("button", { name: "Messages", exact: true }).click();
    const panel = page.locator(".chat-panel");
    const bounds = (await panel.boundingBox())!;
    results.push({ size, sidebarWidth: bounds.width });
    check(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1, `${size}: sidebar exceeds the viewport`);
    check(bounds.width >= Math.min(420, viewport.width - (viewport.width <= 480 ? 56 : 64)), `${size}: sidebar is too narrow`);
    const tabs = page.getByRole("tablist", { name: "Conversations" });
    await tabs.getByRole("tab").first().click();
    check(await wheelScroll(tabs, "x", 260), `${size}: conversation tabs ignore the mouse wheel`);
    check(await wheelScroll(tabs, "x", -260), `${size}: conversation tabs cannot scroll back`);
    await tabs.getByRole("tab").first().focus();
    await page.keyboard.press("End");
    check(await tabs.getByRole("tab").last().getAttribute("aria-selected") === "true", `${size}: last conversation is unreachable by keyboard`);
    await page.keyboard.press("Home");
    check(await wheelScroll(page.locator(".message-list"), "y", -500), `${size}: message history cannot scroll up`);
    await page.getByRole("button", { name: "Jump to latest", exact: true }).click();
    await page.screenshot({ path: resolve(artifacts, `messages-${size}.png`) });

    for (const name of ["People", "Organisation", "Meetings", "Settings"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await page.locator(".side-panel .panel-scroll").waitFor();
      await inspectScrollAreas(page, `${size}-${name}`);
      const scroll = page.locator(".side-panel .panel-scroll");
      if (await scroll.evaluate((node) => node.scrollHeight > node.clientHeight + 1)) {
        await scroll.evaluate((node) => { node.scrollTop = 0; });
        check(await wheelScroll(scroll, "y", 400), `${size}: ${name} cannot scroll`);
      }
    }

    await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.locator(".build-layout-panel").waitFor();
    const categories = page.getByRole("tablist", { name: "Asset categories" });
    check(await wheelScroll(categories, "x", 260), `${size}: Build categories ignore the mouse wheel`);
    await categories.getByRole("tab").first().focus();
    await page.keyboard.press("End");
    check(await categories.getByRole("tab").last().getAttribute("aria-selected") === "true", `${size}: last Build category is unreachable`);
    await categories.getByRole("tab", { name: "Seating", exact: true }).click();
    await inspectScrollAreas(page, `${size}-Build`);
    const assets = page.locator(".build-asset-scroll");
    if (await assets.evaluate((node) => node.scrollHeight > node.clientHeight + 1)) {
      check(await wheelScroll(assets, "y", 600), `${size}: Build assets cannot scroll`);
    }
    await page.getByRole("button", { name: "Close build tools", exact: true }).click();
    const rail = page.locator(".nav-rail");
    await rail.evaluate((node) => { node.scrollTop = 0; });
    if (await rail.evaluate((node) => node.scrollHeight > node.clientHeight + 1)) {
      check(await wheelScroll(rail, "y", 500), `${size}: navigation buttons cannot scroll into view`);
    }
    await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
    await page.locator(".character-studio").waitFor();
    await inspectScrollAreas(page, `${size}-Avatar`);
    const appearance = page.getByRole("tablist", { name: "Appearance" });
    if (await appearance.evaluate((node) => node.scrollWidth > node.clientWidth + 1)) {
      check(await wheelScroll(appearance, "x", 160), `${size}: avatar tabs ignore the mouse wheel`);
    }
    await appearance.getByRole("tab", { name: "Hair", exact: true }).click();
    for (const selector of [".character-studio", ".character-controls"]) {
      const scroller = page.locator(selector);
      if (await scroller.evaluate((node) => ["auto", "scroll"].includes(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1)) {
        await scroller.evaluate((node) => { node.scrollTop = 0; });
        check(await wheelScroll(scroller, "y", 400), `${size}: ${selector} cannot scroll`);
      }
    }
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${size}: page overflows horizontally`);
    console.log(`Checked ${size}`);
  }
} finally {
  await page.screenshot({ path: resolve(artifacts, "last-state.png") });
  await writeFile(resolve(artifacts, "results.json"), JSON.stringify({ results, failures, errors }, null, 2));
  await context.close();
  await browser.close();
  await fixture.stop();
}
console.log(JSON.stringify({ failures, errors, artifacts }, null, 2));
if (!baseline) assert.deepEqual([...failures, ...errors], []);
