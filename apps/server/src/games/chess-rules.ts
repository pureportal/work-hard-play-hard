import type {
  ChessBoardPiece,
  ChessColor,
  ChessDrawClaim,
  ChessMatchOutcome,
  ChessMatchRecord,
  ChessMoveInput,
  ChessMoveRecord,
  ChessPieceType,
  ChessPromotionPiece,
} from "@workhard/shared";
import { Chess, DEFAULT_POSITION, type Color, type Move, type PieceSymbol } from "chess.js";

export function hydrateChess(match: ChessMatchRecord): Chess {
  const chess = new Chess();
  try {
    for (const move of match.moves) {
      const replayed = chess.move(engineMove(move));
      if (replayed.san !== move.san) {
        throw new Error("CHESS_STATE_INVALID");
      }
    }
  } catch {
    throw new Error("CHESS_STATE_INVALID");
  }
  if (chess.fen() !== match.fen) {
    throw new Error("CHESS_STATE_INVALID");
  }
  return chess;
}

export function engineMove(move: ChessMoveInput) {
  return {
    from: move.from,
    to: move.to,
    ...(move.promotion ? { promotion: promotionSymbol(move.promotion) } : {}),
  };
}

export function moveRecord(move: Move, now: Date): ChessMoveRecord {
  return {
    from: move.from,
    to: move.to,
    color: colorName(move.color),
    piece: pieceName(move.piece),
    ...(move.captured ? { captured: pieceName(move.captured) } : {}),
    ...(move.promotion ? { promotion: promotionName(move.promotion) } : {}),
    san: move.san,
    playedAt: now.toISOString(),
  };
}

export function outcomeAfterMove(chess: Chess, winnerUserId: string): ChessMatchOutcome | undefined {
  if (chess.isCheckmate()) {
    return { result: "checkmate", winnerUserId };
  }
  if (chess.isStalemate()) {
    return { result: "stalemate" };
  }
  if (chess.isInsufficientMaterial()) {
    return { result: "insufficient_material" };
  }
  if (Number(chess.fen().split(" ")[4]) >= 150) {
    return { result: "seventy_five_move_rule" };
  }
  if (chess.isThreefoldRepetition()) {
    const position = chess.fen().split(" ").slice(0, 4).join(" ");
    const history = chess.history({ verbose: true });
    const positions = [history[0]?.before ?? DEFAULT_POSITION, ...history.map((move) => move.after)];
    if (positions.filter((fen) => fen.split(" ").slice(0, 4).join(" ") === position).length >= 5) {
      return { result: "fivefold_repetition" };
    }
  }
  return undefined;
}

export function drawClaimResult(chess: Chess): ChessDrawClaim["result"] | undefined {
  if (chess.isCheckmate()) {
    return undefined;
  }
  if (chess.isThreefoldRepetition()) {
    return "threefold_repetition";
  }
  if (chess.isDrawByFiftyMoves()) {
    return "fifty_move_rule";
  }
  return undefined;
}

export function availableDrawClaims(chess: Chess): ChessDrawClaim[] {
  const result = drawClaimResult(chess);
  if (result) {
    return [{ result }];
  }
  const claims: ChessDrawClaim[] = [];
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    try {
      const intendedResult = drawClaimResult(chess);
      if (intendedResult) {
        claims.push({
          result: intendedResult,
          move: {
            from: move.from,
            to: move.to,
            ...(move.promotion ? { promotion: promotionName(move.promotion) } : {}),
          },
        });
      }
    } finally {
      chess.undo();
    }
  }
  return claims;
}

export function canPossiblyMate(chess: Chess, color: Color): boolean {
  const pieces = chess.board().flat().filter((piece) => piece !== null);
  const own = pieces.filter((piece) => piece.color === color && piece.type !== "k");
  if (own.some((piece) => ["p", "r", "q"].includes(piece.type))) {
    return true;
  }
  if (own.some((piece) => piece.type === "n")) {
    return own.length > 1 || pieces.some((piece) => piece.color !== color && ["p", "n", "b", "r"].includes(piece.type));
  }
  if (own.length === 0) {
    return false;
  }
  const bishopSquares = new Set(pieces.filter((piece) => piece.type === "b").map((piece) => (
    (piece.square.charCodeAt(0) + Number(piece.square[1])) % 2
  )));
  return bishopSquares.size > 1 || pieces.some((piece) => piece.type === "p" || piece.type === "n");
}

export function boardPieces(chess: Chess): ChessBoardPiece[] {
  return chess.board().flatMap((rank) => rank.flatMap((piece) => piece ? [{
    square: piece.square,
    color: colorName(piece.color),
    type: pieceName(piece.type),
  }] : []));
}

export function colorName(color: Color): ChessColor {
  return color === "w" ? "white" : "black";
}

function pieceName(piece: PieceSymbol): ChessPieceType {
  return ({ p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" } as const)[piece];
}

export function promotionName(piece: PieceSymbol): ChessPromotionPiece {
  const promotion = ({ n: "knight", b: "bishop", r: "rook", q: "queen" } as const)[piece as "n" | "b" | "r" | "q"];
  if (!promotion) {
    throw new Error("CHESS_STATE_INVALID");
  }
  return promotion;
}

function promotionSymbol(piece: ChessPromotionPiece): PieceSymbol {
  return ({ knight: "n", bishop: "b", rook: "r", queen: "q" } as const)[piece];
}
