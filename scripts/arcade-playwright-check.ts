import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { createArcadeReviewFixture } from "./arcade-review-fixture.js";

const output = resolve(process.env.ARCADE_SCREENSHOTS ?? "../../artifacts/game-presentation/after");
const baseline = process.env.ARCADE_BASELINE === "1";
const sizes = [[1440, 1000], [390, 844], [320, 568], [844, 390]] as const;
const issues: string[] = [];
const layouts: unknown[] = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });

async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 20; frame++) await new Promise<void>((done) => requestAnimationFrame(() => done()));
  });
}

async function capture(page: Page, name: string) {
  await settle(page);
  await page.screenshot({ path: resolve(output, `${name}.png`), animations: "disabled" });
  const measurements = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const board = document.querySelector<HTMLElement>(".falling-blocks-board, .chess-board, .tic-tac-toe-board, .tic-tac-toe-ultimate-board");
    const elements = [dialog, board, ...document.querySelectorAll<HTMLButtonElement>(".falling-blocks-controls button, [role=dialog] > header .icon-button, .tic-tac-toe-header-actions button")];
    const bounds = elements.map((element) => {
      if (!element || !element.checkVisibility()) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
        name: element.ariaLabel ?? element.textContent };
    });
    return { viewport: { width: innerWidth, height: innerHeight }, pageOverflow: document.documentElement.scrollWidth > innerWidth,
      dialog: bounds[0], board: bounds[1], controls: bounds.slice(2).filter((box) => box !== null),
      chessColumns: [...document.querySelectorAll(".chess-game-content > div, .chess-game-content > aside")].map((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      }) };
  });
  layouts.push({ name, ...measurements });
  assert.equal(measurements.pageOverflow, false, name);
  if (!baseline && measurements.dialog) {
    const { dialog, viewport, board } = measurements;
    assert(dialog.x >= 0 && dialog.y >= 0 && dialog.x + dialog.width <= viewport.width + 1 && dialog.y + dialog.height <= viewport.height + 1, `${name}: dialog bounds`);
    assert(dialog.scrollWidth <= dialog.clientWidth + 1, `${name}: dialog overflow`);
    if (board) assert(board.x >= dialog.x && board.x + board.width <= dialog.x + dialog.width + 1, `${name}: board bounds`);
    const [boardColumn, sidebar] = measurements.chessColumns;
    if (boardColumn && sidebar && Math.abs(boardColumn.x - sidebar.x) < 1) {
      assert(boardColumn.y + boardColumn.height <= sidebar.y + 1, `${name}: chess sections overlap`);
    }
    for (const control of measurements.controls) {
      assert(control.width! >= 40 && control.height! >= 40, `${name}: target ${control.name}`);
      assert(control.y! >= 0 && control.y! + control.height! <= viewport.height + 1, `${name}: visible ${control.name}`);
    }
  }
}

async function chooseArea(page: Page, id: string, lobby: string) {
  await page.waitForFunction(({ id, lobby }) => Boolean(document.querySelector(`select[aria-label="Active interaction"] option[value="${id}"]`)) || Boolean(document.querySelector(lobby)), { id, lobby });
  const selector = page.getByRole("combobox", { name: "Active interaction" });
  if (!await page.locator(lobby).isVisible()) await selector.selectOption(id);
  await page.locator(lobby).waitFor();
}

async function leaveGame(page: Page, forfeit = false) {
  await page.getByRole("button", { name: forfeit ? "Forfeit game" : "Close game", exact: true }).click();
  await page.getByRole("button", { name: "Leave game", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}

try {
  for (const [width, height] of sizes) {
    if (process.env.ARCADE_VIEWPORTS && !process.env.ARCADE_VIEWPORTS.split(",").includes(`${width}x${height}`)) continue;
    for (const theme of ["light", "dark"] as const) {
      const fixture = createArcadeReviewFixture();
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000, deviceScaleFactor: 1 });
      await fixture.install(context);
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      page.on("pageerror", (error) => issues.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") issues.push(message.text()); });
      const prefix = `${width}x${height}-${theme}`;
      try {
        await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
        await page.locator(".world-canvas canvas").waitFor();
        await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
        await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, theme);
        const closePeople = page.getByRole("button", { name: "Close people", exact: true });
        if (await closePeople.count()) await closePeople.click();
        fixture.position(1248, 640);
        await settle(page);
        await chooseArea(page, "object-falling-blocks", ".falling-blocks-lobby");
        await capture(page, `${prefix}-lobby`);
        await page.locator(".falling-blocks-lobby").getByRole("button", { name: "Play", exact: true }).click();
        await page.locator(".falling-blocks-game").waitFor();
        for (const name of ["Move left", "Rotate", "Move right", "Soft drop", "Hold", "Drop"]) {
          await page.locator(".falling-blocks-controls").getByRole("button", { name, exact: true }).click();
        }
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("Space");
        await capture(page, `${prefix}-falling-blocks`);
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
        await capture(page, `${prefix}-paused`);
        await page.getByRole("button", { name: "Resume", exact: true }).click();
        await page.getByRole("button", { name: "Close game", exact: true }).click();
        await capture(page, `${prefix}-exit`);
        await page.locator(".game-exit-prompt").getByRole("button", { name: "Keep playing", exact: true }).click();
        await leaveGame(page);

        for (const variant of ["Classic", "Ultimate", "Stacking"]) {
          await chooseArea(page, "object-tic-tac-toe", ".tic-tac-toe-lobby");
          const lobby = page.locator(".tic-tac-toe-lobby");
          await lobby.getByRole("button", { name: variant, exact: true }).click();
          if (variant === "Classic") await capture(page, `${prefix}-tic-tac-toe-lobby`);
          await lobby.getByRole("button", { name: "Play", exact: true }).click();
          await page.locator(".tic-tac-toe-game").waitFor();
          if (variant === "Stacking") await page.getByRole("group", { name: "Pieces", exact: true }).getByRole("button", { name: "Large, 2 remaining" }).click();
          await page.locator('.tic-tac-toe-game button[role="gridcell"]:not(:disabled)').first().click();
          await page.getByRole("status").filter({ hasText: "Your turn" }).waitFor();
          await capture(page, `${prefix}-${variant.toLowerCase()}`);
          await page.getByRole("button", { name: "Rules", exact: true }).click();
          await capture(page, `${prefix}-${variant.toLowerCase()}-rules`);
          await page.getByRole("button", { name: "Rules", exact: true }).click();
          await leaveGame(page, true);
        }

        fixture.position(1330, 780);
        await settle(page);
        await chooseArea(page, "object-chess", ".chess-lobby");
        await capture(page, `${prefix}-chess-lobby`);
        await page.locator(".chess-lobby").getByRole("button", { name: "Play", exact: true }).click();
        await page.locator(".chess-game").waitFor();
        await page.getByRole("gridcell", { name: "white pawn on e2", exact: true }).click();
        await capture(page, `${prefix}-chess-selected`);
        await page.getByRole("gridcell", { name: "e4", exact: true }).click();
        await page.waitForFunction(() => [...document.querySelectorAll(".chess-moves strong")].filter((node) => node.textContent).length === 2);
        await capture(page, `${prefix}-chess`);
        await page.getByRole("button", { name: "Close chess", exact: true }).click();
        await chooseArea(page, "object-chess", ".chess-lobby");
        await page.locator(".chess-lobby").getByRole("button", { name: "Resume", exact: true }).click();
        await page.locator(".chess-game-actions").getByRole("button", { name: "Resign", exact: true }).click();
        await page.locator(".chess-resign-confirmation").getByRole("button", { name: "Resign", exact: true }).click();
        await page.locator(".game-result-actions").waitFor();
        await capture(page, `${prefix}-chess-result`);
        await page.getByRole("button", { name: "Play again", exact: true }).click();
        await page.locator(".game-result-actions").waitFor({ state: "hidden" });
        await page.getByRole("button", { name: "Close chess", exact: true }).click();
        assert.deepEqual(fixture.events.filter((event) => event.type === "command.error"), []);
        console.log(`${prefix}: game controls, bot replies, rules, exit, chess resume and replay passed`);
      } catch (error) {
        await page.screenshot({ path: resolve(output, `${prefix}-failure.png`) });
        console.error(await page.locator("body").innerText());
        throw error;
      } finally {
        await context.close();
        fixture.stop();
      }
    }
  }
  assert.deepEqual(issues, []);
} finally {
  await browser.close();
  await writeFile(resolve(output, process.env.ARCADE_VIEWPORTS ? "compact-results.json" : "results.json"), JSON.stringify({ baseline, issues, layouts }, null, 2));
}
