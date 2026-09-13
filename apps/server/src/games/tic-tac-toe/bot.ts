import {
  TIC_TAC_TOE_PIECE_SIZES,
  canCoverTicTacToePiece,
  type BotDifficulty,
  type TicTacToeCommand,
  type TicTacToeGameState,
  type TicTacToeMark,
} from "@workhard/shared";
import type { TicTacToeGame } from "./game.js";
import { WINNING_LINES } from "./variant.js";

const CELL_ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7];
const SEARCH_LIMIT = Symbol("search limit");

export function legalTicTacToeCommands(state: TicTacToeGameState): TicTacToeCommand[] {
  if (state.status !== "playing") return [];
  if (state.variantId === "classic") {
    return CELL_ORDER.filter((cell) => !state.board[cell]).map((cell) => ({ kind: "classic.place", cell }));
  }
  if (state.variantId === "ultimate") {
    return CELL_ORDER.filter((board) => !state.boardResults[board] && (state.activeBoard === null || state.activeBoard === board))
      .flatMap((board) => CELL_ORDER.filter((cell) => !state.boards[board]![cell])
        .map((cell) => ({ kind: "ultimate.place" as const, board, cell })));
  }
  const mark = state.players.find((player) => player.userId === state.turnUserId)!.mark;
  const commands: TicTacToeCommand[] = [];
  for (const cell of CELL_ORDER) {
    for (const size of TIC_TAC_TOE_PIECE_SIZES) {
      if (state.reserves[mark][size] > 0 && canCoverTicTacToePiece(state.board[cell], size)) {
        commands.push({ kind: "stacking.place", cell, size });
      }
    }
    const piece = state.board[cell];
    if (piece?.mark === mark) {
      for (const toCell of CELL_ORDER) {
        if (cell !== toCell && canCoverTicTacToePiece(state.board[toCell], piece.size)) {
          commands.push({ kind: "stacking.move", fromCell: cell, toCell });
        }
      }
    }
  }
  return commands;
}

export function chooseTicTacToeMove(game: TicTacToeGame, difficulty: BotDifficulty, random = Math.random): TicTacToeCommand {
  const initial = game.state;
  const moves = legalTicTacToeCommands(initial);
  if (!moves.length) throw new Error("GAME_BOT_NO_MOVE");
  if (difficulty === "easy") return moves[Math.floor(random() * moves.length)]!;
  const botUserId = initial.turnUserId!;
  const botMark = initial.players.find((player) => player.userId === botUserId)!.mark;
  const fullSearch = initial.variantId === "classic" && difficulty === "hard";
  const maxDepth = fullSearch ? 9 : difficulty === "hard" ? 4 : 2;
  const nodeLimit = fullSearch ? Infinity : difficulty === "hard" ? 4_000 : 1_000;
  let nodes = 0;
  let bestMove = moves[0]!;

  const search = (position: TicTacToeGame, depth: number, alpha: number, beta: number): number => {
    if (++nodes > nodeLimit) throw SEARCH_LIMIT;
    const state = position.state;
    if (state.winnerUserId) return state.winnerUserId === botUserId ? 100_000 + depth : -100_000 - depth;
    if (state.status === "draw") return 0;
    if (depth === 0) return evaluate(state, botMark);
    const maximizing = state.turnUserId === botUserId;
    let value = maximizing ? -Infinity : Infinity;
    const commands = legalTicTacToeCommands(state);
    if (!commands.length) return 0;
    for (const command of commands) {
      const child = position.clone();
      child.command(state.turnUserId!, command);
      const score = search(child, depth - 1, alpha, beta);
      value = maximizing ? Math.max(value, score) : Math.min(value, score);
      if (maximizing) alpha = Math.max(alpha, value);
      else beta = Math.min(beta, value);
      if (beta <= alpha) break;
    }
    return value;
  };

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    let iterationBest = bestMove;
    let bestScore = -Infinity;
    try {
      for (const command of moves) {
        const child = game.clone();
        child.command(botUserId, command);
        const score = search(child, depth - 1, bestScore, Infinity);
        if (score > bestScore) {
          bestScore = score;
          iterationBest = command;
        }
      }
      bestMove = iterationBest;
    } catch (error) {
      if (error !== SEARCH_LIMIT) throw error;
      break;
    }
  }
  return bestMove;
}

function lineScore(board: readonly (TicTacToeMark | "draw" | null)[], mark: TicTacToeMark): number {
  const opponent = mark === "x" ? "o" : "x";
  return WINNING_LINES.reduce((total, line) => {
    const values = line.map((cell) => board[cell]);
    const own = values.filter((value) => value === mark).length;
    const other = values.filter((value) => value === opponent).length;
    if (values.includes("draw") || (own && other)) return total;
    return total + (own ? 4 ** own : other ? -(4 ** other) : 0);
  }, 0);
}

function evaluate(state: TicTacToeGameState, mark: TicTacToeMark): number {
  if (state.variantId === "ultimate") {
    return lineScore(state.boardResults, mark) * 100 + state.boards.reduce((score, board, index) =>
      score + (state.boardResults[index] ? 0 : lineScore(board, mark)), 0);
  }
  return lineScore(state.variantId === "classic" ? state.board : state.board.map((piece) => piece?.mark ?? null), mark);
}
