import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { installWorldProbe, worldReady } from "./playwright-animation.js";

const phase = process.argv.includes("--baseline") ? "before" : "after";
const output = fileURLToPath(new URL(`../../artifacts/characters/state-review/${phase}/live/`, import.meta.url));
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors: string[] = [];
const inspected: string[] = [];
await mkdir(output, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await installWorldProbe(page);
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Username or email").fill("maya");
  await page.getByLabel("Password", { exact: true }).fill("northstar");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  for (const name of ["Close game", "Leave game"]) {
    const close = page.getByRole("button", { name, exact: true });
    if (await close.isVisible()) await close.click();
  }
  await worldReady(page);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const closePeople = page.getByRole("button", { name: "Close people", exact: true });
    if (await closePeople.isVisible()) await closePeople.click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${output}/world-${viewport.width}.png` });
    await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".character-editor-actions .primary-button")?.disabled);
    for (const motion of phase === "before" ? ["Idle", "Walk"] : ["Idle", "Walk", "Sit"]) {
      await page.getByRole("button", { name: motion, exact: true }).click();
      await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>(".character-editor-actions .primary-button")?.disabled);
      await page.screenshot({ path: `${output}/creator-${viewport.width}-${motion.toLowerCase()}.png` });
    }
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    inspected.push(`${viewport.width}x${viewport.height}: authenticated world and creator playback; draft cancelled`);
  }
  await context.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ inspected, errors }, null, 2));
}
