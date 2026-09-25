import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { createReviewFixture } from "./application-review/fixture.js";
import { installWorldProbe } from "./characters/playwright-animation.js";
import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import { WorkspaceStore } from "../apps/server/src/store.js";

const sharp = createRequire(new URL("../apps/server/package.json", import.meta.url))("sharp") as typeof import("../apps/server/node_modules/sharp");
const output = fileURLToPath(new URL("../artifacts/wall-removal/", import.meta.url));
const distribution = fileURLToPath(new URL("../apps/client/dist/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.route("http://127.0.0.1:5173/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  const file = resolve(distribution, path === "/" ? "index.html" : `.${decodeURIComponent(path)}`);
  assert(file.startsWith(resolve(distribution) + sep));
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json" };
  await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] ?? "application/octet-stream" });
});
const fixture = await createReviewFixture();
const data = createTestData();
fixture.store.restoreMutableState(new WorkspaceStore(data).exportMutableState());
fixture.runtime.restorePlayers(data.members.filter((member) => member.position && member.floorId).map((member) => ({
  userId: member.id, floorId: member.floorId!, x: member.position!.x, y: member.position!.y,
  facing: "down", availability: member.availability, connected: member.online,
})));
const login = await fixture.auth.register("maya", "maya@northstar.studio", "northstar", "user-maya");
await context.addCookies([{ name: "whph_session", value: login.sessionToken, url: "http://127.0.0.1", httpOnly: true }]);
await fixture.install(context);
await context.route("**/v1/me/game-guide", (route) => route.fulfill({ json: { status: "completed" } }));
fixture.position(640, 544);
const layout = fixture.store.getLayout("floor-studio")!;
fixture.store.replaceLayout({ ...layout, revision: layout.revision + 1,
  objects: [
    { id: "floor-beside-horizontal", floorId: layout.floorId, assetId: "floor-ceramic", variantId: "ivory", rotation: 0, x: 576, y: 416 },
    { id: "floor-beside-vertical", floorId: layout.floorId, assetId: "floor-ceramic", variantId: "ivory", rotation: 0, x: 800, y: 640 },
  ],
  openings: [], rooms: [], walls: [
  { id: "horizontal", start: { x: 448, y: 448 }, end: { x: 768, y: 448 } },
  { id: "vertical", start: { x: 832, y: 448 }, end: { x: 832, y: 704 } },
] });

try {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await installWorldProbe(page);
  page.setDefaultTimeout(15_000);
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.locator(".world-canvas canvas").waitFor();
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const bonus = page.getByRole("button", { name: "Close daily bonus", exact: true });
  if (await bonus.isVisible()) await bonus.click();
  const game = page.getByRole("button", { name: "Close game", exact: true });
  if (await game.isVisible()) await game.click();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Shared", exact: true }).click();
  await page.getByRole("button", { name: "Erase", exact: true }).click();
  await page.waitForFunction(() => Boolean(globalThis.findAvatar("You")));
  const screenPoint = async (position: { x: number; y: number }) => page.evaluate((point) => {
    const world = globalThis.findAvatar("You")!.parent!.parent!.parent!;
    const global = world.toGlobal(point);
    const canvas = document.querySelector(".world-canvas canvas")!.getBoundingClientRect();
    return { x: global.x + canvas.x, y: global.y + canvas.y };
  }, position);
  const hoverAt = async (point: { x: number; y: number }, name: string) => {
    await page.mouse.move(point.x, point.y);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const screenshot = await page.screenshot({ path: `${output}/${name}.png` });
    const pixels = await sharp(screenshot).extract({ left: Math.round(point.x) - 32, top: Math.round(point.y) - 32, width: 64, height: 64 }).removeAlpha().raw().toBuffer();
    let redPixels = 0;
    for (let index = 0; index < pixels.length; index += 3) {
      if (pixels[index]! > 150 && pixels[index + 1]! < 110 && pixels[index + 2]! < 110) redPixels += 1;
    }
    return { point, redPixels };
  };
  const hover = async (position: { x: number; y: number }, name: string) => hoverAt(await screenPoint(position), name);
  const wallTile = await hover({ x: 608, y: 448 }, "horizontal-over-floor-tile");
  assert(wallTile.redPixels > 20, "The visible horizontal wall should highlight over a floor tile");
  const verticalTile = await hover({ x: 832, y: 672 }, "vertical-over-floor-tile");
  assert(verticalTile.redPixels > 20, "The visible vertical wall should highlight over a floor tile");
  await page.mouse.click(verticalTile.point.x, verticalTile.point.y);
  await page.getByText("Remove wall section?", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  for (const orientation of ["horizontal", "vertical"] as const) {
    for (const offset of [-20, -12, 12, 20]) {
      const position = orientation === "horizontal" ? { x: 704, y: 448 + offset } : { x: 832 + offset, y: 576 };
      const { point, redPixels } = await hover(position, `${orientation}-${offset}`);
      assert.equal(redPixels > 20, Math.abs(offset) === 12, `${orientation} hover at ${offset} world units`);
      if (Math.abs(offset) !== 12) continue;
      await page.mouse.click(point.x, point.y);
      await page.getByText("Remove wall section?", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
  }
  await page.getByRole("button", { name: "Zoom out", exact: true }).click({ clickCount: 2 });
  for (const orientation of ["horizontal", "vertical"] as const) {
    const center = await screenPoint(orientation === "horizontal" ? { x: 704, y: 448 } : { x: 832, y: 576 });
    for (const side of [-1, 1]) {
      const point = orientation === "horizontal" ? { x: center.x, y: center.y + side * 9 } : { x: center.x + side * 9, y: center.y };
      const { redPixels } = await hoverAt(point, `${orientation}-zoomed-${side}`);
      assert(redPixels > 20, `${orientation} should highlight nine screen pixels from either side after zooming out`);
      await page.mouse.click(point.x, point.y);
      await page.getByText("Remove wall section?", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
  }
  const wallTilePoint = await screenPoint({ x: 608, y: 448 });
  await page.mouse.click(wallTilePoint.x, wallTilePoint.y);
  await page.getByText("Remove wall section?", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("button", { name: "Propose project", exact: true }).waitFor();
  const edit = fixture.commands.find((command) => command.type === "project.edit" && command.edit.tool === "erase");
  assert(edit?.type === "project.edit" && edit.edit.tool === "erase");
  assert.equal(edit.edit.wallId, "horizontal");
  const preview = fixture.events.find((event) => event.type === "project.preview" && event.requestId === edit.requestId);
  assert(preview?.type === "project.preview");
  assert.equal(preview.project.layout.walls.some((wall) => wall.id === "horizontal"), false);
  assert.deepEqual(preview.project.layout.objects.map((object) => object.id).sort(), ["floor-beside-horizontal", "floor-beside-vertical"]);
  await page.screenshot({ path: `${output}/wall-section-removed.png` });
  assert.deepEqual(errors, []);
  assert.equal(await page.locator(".world-artwork-error").count(), 0);
  console.log("Verified wall hover and click on both sides, floor tile overlap, and targeted wall removal in Playwright.");
} finally {
  await context.close();
  await fixture.stop();
  await browser.close();
}
