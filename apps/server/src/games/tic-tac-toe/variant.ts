import type {
  TicTacToeCommand,
  TicTacToeGameState,
  TicTacToeMark,
  TicTacToeStateBase,
  TicTacToeVariantId,
} from "@workhard/shared";

export type TicTacToeStateCore = Omit<TicTacToeStateBase, "variantId">;

export interface TicTacToeVariantEngine {
  clone(): TicTacToeVariantEngine;
  readonly variantId: TicTacToeVariantId;
  readonly winnerMark: TicTacToeMark | undefined;
  readonly isDraw: boolean;
  play(mark: TicTacToeMark, command: TicTacToeCommand): boolean;
  createState(core: TicTacToeStateCore): TicTacToeGameState;
}

export const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export function findWinningLine<T>(cells: readonly T[], value: T): number[] | undefined {
  const line = WINNING_LINES.find((candidate) => candidate.every((cell) => cells[cell] === value));
  return line ? [...line] : undefined;
}

export function isBoardIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < 9;
}
