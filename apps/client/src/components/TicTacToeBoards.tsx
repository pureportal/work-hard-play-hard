import { useEffect, useState } from "react";
import {
  TIC_TAC_TOE_PIECE_SIZES,
  canCoverTicTacToePiece,
  type ClassicTicTacToeState,
  type StackingTicTacToePiece,
  type StackingTicTacToeState,
  type TicTacToeCommand,
  type TicTacToeMark,
  type TicTacToePieceSize,
} from "@workhard/shared";
import { BoardMark, CELL_NAMES } from "./TicTacToeBoardMark";

interface BoardProps<State> {
  state: State;
  currentUserId: string;
  onCommand: (command: TicTacToeCommand) => void;
}

export function ClassicBoard({ state, currentUserId, onCommand }: BoardProps<ClassicTicTacToeState>) {
  const canMove = state.status === "playing" && state.turnUserId === currentUserId;
  const winningCells = new Set(state.winningLine ?? []);
  return (
    <div className="tic-tac-toe-board is-classic" role="grid" aria-label="Classic board">
      {state.board.map((mark, cell) => (
        <button
          key={cell}
          type="button"
          role="gridcell"
          className={winningCells.has(cell) ? "is-winning" : ""}
          aria-label={mark ? `${CELL_NAMES[cell]}: ${mark.toUpperCase()}` : `Play ${CELL_NAMES[cell]}`}
          disabled={!canMove || mark !== null}
          onClick={() => onCommand({ kind: "classic.place", cell })}
        >
          <BoardMark mark={mark} />
        </button>
      ))}
    </div>
  );
}

export function StackingBoard({ state, currentUserId, onCommand }: BoardProps<StackingTicTacToeState>) {
  const player = state.players.find((candidate) => candidate.userId === currentUserId);
  const mark = player?.mark;
  const opponentMark = mark === "x" ? "o" : "x";
  const canMove = state.status === "playing" && state.turnUserId === currentUserId && Boolean(mark);
  const [action, setAction] = useState<TicTacToePieceSize | "move">("small");
  const [sourceCell, setSourceCell] = useState<number>();
  const winningCells = new Set(state.winningLine ?? []);

  useEffect(() => {
    setSourceCell(undefined);
  }, [state.moveNumber, state.roundId]);

  useEffect(() => {
    if (mark && action !== "move" && state.reserves[mark][action] === 0) {
      setAction(TIC_TAC_TOE_PIECE_SIZES.find((size) => state.reserves[mark][size] > 0) ?? "move");
    }
  }, [action, mark, state.reserves]);

  const chooseAction = (next: TicTacToePieceSize | "move") => {
    setAction(next);
    setSourceCell(undefined);
  };

  const playCell = (cell: number) => {
    if (!mark || !canMove) {
      return;
    }
    if (action !== "move") {
      onCommand({ kind: "stacking.place", cell, size: action });
      return;
    }
    if (sourceCell === undefined) {
      setSourceCell(cell);
      return;
    }
    if (sourceCell === cell) {
      setSourceCell(undefined);
      return;
    }
    onCommand({ kind: "stacking.move", fromCell: sourceCell, toCell: cell });
  };

  return (
    <div className="tic-tac-toe-stacking-layout">
      <div className="tic-tac-toe-opponent-reserves" role="group" aria-label="Opponent pieces">
        <span>Opponent</span>
        {TIC_TAC_TOE_PIECE_SIZES.map((size) => (
          <span key={size} aria-label={`${capitalize(size)}, ${state.reserves[opponentMark][size]} remaining`}>
            <span className={`stacking-piece is-${size} is-${opponentMark}`} aria-hidden="true" />
            <strong>{state.reserves[opponentMark][size]}</strong>
          </span>
        ))}
      </div>
      <div className="tic-tac-toe-piece-picker" role="group" aria-label="Pieces">
        {TIC_TAC_TOE_PIECE_SIZES.map((size) => {
          const remaining = mark ? state.reserves[mark][size] : 0;
          return (
            <button
              key={size}
              type="button"
              aria-label={`${capitalize(size)}, ${remaining} remaining`}
              aria-pressed={action === size}
              disabled={!canMove || remaining === 0}
              onClick={() => chooseAction(size)}
            >
              <span className={`stacking-piece is-${size} is-${mark ?? "x"}`} aria-hidden="true" />
              <span>{capitalize(size)}</span>
              <strong>{remaining}</strong>
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={action === "move"}
          disabled={!canMove || !state.board.some((piece) => piece?.mark === mark)}
          onClick={() => chooseAction("move")}
        >
          Move
        </button>
      </div>

      <div className="tic-tac-toe-board is-stacking" role="grid" aria-label="Stacking board">
        {state.board.map((piece, cell) => {
          const enabled = canMove && isStackingCellEnabled(state, action, sourceCell, cell, mark);
          return (
            <button
              key={cell}
              type="button"
              role="gridcell"
              className={[
                winningCells.has(cell) ? "is-winning" : "",
                sourceCell === cell ? "is-selected" : "",
                enabled && sourceCell !== undefined && sourceCell !== cell ? "is-available" : "",
              ].filter(Boolean).join(" ")}
              aria-label={stackingCellLabel(cell, piece)}
              aria-pressed={sourceCell === cell ? true : undefined}
              disabled={!enabled}
              onClick={() => playCell(cell)}
            >
              {piece && <span className={`stacking-piece is-${piece.size} is-${piece.mark}`} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function isStackingCellEnabled(
  state: StackingTicTacToeState,
  action: TicTacToePieceSize | "move",
  sourceCell: number | undefined,
  cell: number,
  mark: TicTacToeMark | undefined,
): boolean {
  if (!mark) {
    return false;
  }
  const top = state.board[cell] ?? undefined;
  if (action !== "move") {
    return state.reserves[mark][action] > 0 && canCoverTicTacToePiece(top, action);
  }
  if (sourceCell === undefined) {
    return top?.mark === mark;
  }
  if (sourceCell === cell) {
    return true;
  }
  const source = state.board[sourceCell] ?? undefined;
  return Boolean(source?.mark === mark && canCoverTicTacToePiece(top, source.size));
}

function stackingCellLabel(cell: number, piece: StackingTicTacToePiece | null): string {
  return piece
    ? `${CELL_NAMES[cell]}: ${capitalize(piece.size)} ${piece.mark.toUpperCase()}`
    : `Play ${CELL_NAMES[cell]}`;
}

function capitalize(value: string): string {
  return `${value[0]!.toUpperCase()}${value.slice(1)}`;
}
