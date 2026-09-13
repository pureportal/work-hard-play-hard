import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import type { BotDifficulty, ChessMoveInput, ChessMoveRecord, ChessPromotionPiece, ChessSquare } from "@workhard/shared";

const require = createRequire(import.meta.url);
const LEVELS = {
  easy: { skill: 0, depth: 2, timeMs: 150 },
  medium: { skill: 5, depth: 8, timeMs: 400 },
  hard: { skill: 20, depth: 16, timeMs: 900 },
} as const;
const PROMOTIONS: Record<string, ChessPromotionPiece> = { q: "queen", r: "rook", b: "bishop", n: "knight" };

export type ChessBotSearch = (moves: readonly ChessMoveRecord[], difficulty: BotDifficulty, signal: AbortSignal) => Promise<ChessMoveInput>;

export const findStockfishMove: ChessBotSearch = (moves, difficulty, signal) => new Promise((resolve, reject) => {
  signal.throwIfAborted();
  const engine = spawn(process.execPath, [require.resolve("stockfish/bin/stockfish-18-lite-single.js")], {
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });
  const lines = createInterface({ input: engine.stdout });
  const level = LEVELS[difficulty];
  let settled = false;
  const finish = (error?: Error, move?: ChessMoveInput) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    lines.close();
    engine.kill();
    if (error) reject(error);
    else resolve(move!);
  };
  const abort = () => finish(new Error("CHESS_BOT_CANCELLED"));
  const timeout = setTimeout(() => finish(new Error("CHESS_BOT_TIMEOUT")), 10_000);
  const send = (command: string) => engine.stdin.write(`${command}\n`);
  signal.addEventListener("abort", abort, { once: true });
  engine.on("error", () => finish(new Error("CHESS_BOT_UNAVAILABLE")));
  engine.stdin.on("error", () => finish(new Error("CHESS_BOT_UNAVAILABLE")));
  engine.on("exit", () => finish(new Error("CHESS_BOT_UNAVAILABLE")));
  lines.on("line", (line) => {
    if (line === "uciok") {
      send("setoption name Hash value 16");
      send(`setoption name Skill Level value ${level.skill}`);
      send("ucinewgame");
      send("isready");
    } else if (line === "readyok") {
      const history = moves.map((move) => `${move.from}${move.to}${move.promotion
        ? Object.entries(PROMOTIONS).find(([, piece]) => piece === move.promotion)![0] : ""}`).join(" ");
      send(`position startpos${history ? ` moves ${history}` : ""}`);
      send(`go depth ${level.depth} movetime ${level.timeMs}`);
    } else if (line.startsWith("bestmove ")) {
      const match = /^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?(?: |$)/.exec(line);
      if (!match) return finish(new Error("CHESS_BOT_NO_MOVE"));
      finish(undefined, {
        from: match[1] as ChessSquare,
        to: match[2] as ChessSquare,
        ...(match[3] ? { promotion: PROMOTIONS[match[3]]! } : {}),
      });
    }
  });
  send("uci");
});
