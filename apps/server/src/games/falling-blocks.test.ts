import { describe, expect, it } from "vitest";
import { TETROMINO_SHAPES, type TetrisCellPosition } from "@workhard/shared";
import { FallingBlocksGame } from "./falling-blocks.js";

describe("FallingBlocksGame", () => {
  it("starts with a complete empty-sized board and an active piece", () => {
    const game = new FallingBlocksGame("round-test");

    expect(game.state.grid).toHaveLength(20);
    expect(game.state.grid.every((row) => row.length === 10)).toBe(true);
    expect(game.state.grid.flat().some((cell) => cell > 0)).toBe(true);
    expect(game.state.running).toBe(true);
    expect(game.state.nextPieces).toHaveLength(5);
    expect(new Set([game.state.activePiece, ...game.state.nextPieces]).size).toBe(6);
    expect(Math.max(...game.state.ghostCells.map(({ row }) => row))).toBeGreaterThan(
      Math.max(...game.state.activeCells.map(({ row }) => row)),
    );
  });

  it("gives every player in a round the same seven-bag sequence", () => {
    const firstPlayer = new FallingBlocksGame("shared-round");
    const secondPlayer = new FallingBlocksGame("shared-round");

    expect([firstPlayer.state.activePiece, ...firstPlayer.state.nextPieces]).toEqual([
      secondPlayer.state.activePiece,
      ...secondPlayer.state.nextPieces,
    ]);
  });

  it("scores a hard drop on the authoritative state", () => {
    const game = new FallingBlocksGame("round-test");

    game.command("drop");

    expect(game.state.score).toBeGreaterThan(0);
    expect(game.state.running).toBe(true);
  });

  it("pauses falling until resumed", () => {
    const game = new FallingBlocksGame("round-test");
    game.command("pause");
    const before = game.state.grid;

    game.update(2_000);

    expect(game.state.paused).toBe(true);
    expect(game.state.grid).toEqual(before);
  });

  it("holds once per active piece and restores a swapped piece at spawn orientation", () => {
    const game = new FallingBlocksGame("hold-round");
    const firstPiece = game.state.activePiece!;
    const nextPiece = game.state.nextPieces[0]!;

    game.command("rotate");
    expect(game.command("hold")).toBe(true);
    expect(game.state.heldPiece).toBe(firstPiece);
    expect(game.state.activePiece).toBe(nextPiece);
    expect(game.state.canHold).toBe(false);
    expect(game.command("hold")).toBe(false);
    expect(game.state.activePiece).toBe(nextPiece);

    game.command("drop");
    expect(game.state.canHold).toBe(true);
    expect(game.command("hold")).toBe(true);
    expect(game.state.activePiece).toBe(firstPiece);
    expect(normalizeCells(game.state.activeCells)).toEqual(normalizeShape(TETROMINO_SHAPES[firstPiece]));
  });

  it("keeps a grounded piece adjustable until the lock delay expires", () => {
    const game = new FallingBlocksGame("lock-delay-round");
    const activePiece = game.state.activePiece;

    while (game.command("down")) {
      continue;
    }
    game.update(499);
    expect(game.state.activePiece).toBe(activePiece);

    game.update(1);
    expect(game.state.activePiece).not.toBe(activePiece);
  });
});

function normalizeCells(cells: TetrisCellPosition[]): string[] {
  const minimumRow = Math.min(...cells.map(({ row }) => row));
  const minimumColumn = Math.min(...cells.map(({ column }) => column));
  return cells
    .map(({ row, column }) => `${row - minimumRow}-${column - minimumColumn}`)
    .sort();
}

function normalizeShape(shape: readonly (readonly number[])[]): string[] {
  return shape.flatMap((row, rowIndex) =>
    row.flatMap((value, columnIndex) => value ? [`${rowIndex}-${columnIndex}`] : []),
  ).sort();
}
