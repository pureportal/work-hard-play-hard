import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { CHARACTER_FACES, CHARACTER_HAIRSTYLES, CHARACTER_OUTFITS, CHARACTER_HEADWEAR } from "../../packages/shared/src/index.js";
import { installAssetFixture } from "../world-assets/playwright-fixture.js";
import { installBuiltAssetClient } from "../world-assets/built-client.js";
import { installWorldProbe, verifyWorldMovement } from "../characters/playwright-animation.js";
import { verifyAvatarEditor } from "./avatar-checks.js";

interface CanvasWork {
  readPixels: number;
  composedPixels: number;
  compositions: number;
  decodes: number;
  decodeErrors: string[];
  longTasks: number[];
}

declare global {
  var performanceProbe: { reset: () => void; result: () => CanvasWork; ready: (selector?: string) => boolean };
}

const output = resolve(fileURLToPath(new URL("../../", import.meta.url)), process.argv[2] ?? "artifacts/performance-2026-09-17/current");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await installBuiltAssetClient(context, process.argv[3]);
const fixture = await installAssetFixture(context, "user-jonas", { x: 640, y: 480 }, { currentPlayerOnly: true });
for (const [index, member] of fixture.store.getMembers().entries()) {
  member.character = {
    face: CHARACTER_FACES[index % CHARACTER_FACES.length]!,
    hairstyle: CHARACTER_HAIRSTYLES[index % CHARACTER_HAIRSTYLES.length]!,
    upperBody: CHARACTER_OUTFITS[index % CHARACTER_OUTFITS.length]!,
    lowerBody: CHARACTER_OUTFITS[(index + 1) % CHARACTER_OUTFITS.length]!,
    shoes: CHARACTER_OUTFITS[(index + 2) % CHARACTER_OUTFITS.length]!,
    headwear: CHARACTER_HEADWEAR[index % CHARACTER_HEADWEAR.length]!,
  };
}
const page = await context.newPage();
await page.addInitScript("globalThis.__name = (value) => value");
await installWorldProbe(page);
await page.addInitScript(() => {
  const drawn = new WeakSet<HTMLCanvasElement>();
  const empty = (): CanvasWork => ({ readPixels: 0, composedPixels: 0, compositions: 0, decodes: 0, decodeErrors: [], longTasks: [] });
  let work = empty();
  const read = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (...args: Parameters<typeof read>) {
    work.readPixels += args[2] * args[3];
    return read.apply(this, args);
  };
  const put = CanvasRenderingContext2D.prototype.putImageData;
  CanvasRenderingContext2D.prototype.putImageData = function (...args: Parameters<typeof put>) {
    work.composedPixels += args[0].width * args[0].height;
    work.compositions++;
    return put.apply(this, args);
  };
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof draw>) {
    drawn.add(this.canvas);
    return draw.apply(this, args);
  };
  const decode = HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode = function () {
    work.decodes++;
    return decode.call(this).catch(error => { work.decodeErrors.push(`${this.src}: ${error.message}`); throw error; });
  };
  const observer = new PerformanceObserver(entries => {
    work.longTasks.push(...entries.getEntries().map(entry => entry.duration));
  });
  observer.observe({ type: "longtask" });
  globalThis.performanceProbe = {
    reset: () => { observer.takeRecords(); work = empty(); },
    result: () => ({ ...work, longTasks: [...work.longTasks, ...observer.takeRecords().map(entry => entry.duration)] }),
    ready: (selector = ".character-editor canvas") => [...document.querySelectorAll<HTMLCanvasElement>(selector)].every(canvas => drawn.has(canvas)),
  };
});
const errors: string[] = [];
page.on("pageerror", error => errors.push(error.message));
const phases: Record<string, unknown> = {};
const session = await context.newCDPSession(page);
await session.send("Performance.enable");
await session.send("Profiler.enable");
try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await page.waitForFunction(() => Boolean(globalThis.findAvatar("You")));
  await page.waitForTimeout(500);
  phases.world = await page.evaluate(() => performanceProbe.result());
  await page.screenshot({ path: resolve(output, "world.png") });
  for (const name of ["Face", "Hair", "Tops", "Headwear"]) {
    await page.evaluate(() => performanceProbe.reset());
    const started = performance.now();
    await session.send("Profiler.start");
    if (name === "Face") await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
    else await page.getByRole("tab", { name, exact: true }).click();
    await page.waitForFunction(() => Boolean(document.querySelector(".character-options canvas")) && performanceProbe.ready());
    const durationMs = performance.now() - started;
    await page.waitForTimeout(100);
    const { profile } = await session.send("Profiler.stop");
    await writeFile(resolve(output, `${name.toLowerCase()}.cpuprofile`), JSON.stringify(profile));
    const work = await page.evaluate(() => performanceProbe.result());
    const { metrics } = await session.send("Performance.getMetrics");
    phases[name] = { ...work, durationMs, heapUsed: metrics.find(metric => metric.name === "JSHeapUsedSize")?.value };
    await page.screenshot({ path: resolve(output, `${name.toLowerCase()}.png`) });
  }
  phases.avatar = await verifyAvatarEditor(page, fixture.store);
  const movement = await verifyWorldMovement(page);
  phases.movement = movement;
  await page.waitForFunction(() => performanceProbe.ready(".avatar-character canvas"));
  phases.portraits = { rendered: await page.locator(".avatar-character canvas").count() };
  phases.reload = await page.evaluate(() => performanceProbe.result());
  for (const phase of Object.values(phases)) {
    if (phase && typeof phase === "object" && "decodeErrors" in phase) assert.deepEqual(phase.decodeErrors, []);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  phases.failure = { message: String(error), body: await page.locator("body").innerText(), work: await page.evaluate(() => performanceProbe.result()) };
  await page.screenshot({ path: resolve(output, "failure.png") });
  throw error;
} finally {
  await writeFile(resolve(output, "measurements.json"), JSON.stringify({ phases, errors }, null, 2) + "\n");
  fixture.stop();
  await browser.close();
}
console.log(JSON.stringify({ phases, errors }, null, 2));
