import { TIC_TAC_TOE_VARIANTS, type TicTacToeCommand } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { TicTacToeGame } from "./game.js";

const firstMoves: Record<typeof TIC_TAC_TOE_VARIANTS[number]["id"], TicTacToeCommand> = {
  classic: { kind: "classic.place", cell: 0 },
  ultimate: { kind: "ultimate.place", board: 0, cell: 0 },
  stacking: { kind: "stacking.place", cell: 0, size: "small" },
};

describe.each(TIC_TAC_TOE_VARIANTS)("$name game lifecycle", ({ id }) => {
  it("rejects outsiders and out-of-turn moves without changing the board", () => {
    const game = new TicTacToeGame("round-test", id, ["x", "o"]);
    const initial = game.state;
    game.consumeChanged();

    expect(() => game.command("outsider", firstMoves[id])).toThrow("GAME_PLAYER_INVALID");
    expect(() => game.command("o", firstMoves[id])).toThrow("GAME_NOT_YOUR_TURN");
    expect(game.state).toEqual(initial);
    expect(game.consumeChanged()).toBe(false);
    expect(game.command("x", firstMoves[id])).toBe(true);
    expect(game.state).toMatchObject({ moveNumber: 1, turnUserId: "o" });
    expect(game.consumeChanged()).toBe(true);
  });

  it("rejects another variant's command without consuming a turn", () => {
    const game = new TicTacToeGame("round-test", id, ["x", "o"]);
    const wrongMove = firstMoves[id === "classic" ? "ultimate" : "classic"];
    const initial = game.state;

    expect(game.command("x", wrongMove)).toBe(false);
    expect(game.state).toEqual(initial);
  });

  it("forfeits once and rejects moves after completion", () => {
    const game = new TicTacToeGame("round-test", id, ["x", "o"]);

    expect(() => game.forfeit("outsider")).toThrow("GAME_PLAYER_INVALID");
    expect(game.completed).toBe(false);
    game.forfeit("x");
    const completed = game.state;
    game.forfeit("o");

    expect(game.command("o", firstMoves[id])).toBe(false);
    expect(game.state).toEqual(completed);
    expect(completed).toMatchObject({ status: "won", winnerUserId: "o", moveNumber: 0 });
    expect(completed.turnUserId).toBeUndefined();
    expect(game.resultFor("x").won).toBe(false);
    expect(game.resultFor("o")).toMatchObject({ score: 1, won: true });
    expect(() => game.resultFor("outsider")).toThrow("GAME_PLAYER_INVALID");
  });

  it("keeps state snapshots independent of the live game", () => {
    const game = new TicTacToeGame("round-test", id, ["x", "o"]);
    const initial = game.state;
    const snapshot = game.state;
    snapshot.players[0].userId = "outsider";
    if (snapshot.variantId === "classic") {
      snapshot.board[0] = "o";
    } else if (snapshot.variantId === "ultimate") {
      snapshot.boards[0]![0] = "o";
      snapshot.boardResults[0] = "o";
    } else {
      snapshot.board[0] = { mark: "o", size: "large" };
      snapshot.reserves.x.small = 100;
    }

    expect(game.state).toEqual(initial);
    expect(game.command("x", firstMoves[id])).toBe(true);
    expect(initial.moveNumber).toBe(0);
  });
});

it("requires two different players", () => {
  expect(() => new TicTacToeGame("round-test", "classic", ["x", "x"])).toThrow("GAME_PLAYERS_INVALID");
});
