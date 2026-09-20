import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import { DEFAULT_CHARACTER_APPEARANCE } from "../packages/shared/src/index.js";
import { installBuiltAssetClient } from "./world-assets/built-client.js";
import { installAssetFixture } from "./world-assets/playwright-fixture.js";
import { installWorldProbe } from "./characters/playwright-animation.js";

const sharp = createRequire(new URL("../apps/server/package.json", import.meta.url))("sharp") as typeof import("../apps/server/node_modules/sharp");
const distribution = new URL("../apps/client/dist/", import.meta.url);
const output = new URL("../artifacts/client-loading/", import.meta.url);
await mkdir(output, { recursive: true });
const html = await readFile(new URL("index.html", distribution), "utf8");
const entryPath = html.match(/<script\b[^>]*\bsrc="([^"]+)"/)![1]!;
const entry = entryPath.slice("/assets/".length);
const assets = await readdir(new URL("assets/", distribution));
const imageModule = assets.find(name => /^optimized-images-.*\.js$/.test(name))!;
const worldModule = assets.find(name => /^WorldCanvas-.*\.js$/.test(name))!;
const browser = await chromium.launch({
  headless: true,
  executablePath: puppeteer.executablePath({ headless: "shell" }),
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const checks: string[] = [];

async function verifyContextRestoration(page: Page) {
  const canvas = page.locator(".world-canvas canvas");
  await page.waitForFunction(() => {
    const queue = [globalThis.avatarWorld!.stage];
    for (const node of queue) queue.push(...node.children ?? []);
    const artwork = queue.filter(node => node.label?.startsWith("/world-"));
    return artwork.length > 0 && artwork.every(node => node.visible);
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const avatar = globalThis.findAvatar("You")!;
    let position = avatar.toGlobal({ x: 0, y: 0 });
    let stableFrames = 0;
    const deadline = performance.now() + 10_000;
    while (stableFrames < 5) {
      await new Promise(requestAnimationFrame);
      const next = avatar.toGlobal({ x: 0, y: 0 });
      stableFrames = Math.hypot(next.x - position.x, next.y - position.y) <= 0.01 ? stableFrames + 1 : 0;
      position = next;
      if (performance.now() > deadline) throw new Error("World camera did not settle before context loss");
    }
  });
  const before = await canvas.screenshot({ path: fileURLToPath(new URL("context-before.png", output)) });
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const element = document.querySelector<HTMLCanvasElement>(".world-canvas canvas")!;
    const gl = element.getContext("webgl2")!;
    const extension = gl.getExtension("WEBGL_lose_context")!;
    const timeout = setTimeout(() => reject(new Error("WebGL context did not restore")), 10_000);
    element.addEventListener("webglcontextlost", () => setTimeout(() => extension.restoreContext(), 50), { once: true });
    element.addEventListener("webglcontextrestored", () => {
      clearTimeout(timeout);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }, { once: true });
    extension.loseContext();
  }));
  const after = await canvas.screenshot({ path: fileURLToPath(new URL("context-restored.png", output)) });
  const originalPixels = await sharp(before).ensureAlpha().raw().toBuffer();
  const restoredPixels = await sharp(after).ensureAlpha().raw().toBuffer();
  assert.equal(restoredPixels.length, originalPixels.length);
  let changed = 0;
  for (let index = 0; index < originalPixels.length; index++) {
    if (Math.abs(originalPixels[index]! - restoredPixels[index]!) > 10) changed++;
  }
  const changedRatio = changed / originalPixels.length;
  assert(changedRatio < 0.03, `Restored scene differs from the rendered world (${(changedRatio * 100).toFixed(2)}% of channels changed; expected <3%)`);
  assert.deepEqual(await page.getByRole("alert").allTextContents(), []);
  checks.push("WebGL context and world textures restored without a page reload");
}

try {
  for (const failure of ["artwork", "chunk"] as const) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    await installBuiltAssetClient(context);
    const fixture = await installAssetFixture(context, "user-jonas", { x: 640, y: 480 }, { currentPlayerOnly: true });
    fixture.store.claimDailyReward("user-jonas", "client-loading-daily-bonus");
    fixture.store.updateMemberCharacter("user-jonas", { ...DEFAULT_CHARACTER_APPEARANCE, upperBody: "satin" });
    let navigations = 0;
    let updateChecks = 0;
    let failuresInjected = 0;
    await context.route(url => url.origin === "http://127.0.0.1:5173" && ["/", "/index.html"].includes(url.pathname), async route => {
      if (route.request().isNavigationRequest()) navigations++;
      else updateChecks++;
      const stale = route.request().isNavigationRequest() && navigations === 1;
      await route.fulfill({ contentType: "text/html", body: stale ? html.replaceAll(entry, "index-stale.js") : html });
    });
    await context.route(url => url.origin === "http://127.0.0.1:5173" && url.pathname.startsWith("/assets/") && url.pathname.endsWith(".js"), async route => {
      const name = new URL(route.request().url()).pathname.slice("/assets/".length);
      const stale = navigations === 1;
      if (stale && failure === "chunk" && name === worldModule) {
        failuresInjected++;
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }
      let source = await readFile(new URL(`assets/${name === "index-stale.js" ? entry : name}`, distribution), "utf8");
      if (stale) source = source.replaceAll(entry, "index-stale.js");
      if (stale && failure === "artwork" && name === imageModule) {
        const missing = source.replace(/"\/characters\/blockbench\/upper\/satin\.png":\[[^\]]+\],/, "");
        assert.notEqual(source, missing, "Stale catalogue fixture did not remove satin artwork");
        source = missing;
        failuresInjected++;
      }
      await route.fulfill({ contentType: "text/javascript", body: source });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await installWorldProbe(page);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !document.querySelector('script[src$="index-stale.js"]') && Boolean(globalThis.findAvatar("You")));
      await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
      assert.equal(navigations, 2, `${failure}: expected one recovery reload`);
      assert.equal(updateChecks, 1, `${failure}: expected one update check`);
      assert.equal(failuresInjected, 1, `${failure}: expected the stale asset to fail`);
      assert.deepEqual(await page.getByRole("alert").allTextContents(), [], `${failure}: unexpected alerts after recovery`);
      const unexpected = failure === "chunk" ? errors.filter(error => !error.includes("Failed to fetch dynamically imported module")) : errors;
      assert.deepEqual(unexpected, []);
      checks.push(`${failure}: stale client recovered automatically and loaded the satin avatar`);
      if (failure === "artwork") {
        await verifyContextRestoration(page);
        assert.equal(navigations, 2, "WebGL restoration must not reload the page");
      }
    } finally {
      fixture.stop();
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(new URL("results.json", output), `${JSON.stringify({ checks }, null, 2)}\n`);
}
for (const check of checks) console.log(check);
