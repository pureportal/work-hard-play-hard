import type { TicTacToeCommand } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { TicTacToeGame } from "./game.js";

const X_PLAYER = "player-x";
const O_PLAYER = "player-o";

describe("stacking tic-tac-toe", () => {
  it.each([
    { line: [0, 1, 2], other: [3, 4] },
    { line: [3, 4, 5], other: [0, 1] },
    { line: [6, 7, 8], other: [0, 1] },
    { line: [0, 3, 6], other: [1, 2] },
    { line: [1, 4, 7], other: [0, 2] },
    { line: [2, 5, 8], other: [0, 1] },
    { line: [0, 4, 8], other: [1, 2] },
    { line: [2, 4, 6], other: [0, 1] },
  ])("wins with the visible line $line", ({ line, other }) => {
    const game = new TicTacToeGame("round-test", "stacking", [X_PLAYER, O_PLAYER]);
    [line[0]!, other[0]!, line[1]!, other[1]!, line[2]!].forEach((cell, index) => {
      expect(game.command(index % 2 === 0 ? X_PLAYER : O_PLAYER, {
        kind: "stacking.place", cell, size: index === 4 ? "medium" : "small",
      })).toBe(true);
    });
    expect(game.state).toMatchObject({ status: "won", winnerUserId: X_PLAYER, winningLine: line });
  });

  it("covers its own smaller pieces, exhausts reserves, and does not replenish them when moving", () => {
    const game = new TicTacToeGame("round-test", "stacking", [X_PLAYER, O_PLAYER]);
    expect(game.command(X_PLAYER, { kind: "stacking.place", cell: 0, size: "small" })).toBe(true);
    expect(game.command(O_PLAYER, { kind: "stacking.place", cell: 1, size: "large" })).toBe(true);
    expect(game.command(X_PLAYER, { kind: "stacking.place", cell: 8, size: "small" })).toBe(true);
    expect(game.command(O_PLAYER, { kind: "stacking.place", cell: 6, size: "large" })).toBe(true);
    const before = game.state;
    expect(game.command(X_PLAYER, { kind: "stacking.place", cell: 2, size: "small" })).toBe(false);
    expect(game.state).toEqual(before);
    expect(game.command(X_PLAYER, { kind: "stacking.place", cell: 0, size: "medium" })).toBe(true);
    expect(game.command(O_PLAYER, { kind: "stacking.place", cell: 2, size: "small" })).toBe(true);
    expect(game.command(X_PLAYER, { kind: "stacking.move", fromCell: 0, toCell: 4 })).toBe(true);
    expect(game.state).toMatchObject({
      reserves: { x: { small: 0, medium: 1, large: 2 } },
      status: "won", winnerUserId: X_PLAYER, winningLine: [0, 4, 8],
    });
    expect(game.state.variantId === "stacking" && game.state.board[0]).toEqual({ mark: "x", size: "small" });
  });

  it("rejects equal-size covers, invalid moves, and moving an opponent's piece atomically", () => {
    const game = new TicTacToeGame("round-test", "stacking", [X_PLAYER, O_PLAYER]);
    game.command(X_PLAYER, { kind: "stacking.place", cell: 0, size: "medium" });
    game.command(O_PLAYER, { kind: "stacking.place", cell: 1, size: "medium" });
    const before = game.state;
    const commands: TicTacToeCommand[] = [
      { kind: "stacking.place", cell: 1, size: "medium" },
      { kind: "stacking.place", cell: -1, size: "large" },
      { kind: "stacking.move", fromCell: 0, toCell: 0 },
      { kind: "stacking.move", fromCell: 0, toCell: 1 },
      { kind: "stacking.move", fromCell: 1, toCell: 2 },
      { kind: "stacking.move", fromCell: 2, toCell: 3 },
      { kind: "stacking.move", fromCell: 9, toCell: 0 },
      { kind: "stacking.move", fromCell: 0, toCell: 1.5 },
    ];
    for (const command of commands) {
      expect(game.command(X_PLAYER, command)).toBe(false);
      expect(game.state).toEqual(before);
    }
  });

  it("awards the exposed opponent line even when the mover also makes three in a row", () => {
    const game = new TicTacToeGame("round-test", "stacking", [X_PLAYER, O_PLAYER]);
    const commands: TicTacToeCommand[] = [
      { kind: "stacking.place", cell: 8, size: "small" },
      { kind: "stacking.place", cell: 0, size: "small" },
      { kind: "stacking.place", cell: 7, size: "small" },
      { kind: "stacking.place", cell: 1, size: "small" },
      { kind: "stacking.place", cell: 1, size: "medium" },
      { kind: "stacking.place", cell: 2, size: "medium" },
      { kind: "stacking.place", cell: 8, size: "large" },
      { kind: "stacking.place", cell: 4, size: "large" },
      { kind: "stacking.move", fromCell: 1, toCell: 6 },
    ];
    commands.forEach((command, index) => {
      expect(game.command(index % 2 === 0 ? X_PLAYER : O_PLAYER, command)).toBe(true);
    });
    expect(game.state).toMatchObject({ status: "won", winnerUserId: O_PLAYER, winningLine: [0, 1, 2] });
  });

  it("covers only smaller pieces and tracks the finite reserves", () => {
    const game = new TicTacToeGame("round-test", "stacking", [X_PLAYER, O_PLAYER]);

    expect(game.command(X_PLAYER, { kind: "stacking.place", cell: 0, size: "small" })).toBe(true);
    expect(game.command(O_PLAYER, { kind: "stacking.place", cell: 0, size: "medium" })).toBe(true);
    expect(game.command(X_PLAYER, { kind: "stacking.move", fromCell: 0, toCell: 1 })).toBe(false);
    expect(game.command(X_PLAYER, { kind: "stacking.place", cell: 0, size: "small" })).toBe(false);
    expect(game.command(X_PLAYER, { kind: "stacking.place", cell: 0, size: "large" })).toBe(true);

    expect(game.state.variantId).toBe("stacking");
    if (game.state.variantId !== "stacking") {
      throw new Error("Expected stacking state");
    }
    expect(game.state.board[0]).toEqual({ mark: "x", size: "large" });
    expect(game.state.reserves).toEqual({
      x: { small: 1, medium: 2, large: 1 },
      o: { small: 2, medium: 1, large: 2 },
    });

    expect(game.command(O_PLAYER, { kind: "stacking.place", cell: 8, size: "large" })).toBe(true);
    expect(game.command(X_PLAYER, { kind: "stacking.move", fromCell: 0, toCell: 1 })).toBe(true);
    expect(game.state.variantId === "stacking" && game.state.board[0]).toEqual({ mark: "o", size: "medium" });
  });

  it("wins with three visible pieces in a row", () => {
    const game = new TicTacToeGame("round-test", "stacking", [X_PLAYER, O_PLAYER]);
    const moves: Array<[string, TicTacToeCommand]> = [
      [X_PLAYER, { kind: "stacking.place", cell: 0, size: "small" }],
      [O_PLAYER, { kind: "stacking.place", cell: 3, size: "small" }],
      [X_PLAYER, { kind: "stacking.place", cell: 1, size: "small" }],
      [O_PLAYER, { kind: "stacking.place", cell: 4, size: "small" }],
      [X_PLAYER, { kind: "stacking.place", cell: 2, size: "medium" }],
    ];

    moves.forEach(([userId, command]) => expect(game.command(userId, command)).toBe(true));
    expect(game.state).toMatchObject({
      variantId: "stacking",
      status: "won",
      winnerUserId: X_PLAYER,
      winningLine: [0, 1, 2],
    });
  });

  it("awards a line revealed by moving its covering piece", () => {
    const game = new TicTacToeGame("round-test", "stacking", [X_PLAYER, O_PLAYER]);
    const moves: Array<[string, TicTacToeCommand]> = [
      [X_PLAYER, { kind: "stacking.place", cell: 8, size: "small" }],
      [O_PLAYER, { kind: "stacking.place", cell: 0, size: "small" }],
      [X_PLAYER, { kind: "stacking.place", cell: 7, size: "small" }],
      [O_PLAYER, { kind: "stacking.place", cell: 1, size: "small" }],
      [X_PLAYER, { kind: "stacking.place", cell: 1, size: "medium" }],
      [O_PLAYER, { kind: "stacking.place", cell: 2, size: "medium" }],
      [X_PLAYER, { kind: "stacking.place", cell: 8, size: "large" }],
      [O_PLAYER, { kind: "stacking.place", cell: 6, size: "large" }],
      [X_PLAYER, { kind: "stacking.move", fromCell: 1, toCell: 5 }],
    ];

    moves.forEach(([userId, command]) => expect(game.command(userId, command)).toBe(true));

    expect(game.state).toMatchObject({
      variantId: "stacking",
      status: "won",
      winnerUserId: O_PLAYER,
      winningLine: [0, 1, 2],
    });
  });

  it("avoids a revealed line by covering another piece in that line", () => {
    const game = new TicTacToeGame("round-test", "stacking", [X_PLAYER, O_PLAYER]);
    const moves: Array<[string, TicTacToeCommand]> = [
      [X_PLAYER, { kind: "stacking.place", cell: 8, size: "small" }],
      [O_PLAYER, { kind: "stacking.place", cell: 0, size: "small" }],
      [X_PLAYER, { kind: "stacking.place", cell: 7, size: "small" }],
      [O_PLAYER, { kind: "stacking.place", cell: 1, size: "small" }],
      [X_PLAYER, { kind: "stacking.place", cell: 1, size: "medium" }],
      [O_PLAYER, { kind: "stacking.place", cell: 2, size: "medium" }],
      [X_PLAYER, { kind: "stacking.move", fromCell: 1, toCell: 0 }],
    ];

    moves.forEach(([userId, command]) => expect(game.command(userId, command)).toBe(true));
    expect(game.state).toMatchObject({ variantId: "stacking", status: "playing", turnUserId: O_PLAYER });
  });
});
