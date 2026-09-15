import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import { DEFAULT_CHARACTER_APPEARANCE } from "../../packages/shared/src/index.js";
import { createReviewFixture } from "../application-review/fixture.js";

const output = fileURLToPath(new URL("../../artifacts/characters/state-review/after/recovery/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors: string[] = [];
const inspected: string[] = [];

async function ready(page: Page) {
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".character-editor-actions .primary-button")?.disabled);
}

async function previewFrames(page: Page) {
  return page.locator(".character-stage canvas").evaluate(async (element) => {
    const canvas = element as HTMLCanvasElement;
    const images = new Set<string>();
    const start = performance.now();
    while (performance.now() - start < 600) {
      images.add(canvas.toDataURL());
      await new Promise(requestAnimationFrame);
    }
    return images.size;
  });
}

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 320, height: 568 }]) {
    const fixture = await createReviewFixture();
    fixture.store.updateMemberCharacter("user-maya", { ...DEFAULT_CHARACTER_APPEARANCE });
    const context = await browser.newContext({ viewport });
    await fixture.install(context, "maya");
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
      await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
      await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
      await ready(page);
      await page.route("**/characters/blockbench/hair/ponytail.png", (route) => route.abort("failed"));
      await page.getByRole("tab", { name: "Hair", exact: true }).click();
      await page.getByRole("button", { name: "Lavender ponytail", exact: true }).click();
      await page.locator(".character-preview-error").waitFor();
      assert(await page.getByRole("button", { name: "Use character", exact: true }).isDisabled());
      await page.screenshot({ path: `${output}/${viewport.width}-artwork-error.png` });
      await page.unroute("**/characters/blockbench/hair/ponytail.png");
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await ready(page);
      assert.equal(await page.locator(".character-preview-error").count(), 0);
      await page.getByRole("button", { name: "Walk", exact: true }).click();
      await ready(page);
      assert(await previewFrames(page) >= 4);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      assert.equal(await previewFrames(page), 1);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      assert(await previewFrames(page) >= 4);
      await page.route("**/v1/members/me/character", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Connection lost. Try again." }) }));
      await page.getByRole("button", { name: "Use character", exact: true }).click();
      await page.locator(".avatar-dialog-error").waitFor();
      assert.equal(await page.getByRole("button", { name: "Lavender ponytail", exact: true }).getAttribute("aria-pressed"), "true");
      await page.screenshot({ path: `${output}/${viewport.width}-save-error.png` });
      await page.unroute("**/v1/members/me/character");
      await page.getByRole("button", { name: "Use character", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(fixture.store.getMember("user-maya")!.character.hairstyle, "ponytail");
      inspected.push(`${viewport.width}x${viewport.height}: artwork failure disables saving, Retry loads the draft, reduced-motion changes freeze/resume playback, failed saves retain the draft and retry successfully; failures injected`);
    } finally {
      await context.close();
      await fixture.stop();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ inspected, errors }, null, 2));
}
