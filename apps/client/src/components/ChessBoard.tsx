import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { ChessColor, ChessLegalMove, ChessMatchView, ChessPromotionPiece, ChessSquare } from "@workhard/shared";
import { ChessPiece } from "./ChessPiece";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

interface PointerStart {
  pointerId: number;
  from: ChessSquare;
  x: number;
  y: number;
  size: number;
  dragging: boolean;
}

interface PieceDrag {
  from: ChessSquare;
  x: number;
  y: number;
  size: number;
  destination: ChessSquare | undefined;
}

interface ChessBoardProps {
  color: ChessColor;
  board: ChessMatchView["board"];
  lastMove: ChessMatchView["moves"][number] | undefined;
  checkedSquare: ChessSquare | undefined;
  selectedSquare: ChessSquare | undefined;
  legalMoves: ChessLegalMove[];
  canMove: boolean;
  promotionMoves: ChessLegalMove[] | undefined;
  onSelect: (square: ChessSquare) => void;
  onDrop: (from: ChessSquare, to: ChessSquare) => void;
  onPromote: (piece: ChessPromotionPiece) => void;
  onCancelPromotion: () => void;
}

export function ChessBoard({ color, board, lastMove, checkedSquare, selectedSquare, legalMoves, canMove, promotionMoves, onSelect, onDrop, onPromote, onCancelPromotion }: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const choosingPromotion = useRef(false);
  const pointerStart = useRef<PointerStart | null>(null);
  const suppressClick = useRef(false);
  const [focusedSquare, setFocusedSquare] = useState<ChessSquare>(color === "white" ? "e2" : "e7");
  const [drag, setDrag] = useState<PieceDrag>();
  const files = color === "white" ? FILES : [...FILES].reverse();
  const ranks = color === "white" ? [...RANKS].reverse() : RANKS;
  const pieces = new Map(board.map((piece) => [piece.square, piece]));
  const draggedPiece = drag ? pieces.get(drag.from) : undefined;
  const activeSquare = drag?.from ?? selectedSquare;
  const legalDestinations = new Set(legalMoves.filter((move) => move.from === activeSquare).map((move) => move.to));
  const movableSquares = new Set(legalMoves.map((move) => move.from));

  useEffect(() => {
    if (!canMove || promotionMoves) {
      pointerStart.current = null;
      setDrag(undefined);
    }
  }, [canMove, promotionMoves]);

  useEffect(() => {
    if (promotionMoves) {
      boardRef.current?.querySelector<HTMLButtonElement>(".chess-promotion-picker button")?.focus();
    } else if (choosingPromotion.current) {
      boardRef.current?.querySelector<HTMLButtonElement>(`[data-square="${focusedSquare}"]`)?.focus();
    }
    choosingPromotion.current = Boolean(promotionMoves);
  }, [promotionMoves, focusedSquare]);

  const navigate = (event: KeyboardEvent<HTMLButtonElement>, row: number, column: number) => {
    let nextRow = row;
    let nextColumn = column;
    switch (event.key) {
      case "ArrowUp": nextRow = Math.max(0, row - 1); break;
      case "ArrowDown": nextRow = Math.min(7, row + 1); break;
      case "ArrowLeft": nextColumn = Math.max(0, column - 1); break;
      case "ArrowRight": nextColumn = Math.min(7, column + 1); break;
      case "Home": nextColumn = 0; break;
      case "End": nextColumn = 7; break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    const square = `${files[nextColumn]}${ranks[nextRow]}`;
    boardRef.current?.querySelector<HTMLButtonElement>(`[data-square="${square}"]`)?.focus();
  };

  const destinationAt = (x: number, y: number, from: ChessSquare) => {
    const squareElement = document.elementFromPoint(x, y)?.closest<HTMLButtonElement>(".chess-square");
    if (!squareElement || !boardRef.current?.contains(squareElement)) return undefined;
    const square = squareElement.dataset.square as ChessSquare;
    return legalMoves.some((move) => move.from === from && move.to === square) ? square : undefined;
  };

  const startPointer = (event: PointerEvent<HTMLButtonElement>, square: ChessSquare) => {
    suppressClick.current = false;
    if (event.button !== 0 || event.isPrimary === false || !canMove || promotionMoves
      || pieces.get(square)?.color !== color || !movableSquares.has(square)) return;
    pointerStart.current = {
      pointerId: event.pointerId,
      from: square,
      x: event.clientX,
      y: event.clientY,
      size: event.currentTarget.getBoundingClientRect().width,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePointer = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (!start.dragging && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return;
    start.dragging = true;
    event.preventDefault();
    setDrag({
      from: start.from,
      x: event.clientX,
      y: event.clientY,
      size: start.size,
      destination: destinationAt(event.clientX, event.clientY, start.from),
    });
  };

  const endPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    pointerStart.current = null;
    if (!start.dragging) return;
    event.preventDefault();
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    const destination = destinationAt(event.clientX, event.clientY, start.from);
    setDrag(undefined);
    if (destination) onDrop(start.from, destination);
  };

  return (
    <div ref={boardRef} className={`chess-board is-${color}`} role="grid" aria-label={`Chess board, ${color} side`}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        if (!(event.target instanceof Element) || !event.target.closest(".chess-square")) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && drag) {
          event.preventDefault();
          event.stopPropagation();
          pointerStart.current = null;
          setDrag(undefined);
          return;
        }
        if (event.key === "Escape" && (promotionMoves || selectedSquare)) {
          event.preventDefault();
          event.stopPropagation();
          if (promotionMoves) onCancelPromotion();
          else if (selectedSquare) onSelect(selectedSquare);
        }
      }}>
      {ranks.flatMap((rank, rowIndex) => files.map((file, columnIndex) => {
        const square = `${file}${rank}` as ChessSquare;
        const piece = pieces.get(square);
        const selected = activeSquare === square;
        const legal = legalDestinations.has(square);
        const preview = drag?.destination === square ? draggedPiece : undefined;
        const visiblePiece = preview ?? piece;
        const classes = [
          "chess-square",
          (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0 ? "is-dark" : "is-light",
          selected ? "is-selected" : "",
          legal ? "is-legal" : "",
          legal && piece ? "is-capture" : "",
          preview ? "is-preview" : "",
          drag?.from === square ? "is-drag-source" : "",
          canMove && !promotionMoves && piece?.color === color && movableSquares.has(square) ? "is-draggable" : "",
          lastMove?.from === square || lastMove?.to === square ? "is-last" : "",
          checkedSquare === square ? "is-check" : "",
        ].filter(Boolean).join(" ");
        return (
          <button key={square} type="button" className={classes} role="gridcell"
            aria-label={preview ? `Preview ${preview.color} ${preview.type} on ${square}` : piece ? `${piece.color} ${piece.type} on ${square}` : square}
            aria-description={legal ? "Legal move" : undefined}
            aria-selected={selected} aria-disabled={!canMove || Boolean(promotionMoves)}
            disabled={Boolean(promotionMoves)} data-square={square}
            tabIndex={focusedSquare === square ? 0 : -1}
            onFocus={() => setFocusedSquare(square)}
            onKeyDown={(event) => navigate(event, rowIndex, columnIndex)}
            onPointerDown={(event) => startPointer(event, square)}
            onPointerMove={movePointer}
            onPointerUp={endPointer}
            onPointerCancel={() => { pointerStart.current = null; setDrag(undefined); }}
            onLostPointerCapture={() => { pointerStart.current = null; setDrag(undefined); }}
            onClick={() => onSelect(square)}>
            {columnIndex === 0 && <span className="chess-rank-label" aria-hidden="true">{rank}</span>}
            {rowIndex === 7 && <span className="chess-file-label" aria-hidden="true">{file}</span>}
            {visiblePiece && <ChessPiece type={visiblePiece.type} color={visiblePiece.color} />}
            {legal && !preview && <span className="chess-move-target" />}
          </button>
        );
      }))}
      {drag && draggedPiece && !drag.destination && createPortal(
        <div className="chess-drag-piece" style={{ left: drag.x, top: drag.y, width: drag.size, height: drag.size }} aria-hidden="true">
          <ChessPiece type={draggedPiece.type} color={draggedPiece.color} />
        </div>,
        document.body,
      )}
      {promotionMoves && (
        <div className="chess-promotion-picker" role="dialog" aria-modal="true" aria-label="Choose promotion"
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            event.preventDefault();
            event.stopPropagation();
            buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
          }}>
          {(["queen", "rook", "bishop", "knight"] as const).map((piece) => (
            <button key={piece} type="button" aria-label={`Promote to ${piece}`} onClick={() => onPromote(piece)}>
              <ChessPiece type={piece} color={color} />
            </button>
          ))}
          <button type="button" className="chess-promotion-cancel" aria-label="Cancel promotion" onClick={onCancelPromotion}><X size={17} /></button>
        </div>
      )}
    </div>
  );
}
