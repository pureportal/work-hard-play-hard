import { describe, expect, it } from "vitest";
import { TicTacToeGame } from "./game.js";

const X_PLAYER = "player-x";
const O_PLAYER = "player-o";

describe("classic tic-tac-toe", () => {
  it.each([
    { line: [0, 1, 2], other: [3, 4] },
    { line: [3, 4, 5], other: [0, 1] },
    { line: [6, 7, 8], other: [0, 1] },
    { line: [0, 3, 6], other: [1, 2] },
    { line: [1, 4, 7], other: [0, 2] },
    { line: [2, 5, 8], other: [0, 1] },
    { line: [0, 4, 8], other: [1, 2] },
    { line: [2, 4, 6], other: [0, 1] },
  ])("wins on line $line and stops accepting moves", ({ line, other }) => {
    const game = new TicTacToeGame("round-test", "classic", [X_PLAYER, O_PLAYER]);
    [line[0]!, other[0]!, line[1]!, other[1]!, line[2]!].forEach((cell, index) => {
      expect(game.command(index % 2 === 0 ? X_PLAYER : O_PLAYER, { kind: "classic.place", cell })).toBe(true);
    });

    expect(game.state).toMatchObject({ status: "won", winnerUserId: X_PLAYER, winningLine: line });
    const completed = game.state;
    expect(game.command(O_PLAYER, { kind: "classic.place", cell: other[0]! })).toBe(false);
    expect(game.state).toEqual(completed);
    expect(completed.turnUserId).toBeUndefined();
  });

  it("can award a win to the second player", () => {
    const game = new TicTacToeGame("round-test", "classic", [X_PLAYER, O_PLAYER]);
    [0, 2, 1, 4, 8, 6].forEach((cell, index) => {
      expect(game.command(index % 2 === 0 ? X_PLAYER : O_PLAYER, { kind: "classic.place", cell })).toBe(true);
    });
    expect(game.state).toMatchObject({ status: "won", winnerUserId: O_PLAYER, winningLine: [2, 4, 6] });
  });

  it("rejects invalid coordinates without consuming a turn", () => {
    const game = new TicTacToeGame("round-test", "classic", [X_PLAYER, O_PLAYER]);
    const initial = game.state;
    for (const cell of [-1, 9, 0.5, NaN, Infinity]) {
      expect(game.command(X_PLAYER, { kind: "classic.place", cell })).toBe(false);
    }
    expect(game.state).toEqual(initial);
  });

  it("wins on three marks in a row and rejects occupied cells", () => {
    const game = new TicTacToeGame("round-test", "classic", [X_PLAYER, O_PLAYER]);

    expect(game.command(X_PLAYER, { kind: "classic.place", cell: 0 })).toBe(true);
    expect(game.command(O_PLAYER, { kind: "classic.place", cell: 0 })).toBe(false);
    expect(game.command(O_PLAYER, { kind: "classic.place", cell: 3 })).toBe(true);
    expect(game.command(X_PLAYER, { kind: "classic.place", cell: 1 })).toBe(true);
    expect(game.command(O_PLAYER, { kind: "classic.place", cell: 4 })).toBe(true);
    expect(game.command(X_PLAYER, { kind: "classic.place", cell: 2 })).toBe(true);

    expect(game.state).toMatchObject({
      variantId: "classic",
      status: "won",
      winnerUserId: X_PLAYER,
      winningLine: [0, 1, 2],
    });
  });

  it("draws when the board fills without a line", () => {
    const game = new TicTacToeGame("round-test", "classic", [X_PLAYER, O_PLAYER]);
    const cells = [0, 1, 2, 4, 3, 5, 7, 6, 8];

    cells.forEach((cell, index) => {
      expect(game.command(index % 2 === 0 ? X_PLAYER : O_PLAYER, { kind: "classic.place", cell })).toBe(true);
    });

    expect(game.state).toMatchObject({ variantId: "classic", status: "draw", moveNumber: 9 });
  });
});
