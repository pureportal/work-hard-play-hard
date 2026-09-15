import { Check, Crown, Gamepad2, Pause, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import type { FallingBlocksGameState, GameRoundState, Member, FallingBlocksCommand } from "@workhard/shared";
import { FALLING_BLOCKS_HARD_CELL, FALLING_BLOCKS_MODE_LABELS } from "@workhard/shared";
import { GameResultActions } from "./GameResultActions";
import { GameExitPrompt } from "./GameExitPrompt";
import { useModalFocus } from "../hooks/useModalFocus";
import { useFallingBlocksKeyboard } from "../hooks/useFallingBlocksKeyboard";
import { IconButton } from "./IconButton";
import { FallingBlocksMark } from "./FallingBlocksMark";
import { FallingBlocksControls } from "./FallingBlocksControls";
import { FallingBlocksClearNotice } from "./FallingBlocksClearNotice";
import {
  FallingBlocksPiecePreview,
  FALLING_BLOCKS_BLOCK_COLORS,
  TETROMINO_COLORS,
} from "./FallingBlocksPiecePreview";

interface FallingBlocksGameProps {
  state: FallingBlocksGameState | undefined;
  round: GameRoundState;
  members: Member[];
  currentUserId: string;
  onCommand: (command: FallingBlocksCommand) => void;
  onClose: () => void;
  onPlayAgain?: (() => void) | undefined;
}

const EMPTY_GRID = Array.from({ length: 20 }, () => Array<number>(10).fill(0));

export function FallingBlocksGame({ state, round, members, currentUserId, onCommand, onClose, onPlayAgain }: FallingBlocksGameProps) {
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const controlsId = useId();
  const currentPlayer = round.participants.find((participant) => participant.userId === currentUserId);
  const closeGame = () => currentPlayer?.status === "playing" ? setConfirmingExit(true) : onClose();
  const dialogRef = useModalFocus<HTMLElement>(closeGame);
  const multiplayer = round.participants.length > 1;
  const gameMode = round.fallingBlocks?.settings.mode;
  const incomingRows = round.fallingBlocks?.attacks.reduce((rows, attack) => rows + (attack.targetUserId === currentUserId ? attack.rows : 0), 0) ?? 0;
  const canControl = !confirmingExit && round.status === "playing" && currentPlayer?.status === "playing" && state?.running === true;
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

  useFallingBlocksKeyboard({
    enabled: canControl,
    paused: state?.paused === true,
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
      <section ref={dialogRef} className="arcade-game falling-blocks-game" role="dialog" aria-modal="true" aria-labelledby="falling-blocks-title" tabIndex={-1}>
        <header className="game-header">
          <div><FallingBlocksMark className="game-mini-mark" /><h2 id="falling-blocks-title">Falling Blocks</h2></div>
          <div className="falling-blocks-header-actions">
            {canControl && <IconButton label={showControls ? "Hide controls" : "Show controls"} icon={Gamepad2}
              aria-expanded={showControls} aria-controls={controlsId}
              onClick={() => {
                setShowControls((shown) => !shown);
                dialogRef.current?.focus({ preventScroll: true });
              }} />}
            <IconButton label="Close game" icon={X} onClick={closeGame} />
          </div>
        </header>

        {confirmingExit && round.status === "playing" && <GameExitPrompt multiplayer={multiplayer} onLeave={onClose} onCancel={() => setConfirmingExit(false)} />}
        <div className="falling-blocks-content">
          <aside className="falling-blocks-left-rail">
            <section className={`falling-blocks-preview-panel falling-blocks-hold${state?.canHold === false ? " is-locked" : ""}`}>
              <h3>Hold</h3>
              <FallingBlocksPiecePreview
                key={state?.heldPiece ?? "empty"}
                piece={state?.heldPiece ?? null}
                label={state?.heldPiece ? `Held ${state.heldPiece} piece` : "Hold is empty"}
              />
            </section>

            {gameMode && gameMode !== "classic" && <p className="falling-blocks-mode">{FALLING_BLOCKS_MODE_LABELS[gameMode]}</p>}
            {incomingRows > 0 && <div className="falling-blocks-preview-panel falling-blocks-incoming" role="status"><span>Incoming</span><strong>{incomingRows}</strong></div>}

          </aside>

          <div className="falling-blocks-playfield">
            <div className={`falling-blocks-board-frame${stackIsHigh ? " is-danger" : ""}`}>
              <div className="falling-blocks-board" role="img" aria-label="Falling Blocks board">
                {grid.flatMap((row, rowIndex) =>
                  row.map((cell, columnIndex) => {
                    const key = `${rowIndex}-${columnIndex}`;
                    const active = activeCellKeys.has(key);
                    const ghost = cell === 0 && ghostCellKeys.has(key);
                    const cellColor = cell > 0
                      ? FALLING_BLOCKS_BLOCK_COLORS[cell] ?? "#ffffff"
                      : ghost && state?.activePiece
                        ? TETROMINO_COLORS[state.activePiece]
                        : undefined;
                    const className = [
                      "falling-blocks-cell",
                      cell > 0 ? "is-filled" : "",
                      cell === FALLING_BLOCKS_HARD_CELL ? "is-hard" : "",
                      active ? "is-active" : "",
                      ghost ? "is-ghost" : "",
                    ].filter(Boolean).join(" ");
                    const style = cellColor
                      ? { "--falling-blocks-cell-color": cellColor } as CSSProperties
                      : undefined;
                    return <span key={key} className={className} style={style} />;
                  }),
                )}
                {lineClearSequence > 0 && <span key={lineClearSequence} className="falling-blocks-line-flash" />}
                {!boardStatus && state?.lastClear && <FallingBlocksClearNotice clear={state.lastClear} />}
                {boardStatus && (
                  <div className="board-state">
                    {state?.paused ? <Pause size={20} /> : currentPlayer?.status === "finished" ? <Check size={20} /> : null}
                    {boardStatus}
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="falling-blocks-sidebar">
            <section className="falling-blocks-preview-panel falling-blocks-next">
              <h3>Next</h3>
              <div className="falling-blocks-next-list">
                {(state?.nextPieces ?? []).map((piece, index) => (
                  <FallingBlocksPiecePreview key={`${index}-${piece}`} piece={piece} label={`${piece} piece next`} />
                ))}
              </div>
            </section>

            <dl className="falling-blocks-stats" aria-label="Game statistics">
              <div className="score"><dt>Score</dt><dd key={state?.score ?? currentPlayer?.score ?? 0}>{(state?.score ?? currentPlayer?.score ?? 0).toLocaleString()}</dd></div>
              <div><dt>Lines</dt><dd key={state?.lines ?? currentPlayer?.lines ?? 0}>{state?.lines ?? currentPlayer?.lines ?? 0}</dd></div>
              <div><dt>Level</dt><dd key={state?.level ?? currentPlayer?.level ?? 1}>{state?.level ?? currentPlayer?.level ?? 1}</dd></div>
            </dl>

            {multiplayer && (
              <section className="falling-blocks-round-players">
                <h3>Round</h3>
                <ol>
                  {[...round.participants]
                    .sort((left, right) => (left.placement ?? Infinity) - (right.placement ?? Infinity) || right.score - left.score)
                    .map((participant) => {
                      const member = members.find((candidate) => candidate.id === participant.userId);
                      return (
                        <li key={participant.userId} aria-current={participant.userId === currentUserId ? "true" : undefined}>
                          <span>{participant.userId === round.fallingBlocks?.crownUserId
                            ? <Crown size={14} className="falling-blocks-crown-icon" aria-label="Crown holder" />
                            : participant.placement ?? (participant.status === "finished" ? <Check size={13} /> : "\u2022")}</span>
                          <span>{participant.userId === currentUserId ? "You" : member?.name ?? "Player"}</span>
                          <strong>{participant.score.toLocaleString()}</strong>
                        </li>
                      );
                    })}
                </ol>
              </section>
            )}
          </aside>

          {canControl && showControls && (
            <FallingBlocksControls id={controlsId} paused={state.paused} canHold={state.canHold} multiplayer={multiplayer} onCommand={onCommand} />
          )}
        </div>
        {currentPlayer?.status === "finished" && <GameResultActions onClose={onClose} onPlayAgain={round.status === "completed" ? onPlayAgain : undefined} />}
      </section>
    </div>
  );
}

function getBoardStatus(
  round: GameRoundState,
  player: GameRoundState["participants"][number] | undefined,
  state: FallingBlocksGameState | undefined,
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
