import { FALLING_BLOCKS_HARD_CELL, TETROMINO_SHAPES } from "@workhard/shared";
import { rotateCells } from "../falling-blocks-rotation.js";
import type { FallingBlocksGame } from "../falling-blocks.js";

export function setFallingBlocksBoard(game: FallingBlocksGame, board: number[][]): void {
  Object.assign(game, {
    board,
    piece: { type: "I", color: 1, cells: [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]], x: 2, y: 0, rotation: 1 },
    accumulatedMs: 0,
    groundedMs: 0,
    lockResetCount: 0,
    lastRotationKick: null,
  });
}

export function prepareLineClear(game: FallingBlocksGame, lines: number, hardRows = 0): void {
  const board = Array.from({ length: 20 }, (_, row) => Array.from({ length: 10 }, (_, column) => {
    if (row >= 20 - hardRows) return FALLING_BLOCKS_HARD_CELL;
    return row >= 20 - hardRows - lines && column !== 4 ? 2 : 0;
  }));
  if (lines > 0) board[10]![0] = 2;
  setFallingBlocksBoard(game, board);
}

export function prepareTSpinDouble(game: FallingBlocksGame): void {
  const board = Array.from({ length: 20 }, () => Array<number>(10).fill(0));
  board[17]![3] = 2;
  board[18] = Array.from({ length: 10 }, (_, column) => [3, 4, 5].includes(column) ? 0 : 2);
  board[19] = Array.from({ length: 10 }, (_, column) => column === 4 ? 0 : 2);
  Object.assign(game, {
    board, piece: { type: "T", color: 3, cells: rotateCells(TETROMINO_SHAPES.T, 1), x: 3, y: 17, rotation: 1 },
    accumulatedMs: 0, groundedMs: 0, lockResetCount: 0, lastRotationKick: null,
  });
}
