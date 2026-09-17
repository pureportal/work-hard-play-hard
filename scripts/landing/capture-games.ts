import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { createArcadeReviewFixture } from "../arcade-review-fixture.js";

const output = fileURLToPath(new URL("../../apps/landing/artwork/", import.meta.url));
process.env.ARCADE_PRODUCTION = "1";
process.env.ARCADE_BUILD_DIR = fileURLToPath(new URL("../../artifacts/landing-redesign/game-client/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath({ headless: "shell" }) });
const fixture = createArcadeReviewFixture();
const errors: string[] = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  await fixture.install(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) console.error(response.status(), response.url()); });
  page.on("requestfailed", request => console.error("Request failed", request.url(), request.failure()));
  page.on("console", message => { if (message.type() === "error") console.error(message.text()); });
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await page.locator(".world-canvas canvas").waitFor();
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.isVisible()) await people.click();
  fixture.position(1248, 640);
  for (const [id, name] of [["falling-blocks", "falling-blocks"], ["tic-tac-toe", "tic-tac-toe"]] as const) {
    const lobby = page.locator(`.${id}-lobby`);
    await page.waitForFunction(id => Boolean(document.querySelector(`select[aria-label="Active interaction"] option[value="object-${id}"]`)) || Boolean(document.querySelector(`.${id}-lobby`)), id);
    if (!await lobby.isVisible()) await page.getByRole("combobox", { name: "Active interaction" }).selectOption(`object-${id}`);
    if (id === "tic-tac-toe") await lobby.getByRole("button", { name: "Classic", exact: true }).click();
    await lobby.getByRole("button", { name: "Play", exact: true }).click();
    const game = page.locator(`.${id}-game`);
    await game.waitFor();
    if (id === "falling-blocks") {
      for (const keys of [["ArrowLeft", "ArrowLeft", "ArrowLeft"], ["ArrowRight", "ArrowRight", "ArrowUp"], ["ArrowLeft"], ["ArrowRight", "ArrowRight", "ArrowRight"], ["ArrowUp"], ["ArrowLeft", "ArrowLeft"]]) {
        for (const key of keys) await page.keyboard.press(key);
        await page.keyboard.press("Space");
      }
    } else {
      await game.locator('button[role="gridcell"]:not(:disabled)').first().click();
      await page.getByRole("status").filter({ hasText: "Your turn" }).waitFor();
      await game.locator('button[role="gridcell"]:not(:disabled)').last().click();
      await page.getByRole("status").filter({ hasText: "Your turn" }).waitFor();
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (let frame = 0; frame < 10; frame++) await new Promise(requestAnimationFrame);
    });
    await game.screenshot({ path: `${output}/${name}.png` });
    await page.getByRole("button", { name: id === "tic-tac-toe" ? "Forfeit game" : "Close game", exact: true }).click();
    await page.getByRole("button", { name: "Leave game", exact: true }).click();
    await game.waitFor({ state: "hidden" });
    console.log(`Captured ${name} from the compiled client with an isolated game fixture.`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(fixture.events.filter(event => event.type === "command.error"), []);
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      console.error(await page.locator("body").innerText(), errors);
    }
  }
  throw error;
} finally {
  await browser.close();
  fixture.stop();
}
