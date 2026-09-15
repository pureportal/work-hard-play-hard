import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { TicTacToeCommand, UltimateTicTacToeState } from "@workhard/shared";
import { BoardMark, CELL_NAMES } from "./TicTacToeBoardMark";

const COMPACT_BOARD_QUERY = "(max-width: 700px), (max-height: 520px) and (pointer: coarse)";

function subscribeToCompactBoard(onChange: () => void) {
  const query = window.matchMedia(COMPACT_BOARD_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isCompactBoard() {
  return window.matchMedia(COMPACT_BOARD_QUERY).matches;
}

interface UltimateBoardProps {
  state: UltimateTicTacToeState;
  currentUserId: string;
  onCommand: (command: TicTacToeCommand) => void;
}

export function UltimateBoard({ state, currentUserId, onCommand }: UltimateBoardProps) {
  const compact = useSyncExternalStore(subscribeToCompactBoard, isCompactBoard, () => false);
  const [focusedBoard, setFocusedBoard] = useState<number | null>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const canMove = state.status === "playing" && state.turnUserId === currentUserId;
  const winningBoards = new Set(state.winningLine ?? []);
  const focusedBoardIsOpen = focusedBoard !== null && !state.boardResults[focusedBoard]
    && (state.activeBoard === null || state.activeBoard === focusedBoard);

  useEffect(() => {
    if (focusedBoard !== null) {
      (zoomRef.current ?? overviewRef.current)?.closest<HTMLElement>(".arcade-game")?.focus({ preventScroll: true });
    }
    setFocusedBoard(null);
  }, [state.moveNumber, state.roundId]);

  useEffect(() => {
    if (compact && focusedBoard !== null) {
      zoomRef.current?.querySelector<HTMLButtonElement>('[role="gridcell"]:not(:disabled)')?.focus({ preventScroll: true });
    }
  }, [compact, focusedBoard]);

  const showOverview = () => {
    setFocusedBoard(null);
    requestAnimationFrame(() => overviewRef.current?.querySelector<HTMLButtonElement>(`[data-board="${focusedBoard}"]`)?.focus({ preventScroll: true }));
  };

  const cells = (boardIndex: number, active: boolean) => state.boards[boardIndex]!.map((mark, cell) => (
    <button key={cell} type="button" role="gridcell"
      aria-label={mark
        ? `${CELL_NAMES[boardIndex]} board, ${CELL_NAMES[cell]}: ${mark.toUpperCase()}`
        : `Play ${CELL_NAMES[cell]} in ${CELL_NAMES[boardIndex]} board`}
      disabled={!canMove || !active || Boolean(state.boardResults[boardIndex]) || mark !== null}
      onClick={() => onCommand({ kind: "ultimate.place", board: boardIndex, cell })}>
      <BoardMark mark={mark} />
    </button>
  ));

  if (compact && focusedBoard !== null && focusedBoardIsOpen && canMove) {
    return (
      <div ref={zoomRef} className="tic-tac-toe-board-focus" onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          showOverview();
        }
      }}>
        <div className="tic-tac-toe-board-focus-header">
          <button type="button" className="secondary-button" onClick={showOverview}><ArrowLeft size={16} />All boards</button>
          <strong>{CELL_NAMES[focusedBoard]} board</strong>
        </div>
        <div className="tic-tac-toe-board" role="grid" aria-label={`${CELL_NAMES[focusedBoard]} board`}>
          {cells(focusedBoard, true)}
        </div>
      </div>
    );
  }

  return (
    <div ref={overviewRef} className="tic-tac-toe-ultimate-board" role="grid" aria-label="Ultimate board">
      {state.boards.map((board, boardIndex) => {
        const result = state.boardResults[boardIndex];
        const active = state.status === "playing" && (state.activeBoard === null || state.activeBoard === boardIndex);
        const className = ["tic-tac-toe-local-board", active && !result ? "is-active" : "", result ? "is-closed" : "",
          winningBoards.has(boardIndex) ? "is-winning" : ""].filter(Boolean).join(" ");
        const label = `${CELL_NAMES[boardIndex]} board${result ? `: ${result === "draw" ? "draw" : `${result.toUpperCase()} won`}` : ""}`;
        const resultMark = result && result !== "draw" ? <BoardMark mark={result} className="local-board-result" /> : null;
        return compact ? (
          <button key={boardIndex} type="button" className={`${className} tic-tac-toe-board-overview`} role="gridcell"
            data-board={boardIndex} aria-label={active && !result && canMove ? `Open ${label}` : label}
            aria-description={board.flatMap((mark, cell) => mark ? [`${CELL_NAMES[cell]} ${mark.toUpperCase()}`] : []).join(", ") || undefined}
            disabled={!canMove || !active || Boolean(result)} onClick={() => setFocusedBoard(boardIndex)}>
            <span className="tic-tac-toe-overview-cells" aria-hidden="true">
              {board.map((mark, cell) => <span key={cell}><BoardMark mark={mark} /></span>)}
            </span>
            {resultMark}
          </button>
        ) : (
          <div key={boardIndex} className={className} role="rowgroup" aria-label={label}>
            {cells(boardIndex, active)}
            {resultMark}
          </div>
        );
      })}
    </div>
  );
}
