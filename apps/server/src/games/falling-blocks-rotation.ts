import type { TetrominoType } from "@workhard/shared";

export type FallingBlocksRotation = 0 | 1 | 2 | 3;
type Offset = readonly [number, number];
type KickTable = Record<`${FallingBlocksRotation}>${FallingBlocksRotation}`, readonly Offset[]>;

const STANDARD_KICKS: Partial<KickTable> = {
  "0>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1>0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "1>2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3>2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "3>0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "0>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const I_KICKS: Partial<KickTable> = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export function rotationKicks(type: TetrominoType, from: FallingBlocksRotation, to: FallingBlocksRotation): readonly Offset[] {
  return (type === "I" ? I_KICKS : STANDARD_KICKS)[`${from}>${to}`]!;
}

export function rotateCells(cells: readonly (readonly number[])[], direction: 1 | -1): number[][] {
  const size = cells.length;
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) =>
    direction === 1 ? cells[size - 1 - column]![row]! : cells[column]![size - 1 - row]!,
  ));
}
