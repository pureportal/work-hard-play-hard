import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createArcadeReviewFixture } from "./arcade-review-fixture.js";

const output = resolve("../../artifacts/chess-waiting");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const fixture = createArcadeReviewFixture();

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await fixture.install(context);
  await context.route("**/v1/me/game-guide", (route) => route.fulfill({ json: { status: "completed" } }));
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.locator(".world-canvas canvas").waitFor();
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  const dailyBonus = page.getByRole("button", { name: "Close daily bonus" });
  if (await dailyBonus.count()) await dailyBonus.click();
  const closePeople = page.getByRole("button", { name: "Close people", exact: true });
  if (await closePeople.count()) await closePeople.click();

  fixture.position(1330, 780);
  const chess = page.locator(".chess-lobby");
  await chess.waitFor();
  await chess.getByRole("button", { name: "Players", exact: true }).click();
  await page.screenshot({ path: resolve(output, "before.png") });

  for (const count of [1, 2]) {
    await chess.getByRole("button", { name: "New game" }).click();
    await chess.getByRole("button", { name: "Create game" }).click();
    await page.waitForFunction((expected) => document.querySelectorAll('.chess-lobby [data-match-id]').length === expected, count);
    assert.equal(fixture.store.getChessMatches().filter((match) => match.status === "waiting").length, count);
  }
  await page.screenshot({ path: resolve(output, "two-waiting.png") });
  assert.deepEqual(fixture.events.findLast((event) => event.type === "chess.waiting_updated"), {
    type: "chess.waiting_updated", objectIds: ["object-chess"],
  });

  const [first, second] = fixture.store.getChessMatches();
  await chess.locator(`[data-match-id="${first!.id}"]`).getByRole("button", { name: "Cancel game" }).click();
  await chess.locator(`[data-match-id="${first!.id}"]`).waitFor({ state: "detached" });
  await page.screenshot({ path: resolve(output, "one-waiting.png") });
  assert.deepEqual(fixture.events.findLast((event) => event.type === "chess.waiting_updated"), {
    type: "chess.waiting_updated", objectIds: ["object-chess"],
  });

  await chess.locator(`[data-match-id="${second!.id}"]`).getByRole("button", { name: "Cancel game" }).click();
  await chess.locator(`[data-match-id="${second!.id}"]`).waitFor({ state: "detached" });
  await page.screenshot({ path: resolve(output, "none-waiting.png") });
  assert.deepEqual(fixture.events.findLast((event) => event.type === "chess.waiting_updated"), {
    type: "chess.waiting_updated", objectIds: [],
  });
  await context.close();
} finally {
  fixture.stop();
  await browser.close();
}
