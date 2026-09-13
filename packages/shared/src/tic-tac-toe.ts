import type { GameBot } from "./game-bot.js";

export const TIC_TAC_TOE_DEFINITION_ID = "game-tic-tac-toe" as const;

export const TIC_TAC_TOE_VARIANTS = [
  { id: "classic", name: "Classic" },
  { id: "ultimate", name: "Ultimate" },
  { id: "stacking", name: "Stacking" },
] as const;

export type TicTacToeVariantId = typeof TIC_TAC_TOE_VARIANTS[number]["id"];

export const TIC_TAC_TOE_MARKS = ["x", "o"] as const;
export type TicTacToeMark = typeof TIC_TAC_TOE_MARKS[number];

export const TIC_TAC_TOE_PIECE_SIZES = ["small", "medium", "large"] as const;
export type TicTacToePieceSize = typeof TIC_TAC_TOE_PIECE_SIZES[number];

export type TicTacToeCommand =
  | { kind: "classic.place"; cell: number }
  | { kind: "ultimate.place"; board: number; cell: number }
  | { kind: "stacking.place"; cell: number; size: TicTacToePieceSize }
  | { kind: "stacking.move"; fromCell: number; toCell: number };

export interface TicTacToePlayerState {
  userId: string;
  mark: TicTacToeMark;
}

export interface TicTacToeStateBase {
  bot?: GameBot;
  type: "game.state";
  roundId: string;
  definitionId: typeof TIC_TAC_TOE_DEFINITION_ID;
  variantId: TicTacToeVariantId;
  players: [TicTacToePlayerState, TicTacToePlayerState];
  status: "playing" | "won" | "draw";
  turnUserId?: string;
  winnerUserId?: string;
  moveNumber: number;
}

export interface ClassicTicTacToeState extends TicTacToeStateBase {
  variantId: "classic";
  board: Array<TicTacToeMark | null>;
  winningLine?: number[];
}

export type UltimateBoardResult = TicTacToeMark | "draw" | null;

export interface UltimateTicTacToeState extends TicTacToeStateBase {
  variantId: "ultimate";
  boards: Array<Array<TicTacToeMark | null>>;
  boardResults: UltimateBoardResult[];
  activeBoard: number | null;
  winningLine?: number[];
}

export interface StackingTicTacToePiece {
  mark: TicTacToeMark;
  size: TicTacToePieceSize;
}

export function canCoverTicTacToePiece(
  piece: StackingTicTacToePiece | null | undefined,
  size: TicTacToePieceSize,
): boolean {
  return !piece || TIC_TAC_TOE_PIECE_SIZES.indexOf(size) > TIC_TAC_TOE_PIECE_SIZES.indexOf(piece.size);
}

export type StackingTicTacToeReserves = Record<TicTacToeMark, Record<TicTacToePieceSize, number>>;

export interface StackingTicTacToeState extends TicTacToeStateBase {
  variantId: "stacking";
  board: Array<StackingTicTacToePiece | null>;
  reserves: StackingTicTacToeReserves;
  winningLine?: number[];
}

export type TicTacToeGameState =
  | ClassicTicTacToeState
  | UltimateTicTacToeState
  | StackingTicTacToeState;
