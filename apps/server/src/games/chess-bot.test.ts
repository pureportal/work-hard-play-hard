import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { BOT_DIFFICULTIES } from "@workhard/shared";
import { findStockfishMove } from "./chess-bot.js";
import { engineMove, moveRecord } from "./chess-rules.js";

describe("Stockfish", () => {
  it.each(BOT_DIFFICULTIES)("returns a legal reply on %s", async (difficulty) => {
    const board = new Chess();
    const first = board.move("e4");
    const move = await findStockfishMove([moveRecord(first, new Date())], difficulty, new AbortController().signal);
    expect(() => board.move(engineMove(move))).not.toThrow();
    expect(board.turn()).toBe("w");
  }, 15_000);

  it("cancels an engine process", async () => {
    const controller = new AbortController();
    const move = findStockfishMove([], "hard", controller.signal);
    controller.abort();
    await expect(move).rejects.toThrow("CHESS_BOT_CANCELLED");
  });
});
