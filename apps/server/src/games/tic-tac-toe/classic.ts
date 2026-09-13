import type {
  ClassicTicTacToeState,
  TicTacToeCommand,
  TicTacToeMark,
} from "@workhard/shared";
import {
  findWinningLine,
  isBoardIndex,
  type TicTacToeStateCore,
  type TicTacToeVariantEngine,
} from "./variant.js";

export class ClassicTicTacToe implements TicTacToeVariantEngine {
  readonly variantId = "classic" as const;
  clone(): ClassicTicTacToe {
    return Object.assign(new ClassicTicTacToe(), structuredClone(this));
  }
  private readonly board: Array<TicTacToeMark | null> = Array(9).fill(null);
  private winningLine: number[] | undefined;
  private winner: TicTacToeMark | undefined;

  get winnerMark(): TicTacToeMark | undefined {
    return this.winner;
  }

  get isDraw(): boolean {
    return !this.winner && this.board.every(Boolean);
  }

  play(mark: TicTacToeMark, command: TicTacToeCommand): boolean {
    if (command.kind !== "classic.place" || !isBoardIndex(command.cell) || this.board[command.cell]) {
      return false;
    }
    this.board[command.cell] = mark;
    this.winningLine = findWinningLine(this.board, mark);
    if (this.winningLine) {
      this.winner = mark;
    }
    return true;
  }

  createState(core: TicTacToeStateCore): ClassicTicTacToeState {
    return {
      ...core,
      variantId: this.variantId,
      board: [...this.board],
      ...(this.winningLine ? { winningLine: [...this.winningLine] } : {}),
    };
  }
}
