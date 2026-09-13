import type {
  TicTacToeCommand,
  TicTacToeMark,
  UltimateBoardResult,
  UltimateTicTacToeState,
} from "@workhard/shared";
import {
  findWinningLine,
  isBoardIndex,
  type TicTacToeStateCore,
  type TicTacToeVariantEngine,
} from "./variant.js";

export class UltimateTicTacToe implements TicTacToeVariantEngine {
  readonly variantId = "ultimate" as const;
  clone(): UltimateTicTacToe {
    return Object.assign(new UltimateTicTacToe(), structuredClone(this));
  }
  private readonly boards: Array<Array<TicTacToeMark | null>> = Array.from(
    { length: 9 },
    () => Array(9).fill(null),
  );
  private readonly boardResults: UltimateBoardResult[] = Array(9).fill(null);
  private requiredBoard: number | null = null;
  private winningLine: number[] | undefined;
  private winner: TicTacToeMark | undefined;

  get winnerMark(): TicTacToeMark | undefined {
    return this.winner;
  }

  get isDraw(): boolean {
    return !this.winner && this.boardResults.every(Boolean);
  }

  play(mark: TicTacToeMark, command: TicTacToeCommand): boolean {
    if (
      command.kind !== "ultimate.place"
      || !isBoardIndex(command.board)
      || !isBoardIndex(command.cell)
      || (this.requiredBoard !== null && command.board !== this.requiredBoard)
      || this.boardResults[command.board]
      || this.boards[command.board]![command.cell]
    ) {
      return false;
    }

    const board = this.boards[command.board]!;
    board[command.cell] = mark;
    if (findWinningLine(board, mark)) {
      this.boardResults[command.board] = mark;
    } else if (board.every(Boolean)) {
      this.boardResults[command.board] = "draw";
    }

    this.winningLine = findWinningLine(this.boardResults, mark);
    if (this.winningLine) {
      this.winner = mark;
    }
    this.requiredBoard = this.boardResults[command.cell] ? null : command.cell;
    return true;
  }

  createState(core: TicTacToeStateCore): UltimateTicTacToeState {
    return {
      ...core,
      variantId: this.variantId,
      boards: this.boards.map((board) => [...board]),
      boardResults: [...this.boardResults],
      activeBoard: this.requiredBoard,
      ...(this.winningLine ? { winningLine: [...this.winningLine] } : {}),
    };
  }
}
