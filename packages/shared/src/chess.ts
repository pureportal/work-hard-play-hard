import type { GameBot } from "./game-bot.js";

export const CHESS_DEFINITION_ID = "game-chess" as const;

export const CHESS_TIME_CONTROLS = ["standard", "rapid", "daily"] as const;
export type ChessTimeControl = typeof CHESS_TIME_CONTROLS[number];

export const CHESS_ACCESS_MODES = ["open", "locked"] as const;
export type ChessAccessMode = typeof CHESS_ACCESS_MODES[number];

export const CHESS_PROMOTION_PIECES = ["queen", "rook", "bishop", "knight"] as const;
export type ChessPromotionPiece = typeof CHESS_PROMOTION_PIECES[number];

export const CHESS_COLORS = ["white", "black"] as const;
export type ChessColor = typeof CHESS_COLORS[number];

export const CHESS_PIECE_TYPES = ["pawn", "knight", "bishop", "rook", "queen", "king"] as const;
export type ChessPieceType = typeof CHESS_PIECE_TYPES[number];

export type ChessFile = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
export type ChessRank = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
export type ChessSquare = `${ChessFile}${ChessRank}`;

export interface ChessMatchSettings {
  bot?: GameBot;
  timeControl: ChessTimeControl;
  pauseWeekends: boolean;
  access: ChessAccessMode;
  opponentUserId?: string;
}

export interface ChessMoveInput {
  from: ChessSquare;
  to: ChessSquare;
  promotion?: ChessPromotionPiece;
}

export interface ChessMoveRecord extends ChessMoveInput {
  color: ChessColor;
  piece: ChessPieceType;
  captured?: ChessPieceType;
  san: string;
  playedAt: string;
}

export const CHESS_MATCH_RESULTS = [
  "checkmate",
  "resignation",
  "timeout",
  "stalemate",
  "insufficient_material",
  "threefold_repetition",
  "fifty_move_rule",
  "fivefold_repetition",
  "seventy_five_move_rule",
  "agreement",
] as const;
export type ChessMatchResult = typeof CHESS_MATCH_RESULTS[number];

export interface ChessMatchOutcome {
  result: ChessMatchResult;
  winnerUserId?: string;
}

export interface ChessMatchClock {
  whiteRemainingMs: number | null;
  blackRemainingMs: number | null;
  activeSince?: string;
}

export interface ChessMatchRecord {
  id: string;
  definitionId: typeof CHESS_DEFINITION_ID;
  objectId: string;
  creatorUserId: string;
  whiteUserId: string;
  blackUserId?: string;
  reservedBlackUserId?: string;
  settings: ChessMatchSettings;
  status: "waiting" | "active" | "completed";
  fen: string;
  moves: ChessMoveRecord[];
  clock: ChessMatchClock;
  drawOfferByUserId?: string;
  outcome?: ChessMatchOutcome;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ChessMatchSummary {
  id: string;
  creatorUserId: string;
  whiteUserId: string;
  blackUserId?: string;
  reservedBlackUserId?: string;
  settings: ChessMatchSettings;
  status: ChessMatchRecord["status"];
  turn?: ChessColor;
  outcome?: ChessMatchOutcome;
  updatedAt: string;
}

export interface ChessLobbyState {
  definitionId: typeof CHESS_DEFINITION_ID;
  objectId: string;
  floorId: string;
  matches: ChessMatchSummary[];
}

export interface ChessBoardPiece {
  square: ChessSquare;
  color: ChessColor;
  type: ChessPieceType;
}

export interface ChessLegalMove extends ChessMoveInput {}

export interface ChessDrawClaim {
  result: "threefold_repetition" | "fifty_move_rule";
  move?: ChessMoveInput;
}

export interface ChessClockView {
  whiteRemainingMs: number | null;
  blackRemainingMs: number | null;
  activeColor?: ChessColor;
  running: boolean;
  pausedForWeekend: boolean;
}

export interface ChessMatchView extends Omit<ChessMatchRecord, "clock"> {
  botError?: string;
  board: ChessBoardPiece[];
  turn: ChessColor;
  inCheck: boolean;
  legalMoves: ChessLegalMove[];
  drawClaims: ChessDrawClaim[];
  clock: ChessClockView;
  serverNow: string;
}
