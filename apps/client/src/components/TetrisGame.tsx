import { ArrowDown, ArrowLeft, ArrowRight, Check, Pause, Play, RotateCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GameRoundState, GameState, Member, TetrisCommand } from "@workhard/shared";
import { useModalFocus } from "../hooks/useModalFocus";
import { useTetrisKeyboard } from "../hooks/useTetrisKeyboard";
import { IconButton } from "./IconButton";
import { TetrisMark } from "./TetrisMark";
import {
  TetrisPiecePreview,
  TETRIS_BLOCK_COLORS,
  TETROMINO_COLORS,
} from "./TetrisPiecePreview";

interface TetrisGameProps {
  state: GameState | undefined;
  round: GameRoundState;
  members: Member[];
  currentUserId: string;
  onCommand: (command: TetrisCommand) => void;
  onClose: () => void;
}

const EMPTY_GRID = Array.from({ length: 20 }, () => Array<number>(10).fill(0));

export function TetrisGame({ state, round, members, currentUserId, onCommand, onClose }: TetrisGameProps) {
  const dialogRef = useModalFocus<HTMLElement>(onClose);
  const currentPlayer = round.participants.find((participant) => participant.userId === currentUserId);
  const multiplayer = round.participants.length > 1;
  const canControl = round.status === "playing" && currentPlayer?.status === "playing" && state?.running === true;
  const activeCellKeys = useMemo(
    () => new Set(state?.activeCells.map(({ row, column }) => `${row}-${column}`) ?? []),
    [state?.activeCells],
  );
  const ghostCellKeys = useMemo(
    () => new Set(state?.ghostCells.map(({ row, column }) => `${row}-${column}`) ?? []),
    [state?.ghostCells],
  );
  const currentLines = state?.lines ?? 0;
  const previousLinesRef = useRef(currentLines);
  const [lineClearSequence, setLineClearSequence] = useState(0);

  useTetrisKeyboard({
    enabled: canControl,
    allowPause: !multiplayer,
    allowHold: state?.canHold === true,
    onCommand,
  });

  useEffect(() => {
    if (currentLines > previousLinesRef.current) {
      setLineClearSequence((current) => current + 1);
    }
    previousLinesRef.current = currentLines;
  }, [currentLines]);

  const boardStatus = getBoardStatus(round, currentPlayer, state, multiplayer);
  const grid = state?.grid ?? EMPTY_GRID;
  const stackIsHigh = grid.slice(0, 5).some((row, rowIndex) =>
    row.some((cell, columnIndex) => cell > 0 && !activeCellKeys.has(`${rowIndex}-${columnIndex}`)),
  );

  return (
    <div className="modal-backdrop game-backdrop">
      <section ref={dialogRef} className="tetris-game" role="dialog" aria-modal="true" aria-labelledby="tetris-title" tabIndex={-1}>
        <header>
          <div><TetrisMark className="game-mini-mark" /><h2 id="tetris-title">Tetris</h2></div>
          <IconButton label="Close game" icon={X} onClick={onClose} />
        </header>

        <div className="tetris-content">
          <aside className="tetris-left-rail">
            <section className={`tetris-preview-panel tetris-hold${state?.canHold === false ? " is-locked" : ""}`}>
              <h3>Hold <kbd>C</kbd></h3>
              <TetrisPiecePreview
                key={state?.heldPiece ?? "empty"}
                piece={state?.heldPiece ?? null}
                label={state?.heldPiece ? `Held ${state.heldPiece} piece` : "Hold is empty"}
              />
            </section>

            <div className="tetris-key-guide" aria-label="Keyboard controls">
              <div><kbd>← →</kbd><span>Move</span></div>
              <div><kbd>↑</kbd><span>Rotate</span></div>
              <div><kbd>↓</kbd><span>Soft drop</span></div>
              <div><kbd>Space</kbd><span>Drop</span></div>
            </div>
          </aside>

          <div className="tetris-playfield">
            <div className={`tetris-board-frame${stackIsHigh ? " is-danger" : ""}`}>
              <div className="tetris-board" role="img" aria-label="Tetris board">
                {grid.flatMap((row, rowIndex) =>
                  row.map((cell, columnIndex) => {
                    const key = `${rowIndex}-${columnIndex}`;
                    const active = activeCellKeys.has(key);
                    const ghost = cell === 0 && ghostCellKeys.has(key);
                    const cellColor = cell > 0
                      ? TETRIS_BLOCK_COLORS[cell] ?? "#ffffff"
                      : ghost && state?.activePiece
                        ? TETROMINO_COLORS[state.activePiece]
                        : undefined;
                    const className = [
                      "tetris-cell",
                      cell > 0 ? "is-filled" : "",
                      active ? "is-active" : "",
                      ghost ? "is-ghost" : "",
                    ].filter(Boolean).join(" ");
                    const style = cellColor
                      ? { "--tetris-cell-color": cellColor } as CSSProperties
                      : undefined;
                    return <span key={key} className={className} style={style} />;
                  }),
                )}
                {lineClearSequence > 0 && <span key={lineClearSequence} className="tetris-line-flash" />}
                {boardStatus && (
                  <div className="board-state">
                    {state?.paused ? <Pause size={20} /> : currentPlayer?.status === "finished" ? <Check size={20} /> : null}
                    {boardStatus}
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="tetris-sidebar">
            <section className="tetris-preview-panel tetris-next">
              <h3>Next</h3>
              <div className="tetris-next-list">
                {(state?.nextPieces ?? []).map((piece, index) => (
                  <TetrisPiecePreview key={`${index}-${piece}`} piece={piece} label={`${piece} piece next`} />
                ))}
              </div>
            </section>

            <dl className="tetris-stats" aria-label="Game statistics">
              <div className="score"><dt>Score</dt><dd key={state?.score ?? currentPlayer?.score ?? 0}>{(state?.score ?? currentPlayer?.score ?? 0).toLocaleString()}</dd></div>
              <div><dt>Lines</dt><dd key={state?.lines ?? currentPlayer?.lines ?? 0}>{state?.lines ?? currentPlayer?.lines ?? 0}</dd></div>
              <div><dt>Level</dt><dd key={state?.level ?? currentPlayer?.level ?? 1}>{state?.level ?? currentPlayer?.level ?? 1}</dd></div>
            </dl>

            {multiplayer && (
              <section className="tetris-round-players">
                <h3>Round</h3>
                <ol>
                  {[...round.participants]
                    .sort((left, right) => (left.placement ?? Infinity) - (right.placement ?? Infinity) || right.score - left.score)
                    .map((participant) => {
                      const member = members.find((candidate) => candidate.id === participant.userId);
                      return (
                        <li key={participant.userId} aria-current={participant.userId === currentUserId ? "true" : undefined}>
                          <span>{participant.placement ?? (participant.status === "finished" ? <Check size={13} /> : "\u2022")}</span>
                          <span>{participant.userId === currentUserId ? "You" : member?.name ?? "Player"}</span>
                          <strong>{participant.score.toLocaleString()}</strong>
                        </li>
                      );
                    })}
                </ol>
              </section>
            )}
          </aside>

          {canControl && (
            <div className="tetris-controls" aria-label="Game controls">
              <button aria-label="Move left" onClick={() => onCommand("left")}><ArrowLeft size={19} /></button>
              <button aria-label="Rotate" onClick={() => onCommand("rotate")}><RotateCw size={19} /></button>
              <button aria-label="Move right" onClick={() => onCommand("right")}><ArrowRight size={19} /></button>
              <button aria-label="Soft drop" onClick={() => onCommand("down")}><ArrowDown size={19} /></button>
              <button disabled={!state.canHold} onClick={() => onCommand("hold")}>Hold</button>
              <button className="hard-drop" onClick={() => onCommand("drop")}>Drop</button>
              {!multiplayer && (
                <button className="pause-control" onClick={() => onCommand("pause")}>
                  {state.paused ? <Play size={16} /> : <Pause size={16} />}
                  {state.paused ? "Resume" : "Pause"}
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function getBoardStatus(
  round: GameRoundState,
  player: GameRoundState["participants"][number] | undefined,
  state: GameState | undefined,
  multiplayer: boolean,
): string | undefined {
  if (!state) {
    return "Starting";
  }
  if (state.paused) {
    return "Paused";
  }
  if (round.status === "completed") {
    if (!multiplayer) {
      return "Finished";
    }
    return player?.placement === 1 ? "Winner" : player?.placement ? formatPlacement(player.placement) : "Finished";
  }
  return player?.status === "finished" || !state.running ? "Finished" : undefined;
}

function formatPlacement(placement: number): string {
  const lastTwoDigits = placement % 100;
  const suffix = lastTwoDigits >= 11 && lastTwoDigits <= 13
    ? "th"
    : placement % 10 === 1
      ? "st"
      : placement % 10 === 2
        ? "nd"
        : placement % 10 === 3
          ? "rd"
          : "th";
  return `${placement}${suffix}`;
}
