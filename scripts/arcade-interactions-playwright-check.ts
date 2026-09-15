import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { createArcadeReviewFixture } from "./arcade-review-fixture.js";

const output = resolve(process.env.ARCADE_SCREENSHOTS ?? "../../artifacts/game-presentation/interactions");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const fixture = createArcadeReviewFixture();
const issues: string[] = [];
const pages: Page[] = [];

async function capture(page: Page, name: string) {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 12; frame++) await new Promise<void>((done) => requestAnimationFrame(() => done()));
  });
  await page.screenshot({ path: resolve(output, `${name}.png`), animations: "disabled" });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}

async function area(page: Page, id: string, selector: string) {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 20; frame++) await new Promise<void>((done) => requestAnimationFrame(() => done()));
  });
  await page.waitForFunction(({ id, selector }) => Boolean(document.querySelector(selector))
    || Boolean(document.querySelector(`select[aria-label="Active interaction"] option[value="${id}"]`)), { id, selector });
  if (!await page.locator(selector).isVisible()) await page.getByRole("combobox", { name: "Active interaction" }).selectOption(id);
  await page.locator(selector).waitFor();
}

async function leave(page: Page, label = "Forfeit game") {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "Leave game", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}

async function turn(page: Page, cell: number) {
  await page.locator(".tic-tac-toe-status").filter({ hasText: "Your turn" }).waitFor();
  await page.locator('.tic-tac-toe-game button[role="gridcell"]').nth(cell).click();
}

try {
  for (const userId of ["user-maya", "user-leo"]) {
    const context = await browser.newContext({ viewport: userId === "user-leo" ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: true });
    await fixture.install(context, userId);
    const page = await context.newPage();
    pages.push(page);
    page.setDefaultTimeout(20_000);
    page.on("pageerror", (error) => issues.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") issues.push(message.text()); });
    await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
    await page.locator(".world-canvas canvas").waitFor();
    await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
    const closePeople = page.getByRole("button", { name: "Close people", exact: true });
    if (await closePeople.count()) await closePeople.click();
  }
  const [maya, leo] = pages as [Page, Page];
  for (const player of fixture.runtime.serializePlayers()) {
    fixture.position(player.userId === "user-maya" ? 1248 : player.userId === "user-leo" ? 1256 : 100,
      player.userId === "user-maya" ? 640 : player.userId === "user-leo" ? 636 : 100, player.userId);
  }
  await area(maya, "object-falling-blocks", ".falling-blocks-lobby");
  await maya.locator(".falling-blocks-lobby").getByRole("button", { name: "Players", exact: true }).click();
  await maya.locator(".falling-blocks-lobby").getByRole("button", { name: "Play", exact: true }).click();
  await leo.locator(".falling-blocks-game").waitFor();
  await leo.getByRole("button", { name: "Show controls", exact: true }).click();
  assert.equal(await maya.getByRole("button", { name: "Pause", exact: true }).count(), 0);
  await capture(maya, "falling-blocks-multiplayer");
  await capture(leo, "falling-blocks-multiplayer-mobile");
  await leave(maya, "Close game");
  for (let drop = 0; drop < 40 && await leo.locator(".falling-blocks-controls").count(); drop++) {
    const score = await leo.locator(".falling-blocks-stats .score dd").textContent();
    await leo.getByRole("button", { name: "Drop", exact: true }).tap();
    await leo.waitForFunction((previous) => !document.querySelector(".falling-blocks-controls")
      || document.querySelector(".falling-blocks-stats .score dd")?.textContent !== previous, score);
  }
  await leo.locator(".game-result-actions").waitFor();
  await capture(leo, "falling-blocks-result");
  await leo.getByRole("button", { name: "Back to lobby", exact: true }).click();

  await area(maya, "object-tic-tac-toe", ".tic-tac-toe-lobby");
  await maya.locator(".tic-tac-toe-lobby").getByRole("button", { name: "Players", exact: true }).click();
  await maya.locator(".tic-tac-toe-lobby").getByRole("button", { name: "Play", exact: true }).click();
  for (const [page, cell] of [[maya, 0], [leo, 3], [maya, 1], [leo, 4], [maya, 2]] as const) await turn(page, cell);
  await maya.locator(".tic-tac-toe-status").filter({ hasText: "You win" }).waitFor();
  assert.equal(await maya.locator(".tic-tac-toe-board > .is-winning").count(), 3);
  await capture(maya, "classic-winning-line");
  for (const page of pages) await page.getByRole("button", { name: "Back to lobby", exact: true }).click();

  await area(maya, "object-tic-tac-toe", ".tic-tac-toe-lobby");
  await maya.locator(".tic-tac-toe-lobby").getByRole("button", { name: "Players", exact: true }).click();
  await maya.locator(".tic-tac-toe-lobby").getByRole("button", { name: "Stacking", exact: true }).click();
  await maya.locator(".tic-tac-toe-lobby").getByRole("button", { name: "Play", exact: true }).click();
  await turn(maya, 4);
  await turn(leo, 0);
  await maya.getByRole("group", { name: "Pieces", exact: true }).getByRole("button", { name: "Large, 2 remaining" }).click();
  await turn(maya, 0);
  await turn(leo, 8);
  await maya.getByRole("group", { name: "Pieces", exact: true }).getByRole("button", { name: "Move", exact: true }).click();
  await turn(maya, 0);
  await turn(maya, 1);
  await maya.getByRole("gridcell", { name: "top left: Small O", exact: true }).waitFor();
  await maya.getByRole("gridcell", { name: "top center: Large X", exact: true }).waitFor();
  await capture(maya, "stacking-uncovered-piece");
  await leave(maya);
  await leo.getByRole("button", { name: "Back to lobby", exact: true }).click();

  fixture.position(1330, 780);
  fixture.position(1472, 800, "user-leo");
  await Promise.all(pages.map((page) => area(page, "object-chess", ".chess-lobby")));
  await maya.locator(".chess-lobby").getByRole("button", { name: "Players", exact: true }).click();
  await maya.getByRole("button", { name: "New game", exact: true }).click();
  await maya.locator(".chess-control-options label").filter({ hasText: "Rapid" }).click();
  await maya.locator(".chess-access-options label").filter({ hasText: "Locked" }).click();
  await maya.locator(".chess-opponent-field select").selectOption("user-leo");
  await capture(maya, "chess-invitation-setup");
  await maya.getByRole("button", { name: "Create game", exact: true }).click();
  await leo.getByRole("button", { name: "Join", exact: true }).click();
  await maya.locator(".chess-match-list").getByRole("button", { name: "Play game", exact: true }).click();
  await Promise.all(pages.map((page) => page.locator(".chess-game").waitFor()));
  assert.equal(await maya.locator(".chess-player-bar time").count(), 2);
  const moves = [["a2", "a4"], ["h7", "h5"], ["a4", "a5"], ["h5", "h4"], ["a5", "a6"], ["h4", "h3"], ["a6", "b7"], ["h3", "g2"]];
  for (let index = 0; index < moves.length; index++) {
    const page = pages[index % 2]!;
    const [from, to] = moves[index]!;
    await page.locator(".chess-status strong").filter({ hasText: "Your move" }).waitFor();
    await page.locator(`.chess-square[data-square="${from}"]`).click();
    await page.locator(`.chess-square[data-square="${to}"]`).click();
  }
  await maya.locator(".chess-status strong").filter({ hasText: "Your move" }).waitFor();
  await maya.locator('.chess-square[data-square="b7"]').click();
  await maya.locator('.chess-square[data-square="a8"]').click();
  await maya.getByRole("dialog", { name: "Choose promotion" }).waitFor();
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
    await maya.setViewportSize({ width: width!, height: height! });
    await capture(maya, `chess-promotion-${width}x${height}`);
    const box = await maya.locator(".chess-promotion-picker").boundingBox();
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width! && box.y + box.height <= height!);
  }
  await maya.setViewportSize({ width: 390, height: 844 });
  await maya.getByRole("button", { name: "Promote to knight", exact: true }).tap();
  await maya.getByRole("gridcell", { name: "white knight on a8", exact: true }).waitFor();
  await maya.getByRole("button", { name: "Offer draw", exact: true }).click();
  await leo.getByRole("button", { name: "Decline", exact: true }).click();
  await leo.getByRole("button", { name: "Offer draw", exact: true }).click();
  await maya.getByRole("button", { name: "Accept", exact: true }).waitFor();
  await capture(maya, "chess-draw-mobile");
  await maya.getByRole("button", { name: "Accept", exact: true }).click();
  await maya.locator(".chess-status strong").filter({ hasText: "Draw" }).waitFor();
  await capture(maya, "chess-draw-result");
  assert.deepEqual(fixture.events.filter((event) => event.type === "command.error"), []);
  assert.deepEqual(issues, []);
  console.log("Passed: two-player Falling Blocks result, Classic win, Stacking cover/move/reveal, Chess invitations, clocks, promotion, draw decline and acceptance.");
} catch (error) {
  for (const [index, page] of pages.entries()) {
    await capture(page, `failure-${index}`);
    console.error(await page.locator("body").innerText());
  }
  throw error;
} finally {
  await browser.close();
  fixture.stop();
  await writeFile(resolve(output, "results.json"), JSON.stringify({ issues, commands: fixture.commands.map((command) => command.type), errors: fixture.events.filter((event) => event.type === "command.error") }, null, 2));
}
