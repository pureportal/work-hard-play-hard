import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { createArcadeReviewFixture } from "./arcade-review-fixture.js";

const output = resolve("../../artifacts/game-lobbies");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const issues: string[] = [];

async function area(page: Page, id: string, selector: string) {
  await page.evaluate(async () => { for (let frame = 0; frame < 25; frame++) await new Promise<void>((done) => requestAnimationFrame(() => done())); });
  await page.waitForFunction(({ gameId, selector }) => Boolean(document.querySelector(`select[aria-label="Active interaction"] option[value="${gameId}"]`))
    || Boolean(document.querySelector(selector)), { gameId: id, selector });
  if (!await page.locator(selector).isVisible()) await page.getByRole("combobox", { name: "Active interaction" }).selectOption(id);
  await page.locator(selector).waitFor();
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: resolve(output, `${name}.png`), animations: "disabled" });
  const geometry = await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>(".game-statistics-dialog, .interaction-panel");
    const box = element?.getBoundingClientRect();
    return { viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, left: box?.left, right: box?.right, elementWidth: element?.clientWidth, contentWidth: element?.scrollWidth };
  });
  assert(geometry.pageWidth <= geometry.viewport, `${name}: page overflow`);
  assert((geometry.left ?? 0) >= -1 && (geometry.right ?? 0) <= geometry.viewport + 1, `${name}: panel bounds`);
  assert((geometry.contentWidth ?? 0) <= (geometry.elementWidth ?? 0) + 1, `${name}: panel overflow`);
}

try {
  for (const [width, height] of [[400, 621], [1440, 900]] as const) {
    const fixture = createArcadeReviewFixture();
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await fixture.install(context);
    await context.route("**/v1/me/game-guide", (route) => route.fulfill({ json: { status: "completed" } }));
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.on("pageerror", (error) => issues.push(error.message));
    try {
      await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
      await page.locator(".world-canvas canvas").waitFor();
      await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
      if (width === 400) await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
      const dailyBonus = page.getByRole("button", { name: "Close daily bonus" });
      if (await dailyBonus.count()) await dailyBonus.click();
      const closePeople = page.getByRole("button", { name: "Close people", exact: true });
      if (await closePeople.count()) await closePeople.click();

      fixture.position(1248, 640);
      await area(page, "object-falling-blocks", ".falling-blocks-lobby");
      const falling = page.locator(".falling-blocks-lobby");
      await capture(page, `${width}-falling-lobby`);
      await falling.getByRole("button", { name: "Sudden death" }).click();
      await falling.getByRole("button", { name: "Players", exact: true }).click();
      await falling.getByRole("combobox", { name: "Attack target" }).selectOption("fewest-stones");
      assert.equal(await falling.getByRole("button", { name: "Waiting for player" }).isDisabled(), true);
      await falling.getByRole("button", { name: "Statistics" }).click();
      await capture(page, `${width}-falling-stats`);
      await page.getByRole("tab", { name: "Rankings" }).click();
      await capture(page, `${width}-falling-rankings`);
      await page.getByRole("tab", { name: "History" }).click();
      await capture(page, `${width}-falling-history`);
      await page.keyboard.press("Escape");
      await page.locator(".game-statistics-dialog").waitFor({ state: "hidden" });

      await area(page, "object-tic-tac-toe", ".tic-tac-toe-lobby");
      const tic = page.locator(".tic-tac-toe-lobby");
      await capture(page, `${width}-tic-lobby`);
      await tic.getByRole("button", { name: "Hard", exact: true }).click();
      await tic.getByRole("button", { name: "Ultimate", exact: true }).click();
      await tic.getByRole("button", { name: "Statistics" }).click();
      await capture(page, `${width}-tic-stats`);
      await page.getByRole("tab", { name: "Rankings" }).click();
      await capture(page, `${width}-tic-rankings`);
      await page.getByRole("button", { name: "Close statistics" }).click();
      await tic.getByRole("button", { name: "Play", exact: true }).click();
      await page.locator(".tic-tac-toe-game").waitFor();
      assert(fixture.commands.some((command) => command.type === "game.start" && command.definitionId === "game-tic-tac-toe" && command.variantId === "ultimate"));
      await page.getByRole("button", { name: "Forfeit game" }).click();
      await page.getByRole("button", { name: "Leave game" }).click();

      fixture.position(1330, 780);
      await area(page, "object-chess", ".chess-lobby");
      const chess = page.locator(".chess-lobby");
      await capture(page, `${width}-chess-lobby`);
      await chess.getByRole("button", { name: "Statistics" }).click();
      await capture(page, `${width}-chess-stats`);
      await page.getByRole("tab", { name: "Rankings" }).click();
      await capture(page, `${width}-chess-rankings`);
      await page.getByRole("button", { name: "Close statistics" }).click();
      await chess.getByRole("button", { name: "Players", exact: true }).click();
      await chess.getByRole("button", { name: "New game" }).click();
      await capture(page, `${width}-chess-setup`);
      await chess.getByRole("radio", { name: /24 hours/ }).check();
      await chess.getByRole("checkbox", { name: "Pause weekends (UTC)" }).check();
      await chess.getByRole("radio", { name: "Locked" }).check();
      await chess.getByRole("combobox", { name: "Opponent" }).selectOption("user-leo");
      await chess.getByRole("button", { name: "Create game" }).click();
      await chess.getByRole("heading", { name: "Your games" }).waitFor();
      await capture(page, `${width}-chess-games`);
      await chess.getByRole("button", { name: "Cancel game" }).click();
      assert(fixture.commands.some((command) => command.type === "chess.match_cancel"));
    } catch (error) {
      await page.screenshot({ path: resolve(output, `${width}-failure.png`) });
      console.error((await page.locator("body").innerText()).slice(0, 2000));
      console.error(issues);
      throw error;
    } finally {
      await context.close();
      fixture.stop();
    }
  }
  assert.deepEqual(issues, []);
  console.log("Game lobby Playwright checks passed.");
} finally {
  await browser.close();
}
