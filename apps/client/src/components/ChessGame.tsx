import { Check, Flag, Handshake, Pause, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChessColor,
  ChessLegalMove,
  ChessMatchView,
  ChessMoveInput,
  ChessPromotionPiece,
  ChessSquare,
  Member,
} from "@workhard/shared";
import { GameResultActions } from "./GameResultActions";
import { useModalFocus } from "../hooks/useModalFocus";
import { Avatar } from "./Avatar";
import { ChessMark } from "./ChessMark";
import { ChessBoard } from "./ChessBoard";
import { IconButton } from "./IconButton";
import { ConfirmationDialog } from "./ConfirmationDialog";

interface ChessGameProps {
  match: ChessMatchView;
  members: Member[];
  currentUserId: string;
  pending?: boolean;
  onMove: (move: ChessMoveInput) => void;
  onOfferDraw: () => void;
  onClaimDraw: (move?: ChessMoveInput) => void;
  onRespondToDraw: (accept: boolean) => void;
  onResign: () => void;
  onClose: () => void;
  onPlayAgain?: (() => void) | undefined;
  onRetryBot?: (() => void) | undefined;
}

export function ChessGame({
  match,
  members,
  currentUserId,
  pending = false,
  onMove,
  onOfferDraw,
  onClaimDraw,
  onRespondToDraw,
  onResign,
  onClose,
  onPlayAgain,
  onRetryBot,
}: ChessGameProps) {
  const dialogRef = useModalFocus<HTMLElement>(onClose);
  const ownColor: ChessColor = match.blackUserId === currentUserId ? "black" : "white";
  const opponentColor: ChessColor = ownColor === "white" ? "black" : "white";
  const ownMember = members.find((member) => member.id === currentUserId);
  const opponentUserId = ownColor === "white" ? match.blackUserId : match.whiteUserId;
  const opponent = members.find((member) => member.id === opponentUserId);
  const canMove = !pending && match.status === "active" && match.turn === ownColor;
  const [selectedSquare, setSelectedSquare] = useState<ChessSquare>();
  const [promotionMoves, setPromotionMoves] = useState<ChessLegalMove[]>();
  const [confirmingResignation, setConfirmingResignation] = useState(false);
  const [claimingDraw, setClaimingDraw] = useState(false);
  const selectableMoves = useMemo(() => claimingDraw
    ? match.drawClaims.flatMap((claim) => claim.move ? [claim.move] : [])
    : match.legalMoves, [claimingDraw, match.drawClaims, match.legalMoves]);
  const moveListRef = useRef<HTMLOListElement>(null);
  const clock = useDisplayedClock(match);

  const pieceBySquare = useMemo(
    () => new Map(match.board.map((piece) => [piece.square, piece])),
    [match.board],
  );
  const legalDestinations = useMemo(
    () => new Set(selectableMoves.filter((move) => move.from === selectedSquare).map((move) => move.to)),
    [selectableMoves, selectedSquare],
  );
  const lastMove = match.moves.at(-1);
  const checkedKingSquare = match.inCheck
    ? match.board.find((piece) => piece.color === match.turn && piece.type === "king")?.square
    : undefined;

  useEffect(() => {
    setSelectedSquare(undefined);
    setPromotionMoves(undefined);
    setClaimingDraw(false);
  }, [match.id, match.moves.length, match.turn, match.status]);

  useEffect(() => {
    setConfirmingResignation(false);
  }, [match.id, match.status]);

  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [match.moves.length]);

  const selectSquare = (square: ChessSquare) => {
    if (!canMove) {
      return;
    }
    if (selectedSquare === square) {
      setSelectedSquare(undefined);
      return;
    }
    const piece = pieceBySquare.get(square);
    if (selectedSquare) {
      const candidates = selectableMoves.filter((move) => move.from === selectedSquare && move.to === square);
      if (candidates.length > 0) {
        const promotions = candidates.filter((move) => move.promotion);
        if (promotions.length > 0) {
          setPromotionMoves(promotions);
        } else {
          const move = { from: selectedSquare, to: square };
          if (claimingDraw) {
            onClaimDraw(move);
          } else {
            onMove(move);
          }
          setSelectedSquare(undefined);
        }
        return;
      }
    }
    if (piece?.color === ownColor && selectableMoves.some((move) => move.from === square)) {
      setSelectedSquare(square);
    } else {
      setSelectedSquare(undefined);
    }
  };

  const choosePromotion = (promotion: ChessPromotionPiece) => {
    const move = promotionMoves?.find((candidate) => candidate.promotion === promotion);
    if (move) {
      if (claimingDraw) {
        onClaimDraw(move);
      } else {
        onMove(move);
      }
    }
    setPromotionMoves(undefined);
    setSelectedSquare(undefined);
  };

  return (
    <div className="modal-backdrop game-backdrop">
      <section ref={dialogRef} className="arcade-game chess-game" data-match-id={match.id} role="dialog" aria-modal="true" aria-labelledby="chess-game-title" tabIndex={-1}>
        <header className="game-header chess-game-header">
          <div>
            <ChessMark />
            <div>
              <h2 id="chess-game-title">Chess</h2>
              <span>{timeControlLabel(match)}</span>
            </div>
          </div>
          <IconButton label="Close chess" icon={X} onClick={onClose} />
        </header>

        {match.botError && <div className="chess-bot-error" role="alert"><p>{match.botError}</p><button className="secondary-button" onClick={onRetryBot}>Retry bot</button></div>}
        <div className="chess-game-content">
          <div className="chess-board-column">
            <PlayerBar
              color={opponentColor}
              member={opponent}
              fallback={match.settings.bot ? "Bot · " + match.settings.bot.difficulty : "Opponent"}
              remainingMs={clock[opponentColor]}
              active={match.status === "active" && match.turn === opponentColor}
              paused={match.clock.pausedForWeekend && match.turn === opponentColor}
            />

            <ChessBoard key={ownColor} color={ownColor} board={match.board} lastMove={lastMove}
              checkedSquare={checkedKingSquare} selectedSquare={selectedSquare} legalDestinations={legalDestinations}
              canMove={canMove} promotionMoves={promotionMoves} onSelect={selectSquare}
              onPromote={choosePromotion} onCancelPromotion={() => setPromotionMoves(undefined)} />

            <PlayerBar
              color={ownColor}
              member={ownMember}
              fallback="You"
              remainingMs={clock[ownColor]}
              active={match.status === "active" && match.turn === ownColor}
              paused={match.clock.pausedForWeekend && match.turn === ownColor}
              current
            />
          </div>

          <aside className="chess-game-sidebar">
            <section className="chess-status" aria-live="polite">
              <span className={`chess-color-dot is-${match.turn}`} />
              <div>
                <strong>{pending ? "Sending…" : statusTitle(match, currentUserId, ownColor)}</strong>
                {statusDetail(match) && <span>{statusDetail(match)}</span>}
              </div>
            </section>

            {match.moves.length > 0 && (
              <section className="chess-moves">
                <h3>Moves</h3>
                <ol ref={moveListRef}>
                  {Array.from({ length: Math.ceil(match.moves.length / 2) }, (_, index) => (
                    <li key={index}>
                      <span>{index + 1}.</span>
                      <strong>{match.moves[index * 2]?.san}</strong>
                      <strong>{match.moves[index * 2 + 1]?.san ?? ""}</strong>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {match.status === "active" && (
              <div className="chess-game-actions" inert={pending} aria-busy={pending}>
                {match.drawClaims.length > 0 && (
                  <button className="secondary-button chess-claim-button" onClick={() => {
                    const immediate = match.drawClaims.find((claim) => !claim.move);
                    if (immediate) {
                      onClaimDraw();
                    } else {
                      setClaimingDraw((value) => !value);
                      setSelectedSquare(undefined);
                    }
                  }}>{claimingDraw ? "Cancel draw claim" : "Claim draw"}</button>
                )}
                {claimingDraw && <span>Choose the move for your draw claim.</span>}
                {match.drawOfferByUserId && match.drawOfferByUserId !== currentUserId ? (
                  <div className="chess-draw-response">
                    <span>Draw offered</span>
                    <button className="primary-button" onClick={() => onRespondToDraw(true)}><Check size={15} />Accept</button>
                    <button className="secondary-button" onClick={() => onRespondToDraw(false)}><X size={15} />Decline</button>
                  </div>
                ) : !match.settings.bot && (
                  <button className="secondary-button" disabled={match.drawOfferByUserId === currentUserId} onClick={onOfferDraw}>
                    <Handshake size={16} />{match.drawOfferByUserId === currentUserId ? "Draw offered" : "Offer draw"}
                  </button>
                )}
                <button className="chess-resign-button" onClick={() => setConfirmingResignation(true)}><Flag size={15} />Resign</button>
                {confirmingResignation && (
                  <ConfirmationDialog title="Resign game?" confirmLabel="Resign" pending={pending}
                    onCancel={() => setConfirmingResignation(false)} onConfirm={onResign} />
                )}
              </div>
            )}
          </aside>
        </div>
        {match.status === "completed" && <GameResultActions onClose={onClose} onPlayAgain={onPlayAgain} />}
      </section>
    </div>
  );
}

function PlayerBar({
  color,
  member,
  fallback,
  remainingMs,
  active,
  paused,
  current = false,
}: {
  color: ChessColor;
  member: Member | undefined;
  fallback: string;
  remainingMs: number | null;
  active: boolean;
  paused: boolean;
  current?: boolean;
}) {
  return (
    <div className={`chess-player-bar${active ? " is-active" : ""}`}>
      {member ? <Avatar member={member} className="score-avatar chess-player-avatar" /> : <ChessMark />}
      <div>
        <strong>{current ? "You" : member?.name ?? fallback}</strong>
        <span>{color === "white" ? "White" : "Black"}</span>
      </div>
      {remainingMs !== null && (
        <time className={remainingMs < 60_000 ? "is-low" : ""}>
          {paused ? <Pause size={14} /> : null}{formatClock(remainingMs)}
        </time>
      )}
    </div>
  );
}

function useDisplayedClock(match: ChessMatchView): Record<ChessColor, number | null> {
  const receivedAt = useMemo(() => Date.now(), [match.serverNow, match.clock]);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!match.clock.running) {
      return;
    }
    const timer = window.setInterval(() => setTick((value) => value + 1), 250);
    return () => window.clearInterval(timer);
  }, [match.clock.running]);
  const elapsed = match.clock.running ? Math.max(0, Date.now() - receivedAt) : 0;
  const activeColor = match.clock.activeColor;
  return {
    white: match.clock.whiteRemainingMs === null
      ? null
      : Math.max(0, match.clock.whiteRemainingMs - (activeColor === "white" ? elapsed : 0)),
    black: match.clock.blackRemainingMs === null
      ? null
      : Math.max(0, match.clock.blackRemainingMs - (activeColor === "black" ? elapsed : 0)),
  };
}

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  if (totalSeconds >= 60 * 60) {
    const totalMinutes = Math.ceil(milliseconds / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function timeControlLabel(match: ChessMatchView): string {
  if (match.settings.timeControl === "rapid") {
    return "Rapid · 10 min";
  }
  if (match.settings.timeControl === "daily") {
    return match.settings.pauseWeekends ? "24 hours · Weekends paused (UTC)" : "24 hours per move";
  }
  return "Standard";
}

function statusTitle(match: ChessMatchView, currentUserId: string, ownColor: ChessColor): string {
  if (match.status === "waiting") {
    return "Waiting for opponent";
  }
  if (match.status === "completed") {
    if (!match.outcome?.winnerUserId) {
      return "Draw";
    }
    return match.outcome.winnerUserId === currentUserId ? "You won" : "You lost";
  }
  if (match.inCheck) {
    return match.turn === ownColor ? "Your king is in check" : "Check";
  }
  return match.turn === ownColor ? "Your move" : match.settings.bot ? "Bot is thinking…" : "Opponent's move";
}

function statusDetail(match: ChessMatchView): string {
  if (match.status !== "completed" || !match.outcome) {
    return "";
  }
  return ({
    checkmate: "Checkmate",
    resignation: "Resignation",
    timeout: "Time expired",
    stalemate: "Stalemate",
    insufficient_material: "Insufficient material",
    threefold_repetition: "Threefold repetition",
    fifty_move_rule: "Fifty-move rule",
    fivefold_repetition: "Fivefold repetition",
    seventy_five_move_rule: "75-move rule",
    agreement: "By agreement",
  } as const)[match.outcome.result];
}
