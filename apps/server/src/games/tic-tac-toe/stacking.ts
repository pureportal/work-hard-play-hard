import {
  TIC_TAC_TOE_MARKS,
  TIC_TAC_TOE_PIECE_SIZES,
  canCoverTicTacToePiece,
  type StackingTicTacToePiece,
  type StackingTicTacToeReserves,
  type StackingTicTacToeState,
  type TicTacToeCommand,
  type TicTacToeMark,
  type TicTacToePieceSize,
} from "@workhard/shared";
import {
  findWinningLine,
  isBoardIndex,
  type TicTacToeStateCore,
  type TicTacToeVariantEngine,
} from "./variant.js";

export class StackingTicTacToe implements TicTacToeVariantEngine {
  readonly variantId = "stacking" as const;
  clone(): StackingTicTacToe {
    return Object.assign(new StackingTicTacToe(), structuredClone(this));
  }
  private readonly board: StackingTicTacToePiece[][] = Array.from({ length: 9 }, () => []);
  private readonly reserves = createReserves();
  private winningLine: number[] | undefined;
  private winner: TicTacToeMark | undefined;

  get winnerMark(): TicTacToeMark | undefined {
    return this.winner;
  }

  get isDraw(): boolean {
    return false;
  }

  play(mark: TicTacToeMark, command: TicTacToeCommand): boolean {
    if (command.kind === "stacking.place") {
      return this.placeFromReserve(mark, command.cell, command.size);
    }
    if (command.kind === "stacking.move") {
      return this.moveBoardPiece(mark, command.fromCell, command.toCell);
    }
    return false;
  }

  createState(core: TicTacToeStateCore): StackingTicTacToeState {
    return {
      ...core,
      variantId: this.variantId,
      board: this.board.map((_, cell) => {
        const piece = this.topPiece(cell);
        return piece ? { ...piece } : null;
      }),
      reserves: structuredClone(this.reserves),
      ...(this.winningLine ? { winningLine: [...this.winningLine] } : {}),
    };
  }

  private placeFromReserve(mark: TicTacToeMark, cell: number, size: TicTacToePieceSize): boolean {
    if (!isBoardIndex(cell) || !TIC_TAC_TOE_PIECE_SIZES.includes(size) || this.reserves[mark][size] <= 0) {
      return false;
    }
    if (!canCoverTicTacToePiece(this.topPiece(cell), size)) {
      return false;
    }
    this.reserves[mark][size] -= 1;
    this.board[cell]!.push({ mark, size });
    this.finishMove(mark, false);
    return true;
  }

  private moveBoardPiece(mark: TicTacToeMark, fromCell: number, toCell: number): boolean {
    if (!isBoardIndex(fromCell) || !isBoardIndex(toCell) || fromCell === toCell) {
      return false;
    }
    const piece = this.topPiece(fromCell);
    if (!piece || piece.mark !== mark || !canCoverTicTacToePiece(this.topPiece(toCell), piece.size)) {
      return false;
    }
    this.board[fromCell]!.pop();
    this.board[toCell]!.push(piece);
    this.finishMove(mark, true);
    return true;
  }

  private finishMove(mark: TicTacToeMark, movedFromBoard: boolean): void {
    const visibleMarks = this.board.map((_, cell) => this.topPiece(cell)?.mark ?? null);
    const opponent = mark === "x" ? "o" : "x";
    const opponentLine = movedFromBoard ? findWinningLine(visibleMarks, opponent) : undefined;
    const playerLine = findWinningLine(visibleMarks, mark);
    this.winningLine = opponentLine ?? playerLine;
    this.winner = opponentLine ? opponent : playerLine ? mark : undefined;
  }

  private topPiece(cell: number): StackingTicTacToePiece | undefined {
    return this.board[cell]?.at(-1);
  }
}

function createReserves(): StackingTicTacToeReserves {
  return Object.fromEntries(TIC_TAC_TOE_MARKS.map((mark) => [
    mark,
    Object.fromEntries(TIC_TAC_TOE_PIECE_SIZES.map((size) => [size, 2])),
  ])) as StackingTicTacToeReserves;
}
