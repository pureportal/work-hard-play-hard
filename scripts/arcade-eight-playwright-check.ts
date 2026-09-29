import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { ARCADE_GAMES, getGameArea } from "../packages/shared/src/index.js";
import { createArcadeReviewFixture } from "./arcade-review-fixture.js";

process.env.ARCADE_PRODUCTION = "1";

const output = resolve("../../artifacts/arcade-eight");
await mkdir(output, { recursive: true });
const fixture = createArcadeReviewFixture();
const reference = fixture.store.getObject("object-chess")!;
const layout = fixture.store.getLayout(reference.floorId)!;
const tables = ARCADE_GAMES.map((game, index) => ({
  ...reference,
  id: `review-${game.id}`,
  assetId: game.assetId,
  variantId: "violet",
  label: game.name,
  x: 1584 + index % 2 * 160,
  y: 352 + Math.floor(index / 2) * 160,
}));
layout.objects.push(...tables);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await fixture.install(desktopContext, "user-leo");
await fixture.install(mobileContext, "user-maya");
const desktop = await desktopContext.newPage();
const mobile = await mobileContext.newPage();
const errors: string[] = [];
for (const page of [desktop, mobile]) {
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.locator(".world-canvas canvas").waitFor();
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
}

async function lobby(page: Page, gameId: string) {
  const table = tables.find((entry) => entry.id === `review-${gameId}`)!;
  const area = getGameArea(table);
  const userId = page === mobile ? "user-maya" : "user-leo";
  const reached = [[-90, 0], [90, 0], [0, 90], [0, -90]].some(([dx, dy]) => {
    fixture.position(area.x + dx!, area.y + dy!, userId);
    const player = fixture.runtime.serializePlayers().find((entry) => entry.userId === userId)!;
    return Math.hypot(player.x - area.x, player.y - area.y) < area.radius;
  });
  assert(reached, `${table.label}: no reachable interaction position`);
  const bonus = page.getByRole("button", { name: "Close daily bonus" });
  if (await bonus.count()) await bonus.click();
  await page.waitForFunction(({ objectId, name }) => Boolean(document.querySelector(`select[aria-label="Active interaction"] option[value="${objectId}"]`))
    || document.querySelector(".arcade-new-lobby h2")?.textContent === name, { objectId: table.id, name: table.label });
  const panel = page.locator(".arcade-new-lobby");
  if (await panel.count() === 0 || await panel.locator("h2").textContent() !== table.label) {
    await page.getByRole("combobox", { name: "Active interaction" }).selectOption(table.id);
  }
  await panel.getByRole("heading", { name: table.label }).waitFor();
  return panel;
}

async function checkLayout(page: Page, gameId: string) {
  const metrics = await page.evaluate(() => {
    const dialog = document.querySelector(".arcade-new-game")!.getBoundingClientRect();
    return { pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, dialog: { x: dialog.x, y: dialog.y, width: dialog.width, height: dialog.height }, viewportHeight: innerHeight };
  });
  assert(metrics.pageWidth <= metrics.viewportWidth + 1, `${gameId}: page overflow`);
  assert(metrics.dialog.x >= 0 && metrics.dialog.y >= 0 && metrics.dialog.x + metrics.dialog.width <= metrics.viewportWidth + 1 && metrics.dialog.y + metrics.dialog.height <= metrics.viewportHeight + 1, `${gameId}: dialog outside viewport`);
  await page.screenshot({ path: resolve(output, `${gameId}-${metrics.viewportWidth}.png`), animations: "disabled" });
}

try {
  for (const game of ARCADE_GAMES.filter((entry) => entry.id !== "game-sketch-guess")) {
    const panel = await lobby(mobile, game.id);
    await panel.getByRole("button", { name: "Play" }).click();
    const dialog = mobile.getByRole("dialog", { name: game.name });
    await dialog.waitFor();
    await checkLayout(mobile, game.id);
    const before = fixture.commands.filter((command) => command.type === "game.command").length;
    if (game.id === "game-minefield-relay") await dialog.getByRole("button", { name: "Reveal row 1, column 1" }).click();
    if (game.id === "game-memory-sprint") {
      await mobile.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.arcade-new-game button[aria-label="Pad 1"]')?.disabled);
      await dialog.getByRole("button", { name: "Pad 1" }).click();
    }
    if (game.id === "game-territory-rush") await dialog.locator(".arcade-cell.is-available").first().click();
    if (game.id === "game-bomb-arena") await dialog.getByRole("button", { name: "Bomb" }).tap();
    if (game.id === "game-snake-scramble") await dialog.getByRole("button", { name: "up" }).tap();
    if (game.id === "game-mini-golf") await dialog.locator(".arcade-golf svg").tap({ position: { x: 180, y: 100 } });
    if (game.id === "game-space-defense") await dialog.getByRole("button", { name: "Fire" }).tap();
    await mobile.waitForTimeout(250);
    assert(fixture.commands.filter((command) => command.type === "game.command").length > before, `${game.name}: no gameplay command`);
    await dialog.getByRole("button", { name: "Close game" }).click();
    const leave = dialog.getByRole("button", { name: "Leave game" });
    if (await leave.count()) await leave.click();
    await dialog.waitFor({ state: "hidden" });
    console.log(`${game.name}: mobile round and input`);
  }

  await lobby(desktop, "game-sketch-guess");
  const panel = await lobby(mobile, "game-sketch-guess");
  await panel.getByRole("button", { name: "Play" }).waitFor({ state: "visible" });
  await panel.getByRole("button", { name: "Play" }).click();
  await mobile.getByRole("dialog", { name: "Sketch & Guess" }).waitFor();
  await desktop.getByRole("dialog", { name: "Sketch & Guess" }).waitFor();
  await checkLayout(mobile, "game-sketch-guess");
  await checkLayout(desktop, "game-sketch-guess");
  const drawer = await desktop.locator(".arcade-palette").count() ? desktop : mobile;
  const guesser = drawer === desktop ? mobile : desktop;
  const canvas = drawer.locator(".arcade-sketch-canvas");
  const bounds = await canvas.boundingBox();
  assert(bounds);
  await drawer.mouse.move(bounds.x + 30, bounds.y + 30);
  await drawer.mouse.down();
  await drawer.mouse.move(bounds.x + 100, bounds.y + 100, { steps: 5 });
  await drawer.mouse.up();
  const prompt = (await drawer.locator(".arcade-sketch-status").textContent())!.trim();
  await guesser.getByRole("textbox", { name: "Your guess" }).fill(prompt);
  await guesser.getByRole("button", { name: "Guess" }).click();
  await guesser.locator(".arcade-score-strip strong").filter({ hasNotText: "0" }).first().waitFor();
  console.log("Sketch & Guess: multiplayer drawing and guess");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  fixture.stop();
}
