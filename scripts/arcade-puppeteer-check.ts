import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import puppeteer, { type Page } from "puppeteer";
import type { ServerEvent } from "@workhard/shared";
import { createApplication } from "../apps/server/src/app.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";

declare global {
  var __arcade: { socket: WebSocket; events: ServerEvent[] };
}

const distribution = resolve("../client/dist");
const artifacts = resolve("../../artifacts/arcade");
const port = await new Promise<number>((done, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    assert(address && typeof address === "object");
    probe.close(() => done(address.port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const application = await createApplication({ database: new MemoryDatabase(), seeded: true, clientUrl: origin, clientOrigins: [origin] });
const index = await readFile(resolve(distribution, "index.html"));
const assets = new Map(await Promise.all((await readdir(resolve(distribution, "assets"))).map(async (name) =>
  [name, await readFile(resolve(distribution, "assets", name))] as const)));
application.app.get("/*", async (request, reply) => {
  const path = new URL(request.url, origin).pathname;
  if (!path.startsWith("/assets/")) return reply.type("text/html").send(index);
  const name = path.slice(8);
  const asset = assets.get(name);
  return asset ? reply.type(name.endsWith(".css") ? "text/css" : name.endsWith(".svg") ? "image/svg+xml" : "text/javascript").send(asset) : reply.code(404).send();
});
await application.app.listen({ host: "127.0.0.1", port });
await mkdir(artifacts, { recursive: true });
const browser = await puppeteer.launch({ headless: "shell", timeout: 120_000, protocolTimeout: 120_000, args: ["--disable-dev-shm-usage", "--no-first-run", "--no-sandbox"] });
const errors: string[] = [];

try {
  const maya = (await browser.pages())[0]!;
  const other = await browser.createBrowserContext();
  const leo = await other.newPage();
  for (const [page, identifier] of [[maya, "maya"], [leo, "leo"]] as const) {
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(30_000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("401 (Unauthorized)")) errors.push(message.text());
    });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.type('input[name="identifier"]', identifier);
    await page.type('input[name="password"]', "northstar");
    await page.click('button[type="submit"]');
    await page.waitForSelector(".world-canvas canvas");
    console.log(`${identifier}: signed in`);
    await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
    const people = await page.$('button[aria-label="Close people"]');
    if (people) await people.click();
    await page.evaluate(async () => {
      const socket = new WebSocket(`ws://${location.host}/v1/realtime?floorId=floor-studio`);
      globalThis.__arcade = { socket, events: [] };
      socket.onmessage = (message) => {
        const event = JSON.parse(String(message.data)) as ServerEvent;
        globalThis.__arcade.events.push(event);
        if (globalThis.__arcade.events.length > 500) globalThis.__arcade.events.shift();
      };
      await new Promise<void>((done, reject) => {
        socket.onopen = () => done();
        socket.onerror = () => reject(new Error("Observer connection failed"));
      });
    });
  }
  assert.equal(application.store.getObject("object-arcade-b"), undefined);
  await checkChess(maya);
  await Promise.all([moveTo(maya, "user-maya", 1248, 640), moveTo(leo, "user-leo", 1248, 700)]);
  await chooseArea(maya, "object-falling-blocks");
  assert((await maya.$$eval('select[aria-label="Active interaction"] option', (options) => options.map((option) => option.value))).includes("object-tic-tac-toe"));
  await shot(maya, "overlapping-areas");
  await clickText(maya, ".falling-blocks-lobby button", "Play");
  await maya.waitForSelector(".falling-blocks-game");
  assert.equal(await leo.$(".falling-blocks-game"), null);
  await maya.keyboard.press("Space");
  await shot(maya, "falling-blocks-solo");
  await maya.click('.falling-blocks-game button[aria-label="Close game"]');
  await clickText(maya, ".game-exit-prompt button", "Leave game");
  await maya.waitForSelector(".falling-blocks-game", { hidden: true });
  console.log("Falling Blocks: entry, solo isolation, controls, exit passed");

  for (const [variant, difficulty] of [["Classic", "Easy"], ["Ultimate", "Medium"], ["Stacking", "Hard"]]) {
    await chooseArea(maya, "object-tic-tac-toe");
    await clickText(maya, ".tic-tac-toe-lobby button", variant!);
    await clickText(maya, ".tic-tac-toe-lobby button", difficulty!);
    await clickText(maya, ".tic-tac-toe-lobby button", "Play");
    await maya.waitForSelector(".tic-tac-toe-game");
    await maya.click('.tic-tac-toe-game button[role="gridcell"]:not(:disabled)');
    await maya.waitForFunction(() => {
      const state = globalThis.__arcade.events.findLast((event) => event.type === "game.state");
      return state?.type === "game.state" && state.definitionId === "game-tic-tac-toe" && state.moveNumber === 2;
    });
    await shot(maya, `tic-tac-toe-${variant!.toLowerCase()}`);
    await maya.click('button[aria-label="Forfeit game"]');
    await clickText(maya, ".game-exit-prompt button", "Leave game");
    await maya.waitForSelector(".tic-tac-toe-game", { hidden: true });
  }
  console.log("Tic-Tac-Toe: bots respond in all variants, difficulty controls and exit passed");

  await moveTo(leo, "user-leo", 1256, 636);
  await Promise.all([chooseArea(maya, "object-tic-tac-toe"), chooseArea(leo, "object-tic-tac-toe")]);
  await clickText(maya, ".tic-tac-toe-lobby button", "Players");
  await clickText(maya, ".tic-tac-toe-lobby button", "Play");
  await Promise.all([maya.waitForSelector(".tic-tac-toe-game"), leo.waitForSelector(".tic-tac-toe-game")]);
  await maya.click('.tic-tac-toe-game button[role="gridcell"]:not(:disabled)');
  await leo.waitForFunction(() => document.querySelector(".tic-tac-toe-status")?.textContent === "Your turn");
  await leo.click('.tic-tac-toe-game button[role="gridcell"]:not(:disabled)');
  await maya.waitForFunction(() => document.querySelector(".tic-tac-toe-status")?.textContent === "Your turn");
  await maya.click('button[aria-label="Forfeit game"]');
  await clickText(maya, ".game-exit-prompt button", "Leave game");
  await leo.waitForFunction(() => document.querySelector(".tic-tac-toe-status")?.textContent === "You win");
  await clickText(leo, ".game-result-actions button", "Back to lobby");
  console.log("Tic-Tac-Toe: two-browser turns and forfeit passed");

  assert.deepEqual(errors, []);
  console.log(`Screenshots: ${artifacts}`);
} catch (error) {
  console.error(error);
  console.error(JSON.stringify({ matches: application.store.getChessMatches(), errors }, null, 2));
  const page = (await browser.pages())[0]!;
  await shot(page, "failure");
  console.error(JSON.stringify({ matches: application.store.getChessMatches(), errors,
    client: await page.evaluate(() => ({ text: document.body.innerText, events: globalThis.__arcade.events.filter((event) => event.type !== "world.snapshot").slice(-8) })) }, null, 2));
  throw error;
} finally {
  await browser.close();
  await application.app.close();
}

async function checkChess(maya: Page) {
  await moveTo(maya, "user-maya", 1330, 780);
  await chooseArea(maya, "object-chess");
  await clickText(maya, ".chess-lobby button", "Hard");
  await clickText(maya, ".chess-lobby button", "Play");
  await maya.waitForSelector(".chess-game");
  await maya.click('.chess-square[data-square="e2"]');
  await maya.waitForSelector('.chess-square[data-square="e2"].is-selected');
  await maya.click('.chess-square[data-square="e4"]');
  await maya.waitForFunction(() => globalThis.__arcade.events.some((event) => event.type === "chess.match_state" && event.match.moves.length > 0));
  console.log("Chess: human move submitted");
  await maya.waitForFunction(() => {
    const event = globalThis.__arcade.events.findLast((event) => event.type === "chess.match_state");
    return event?.type === "chess.match_state" && event.match.moves.length === 2;
  });
  await shot(maya, "chess-stockfish");
  await maya.setViewport({ width: 390, height: 844 });
  await shot(maya, "chess-mobile");
  await maya.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await shot(maya, "chess-mobile-dark");
  await maya.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await maya.setViewport({ width: 1440, height: 900 });
  await maya.click('button[aria-label="Close chess"]');
  await chooseArea(maya, "object-chess");
  await maya.click('.chess-match-list button[aria-label="Play game"]');
  await maya.waitForSelector(".chess-game");
  assert.equal(application.store.getChessMatches()[0]!.moves.length, 2);
  await clickText(maya, ".chess-game-actions button", "Resign");
  await clickText(maya, ".chess-resign-confirmation button", "Resign");
  await maya.waitForSelector(".game-result-actions");
  await clickText(maya, ".game-result-actions button", "Play again");
  await maya.waitForFunction(() => document.querySelectorAll(".chess-moves li").length === 0 && !document.querySelector(".game-result-actions"));
  assert.equal(application.store.getChessMatches().filter((match) => match.status === "active").length, 1);
  await maya.click('button[aria-label="Close chess"]');
  console.log("Chess: Stockfish reply, mobile layouts, resume and replay passed");
}

async function moveTo(page: Page, userId: string, x: number, y: number) {
  await page.evaluate((command) => globalThis.__arcade.socket.send(JSON.stringify(command)), {
    type: "movement.set_destination", requestId: randomUUID(), floorId: "floor-studio", x, y,
  });
  await page.waitForFunction((id, targetX, targetY) => {
    const event = globalThis.__arcade.events.findLast((event) => event.type === "world.snapshot");
    const player = event?.type === "world.snapshot" ? event.players.find((player) => player.userId === id) : undefined;
    return player && Math.hypot(player.x - targetX, player.y - targetY) < 4;
  }, { timeout: 60_000 }, userId, x, y);
}

async function chooseArea(page: Page, id: string) {
  await page.bringToFront();
  await page.waitForFunction((value) => Boolean(document.querySelector(`select[aria-label="Active interaction"] option[value="${value}"]`))
    || Boolean(document.querySelector(value === "object-chess" ? ".chess-lobby" : value === "object-tic-tac-toe" ? ".tic-tac-toe-lobby" : ".falling-blocks-lobby")), {}, id);
  if (await page.$('select[aria-label="Active interaction"]')) await page.select('select[aria-label="Active interaction"]', id);
}

async function clickText(page: Page, selector: string, text: string) {
  await page.waitForFunction((query, label) => [...document.querySelectorAll<HTMLButtonElement>(query)]
    .some((button) => button.textContent?.trim() === label && !button.disabled), {}, selector, text);
  const clicked = await page.evaluate((query, label) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>(query)].find((button) => button.textContent?.trim() === label && !button.disabled);
    button?.click();
    return Boolean(button);
  }, selector, text);
  assert(clicked, `Missing button ${text}`);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: resolve(artifacts, `${name}.png`) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, `Horizontal overflow in ${name}`);
}
