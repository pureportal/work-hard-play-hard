import { describe, expect, it } from "vitest";
import { TicTacToeGame } from "./game.js";

const X_PLAYER = "player-x";
const O_PLAYER = "player-o";

const DRAW_MOVES: Array<[number, number]> = [
  [3, 5], [5, 1], [1, 2], [2, 7], [7, 8], [8, 3], [3, 3], [3, 0], [0, 8], [8, 8],
  [8, 7], [7, 3], [3, 7], [7, 2], [2, 2], [2, 3], [3, 2], [2, 0], [0, 5], [5, 2],
  [2, 5], [5, 6], [6, 6], [6, 2], [2, 6], [6, 0], [0, 4], [4, 7], [7, 6], [6, 1],
  [1, 7], [7, 0], [0, 6], [2, 8], [8, 6], [2, 1], [1, 0], [0, 7], [7, 1], [1, 4],
  [4, 1], [1, 8], [8, 0], [0, 0], [0, 1], [1, 3], [3, 6], [0, 2], [2, 4], [4, 3],
  [3, 8], [8, 4], [4, 0], [0, 3], [1, 6], [1, 5], [5, 8], [8, 1], [8, 2], [5, 3],
  [5, 7], [7, 4], [4, 8], [8, 5], [5, 0], [4, 2], [7, 5], [5, 5], [5, 4], [4, 4],
  [4, 5], [7, 7], [4, 6],
];

describe("ultimate tic-tac-toe", () => {
  it("draws after every local board closes without a global line", () => {
    const game = replay(DRAW_MOVES);
    expect(game.state).toMatchObject({
      status: "draw",
      moveNumber: 73,
      boardResults: ["draw", "o", "x", "x", "draw", "x", "o", "draw", "o"],
    });
    expect(game.state.winnerUserId).toBeUndefined();
    expect(game.state.turnUserId).toBeUndefined();
    expect(game.command(O_PLAYER, { kind: "ultimate.place", board: 6, cell: 8 })).toBe(false);
  });

  it("releases the board restriction when sent to a drawn board and keeps closed boards locked", () => {
    const game = replay(DRAW_MOVES.slice(0, 65));
    expect(game.state).toMatchObject({ activeBoard: null, boardResults: ["draw", "o", "x", "x", null, null, "o", null, "o"] });
    const before = game.state;

    expect(game.command(O_PLAYER, { kind: "ultimate.place", board: 0, cell: 0 })).toBe(false);
    expect(game.command(O_PLAYER, { kind: "ultimate.place", board: 6, cell: 8 })).toBe(false);
    expect(game.state).toEqual(before);
    expect(game.command(O_PLAYER, { kind: "ultimate.place", board: 4, cell: 2 })).toBe(true);
  });

  it("wins with a diagonal of local boards", () => {
    const game = replay([
      [4, 3], [3, 5], [5, 6], [6, 7], [7, 5], [5, 1], [1, 2], [2, 8], [8, 2], [2, 4],
      [4, 6], [6, 2], [2, 3], [3, 3], [3, 7], [7, 8], [8, 7], [7, 7], [7, 3], [3, 8],
      [8, 6], [6, 1], [1, 3], [3, 0], [0, 8], [8, 3], [3, 6], [6, 4], [4, 2], [2, 1],
      [1, 7], [7, 4], [4, 5], [5, 2], [2, 0], [0, 2], [2, 7], [7, 0], [0, 7], [1, 6],
      [5, 3], [3, 4], [4, 0], [0, 5], [5, 7], [2, 5], [5, 4], [5, 8], [8, 1], [1, 5],
      [5, 5], [8, 4], [1, 0], [0, 1], [1, 1], [0, 4], [0, 3], [8, 0], [0, 6], [2, 6], [8, 8],
    ]);
    expect(game.state).toMatchObject({ status: "won", winnerUserId: X_PLAYER, winningLine: [0, 4, 8] });
  });

  it("rejects occupied cells and invalid board coordinates without changing the turn", () => {
    const game = replay([[4, 4]]);
    const before = game.state;
    expect(game.command(O_PLAYER, { kind: "ultimate.place", board: 4, cell: 4 })).toBe(false);
    for (const coordinate of [-1, 9, 0.5, NaN, Infinity]) {
      expect(game.command(O_PLAYER, { kind: "ultimate.place", board: coordinate, cell: 0 })).toBe(false);
      expect(game.command(O_PLAYER, { kind: "ultimate.place", board: 4, cell: coordinate })).toBe(false);
    }
    expect(game.state).toEqual(before);
  });

  it("sends the next player to the matching local board", () => {
    const game = new TicTacToeGame("round-test", "ultimate", [X_PLAYER, O_PLAYER]);

    expect(game.command(X_PLAYER, { kind: "ultimate.place", board: 2, cell: 6 })).toBe(true);
    expect(game.state).toMatchObject({ variantId: "ultimate", activeBoard: 6 });
    expect(game.command(O_PLAYER, { kind: "ultimate.place", board: 5, cell: 0 })).toBe(false);
    expect(game.command(O_PLAYER, { kind: "ultimate.place", board: 6, cell: 0 })).toBe(true);
  });

  it("wins by claiming three local boards in a row", () => {
    const game = new TicTacToeGame("round-test", "ultimate", [X_PLAYER, O_PLAYER]);
    const moves: Array<[number, number]> = [
      [0, 0], [0, 1],
      [1, 1], [1, 2],
      [2, 2], [2, 0],
      [0, 4], [4, 1],
      [1, 4], [4, 2],
      [2, 4], [4, 0],
      [0, 8], [8, 1],
      [1, 7], [7, 2],
      [2, 6],
    ];

    moves.forEach(([board, cell], index) => {
      expect(game.command(index % 2 === 0 ? X_PLAYER : O_PLAYER, {
        kind: "ultimate.place",
        board,
        cell,
      })).toBe(true);
    });

    expect(game.state).toMatchObject({
      variantId: "ultimate",
      boardResults: ["x", "x", "x", null, "o", null, null, null, null],
      status: "won",
      winnerUserId: X_PLAYER,
      winningLine: [0, 1, 2],
    });
  });

  it("allows any open board when sent to a closed board", () => {
    const game = new TicTacToeGame("round-test", "ultimate", [X_PLAYER, O_PLAYER]);
    const moves: Array<[number, number]> = [
      [0, 0], [0, 1],
      [1, 1], [1, 2],
      [2, 2], [2, 0],
      [0, 4], [4, 1],
      [1, 4], [4, 2],
      [2, 4], [4, 0],
      [0, 8], [8, 0],
    ];

    moves.forEach(([board, cell], index) => {
      expect(game.command(index % 2 === 0 ? X_PLAYER : O_PLAYER, {
        kind: "ultimate.place",
        board,
        cell,
      })).toBe(true);
    });

    expect(game.state).toMatchObject({ variantId: "ultimate", activeBoard: null });
    expect(game.command(X_PLAYER, { kind: "ultimate.place", board: 5, cell: 5 })).toBe(true);
  });
});

function replay(moves: Array<[number, number]>): TicTacToeGame {
  const game = new TicTacToeGame("round-test", "ultimate", [X_PLAYER, O_PLAYER]);
  moves.forEach(([board, cell], index) => {
    expect(game.command(index % 2 === 0 ? X_PLAYER : O_PLAYER, { kind: "ultimate.place", board, cell })).toBe(true);
  });
  return game;
}
