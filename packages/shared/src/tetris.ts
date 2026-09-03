export const TETROMINO_TYPES = ["I", "O", "T", "J", "L", "S", "Z"] as const;

export type TetrominoType = typeof TETROMINO_TYPES[number];

export type TetrominoShape = readonly (readonly number[])[];

export const TETROMINO_SHAPES: Record<TetrominoType, TetrominoShape> = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
};

export const TETROMINO_COLOR_IDS: Record<TetrominoType, number> = {
  I: 1,
  O: 2,
  T: 3,
  J: 4,
  L: 5,
  S: 6,
  Z: 7,
};

export const TETRIS_COMMANDS = ["left", "right", "rotate", "down", "drop", "hold", "pause"] as const;

export type TetrisCommand = typeof TETRIS_COMMANDS[number];

export interface TetrisCellPosition {
  column: number;
  row: number;
}
