import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { Page } from "puppeteer";
import type { ClientCommand, ServerEvent, TicTacToeCommand } from "@workhard/shared";
import { TIC_TAC_TOE_VARIANTS } from "../packages/shared/src/tic-tac-toe.js";
import { TicTacToeGame } from "../apps/server/src/games/tic-tac-toe/game.js";

const moves: Record<typeof TIC_TAC_TOE_VARIANTS[number]["id"], TicTacToeCommand[]> = {
  classic: [0, 3, 1, 4, 2].map((cell) => ({ kind: "classic.place", cell })),
  ultimate: [
    [0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 0],
    [0, 4], [4, 1], [1, 4], [4, 2], [2, 4], [4, 0],
    [0, 8], [8, 1], [1, 7], [7, 2], [2, 6],
  ].map(([board, cell]) => ({ kind: "ultimate.place", board: board!, cell: cell! })),
  stacking: [
    { kind: "stacking.place", cell: 8, size: "small" },
    { kind: "stacking.place", cell: 0, size: "small" },
    { kind: "stacking.place", cell: 7, size: "small" },
    { kind: "stacking.place", cell: 1, size: "small" },
    { kind: "stacking.place", cell: 1, size: "medium" },
    { kind: "stacking.place", cell: 2, size: "medium" },
    { kind: "stacking.move", fromCell: 1, toCell: 0 },
    { kind: "stacking.move", fromCell: 2, toCell: 5 },
    { kind: "stacking.move", fromCell: 0, toCell: 6 },
  ],
};

export async function verifyTicTacToeUi(page: Page, artifactDirectory: string): Promise<void> {
  for (const { id, name } of TIC_TAC_TOE_VARIANTS) {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await emit(page, [{
      type: "game.lobby_updated",
      lobby: { definitionId: "game-falling-blocks", objectId: "object-falling-blocks", floorId: "floor-studio", participantIds: [], capacity: 8 },
    }, {
      type: "game.lobby_updated",
      lobby: { definitionId: "game-tic-tac-toe", objectId: "object-tic-tac-toe", floorId: "floor-studio", participantIds: ["user-maya", "user-leo"], capacity: 2 },
    }]);
    await page.waitForSelector(".tic-tac-toe-lobby", { visible: true });
    await page.locator('.tic-tac-toe-lobby button::-p-text(Players)').click();
    await page.locator(`.tic-tac-toe-variant-picker button::-p-text(${name})`).click();
    await page.click(".tic-tac-toe-start-button");
    const start = await latestCommand(page);
    assert.equal(start.type, "game.start");
    assert.equal("variantId" in start && start.variantId, id);

    const game = new TicTacToeGame(`ui-${id}`, id, ["user-maya", "user-leo"]);
    await emit(page, [{
      type: "game.round_started",
      round: {
        id: game.state.roundId,
        definitionId: "game-tic-tac-toe",
        objectId: "object-tic-tac-toe",
        floorId: "floor-studio",
        startedAt: new Date().toISOString(),
        status: "playing",
        participants: game.state.players.map(({ userId }) => ({ userId, score: 0, lines: 0, level: 0, status: "playing" })),
      },
    }, game.state]);
    await page.waitForSelector(".tic-tac-toe-game", { visible: true });
    await assertGameLayout(page);

    for (const command of moves[id]) {
      const userId = game.state.turnUserId!;
      if (userId === "user-maya") {
        await page.waitForFunction(() => document.querySelector(".tic-tac-toe-status")?.textContent === "Your turn");
        await clickMove(page, command);
        const sent = await latestCommand(page);
        assert.deepEqual(sent.type === "game.command" && sent.command, command);
      }
      assert(game.command(userId, command), `The ${id} UI produced an invalid move.`);
      await emit(page, [game.state]);
      await page.waitForFunction((status) => document.querySelector(".tic-tac-toe-status")?.textContent === status, {},
        game.completed ? "You win" : game.state.turnUserId === "user-maya" ? "Your turn" : "Leo Martins's turn");
    }
    assert.equal(game.winnerUserId, "user-maya");
    assert(await page.$$eval('.tic-tac-toe-game [role="gridcell"]', (cells) => cells.every((cell) => (cell as HTMLButtonElement).disabled)));

    for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
      await assertGameLayout(page);
      await page.screenshot({ path: resolve(artifactDirectory, `tic-tac-toe-${id}-${viewport.width}.png`) });
    }
    await page.keyboard.press("Escape");
    await page.waitForSelector(".tic-tac-toe-game", { hidden: true });
    process.stdout.write(`${name} Tic-Tac-Toe UI and responsive layout passed.\n`);
  }
}

async function clickMove(page: Page, command: TicTacToeCommand): Promise<void> {
  if (command.kind === "ultimate.place") {
    await page.click(`.tic-tac-toe-local-board:nth-child(${command.board + 1}) > button:nth-child(${command.cell + 1})`);
    return;
  }
  if (command.kind === "stacking.move") {
    await page.locator('.tic-tac-toe-piece-picker button::-p-text(Move)').click();
    await page.click(`.tic-tac-toe-board > button:nth-child(${command.fromCell + 1})`);
    await page.click(`.tic-tac-toe-board > button:nth-child(${command.toCell + 1})`);
    return;
  }
  if (command.kind === "stacking.place") {
    const size = command.size[0]!.toUpperCase() + command.size.slice(1);
    await page.click(`.tic-tac-toe-piece-picker button[aria-label^="${size},"]`);
  }
  await page.click(`.tic-tac-toe-board > button:nth-child(${command.cell + 1})`);
}

async function emit(page: Page, events: ServerEvent[]): Promise<void> {
  await page.evaluate((pending) => {
    const socket = (globalThis as typeof globalThis & { mockSockets: Array<{ emit: (event: ServerEvent) => void }> }).mockSockets.at(-1)!;
    pending.forEach((event) => socket.emit(event));
  }, events);
}

async function latestCommand(page: Page): Promise<ClientCommand> {
  return page.evaluate(() => (
    globalThis as typeof globalThis & { mockSockets: Array<{ commands: ClientCommand[] }> }
  ).mockSockets.at(-1)!.commands.at(-1)!);
}

async function assertGameLayout(page: Page): Promise<void> {
  const failures = await page.evaluate(() => {
    const dialog = document.querySelector(".tic-tac-toe-game")!.getBoundingClientRect();
    const failures: string[] = [];
    if (dialog.left < 0 || dialog.top < 0 || dialog.right > innerWidth + 1 || dialog.bottom > innerHeight + 1) {
      failures.push("Game dialog exceeds viewport.");
    }
    const content = document.querySelector(".tic-tac-toe-content")!.getBoundingClientRect();
    for (const element of document.querySelectorAll(".tic-tac-toe-game header, .tic-tac-toe-board, .tic-tac-toe-ultimate-board, .tic-tac-toe-piece-picker, .tic-tac-toe-opponent-reserves, .tic-tac-toe-game .game-result-actions")) {
      const bounds = element.getBoundingClientRect();
      const container = element.closest(".tic-tac-toe-content") ? content : dialog;
      if (bounds.left < dialog.left - 1 || bounds.right > dialog.right + 1) {
        failures.push(`${element.className} exceeds dialog width.`);
      }
      if (bounds.top < container.top - 1 || bounds.bottom > container.bottom + 1) {
        failures.push(`${element.className} exceeds its visible container height.`);
      }
    }
    for (const cell of document.querySelectorAll('.tic-tac-toe-game [role="gridcell"]')) {
      const bounds = cell.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) {
        failures.push("A board cell has collapsed.");
        break;
      }
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) {
      failures.push("Page overflows horizontally.");
    }
    return failures;
  });
  assert.deepEqual(failures, [], `Tic-Tac-Toe layout at ${page.viewport()?.width}x${page.viewport()?.height}`);
}
