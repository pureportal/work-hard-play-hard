import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ChessColor, ChessLegalMove, ChessMatchView, ChessPromotionPiece, ChessSquare } from "@workhard/shared";
import { ChessPiece } from "./ChessPiece";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

interface ChessBoardProps {
  color: ChessColor;
  board: ChessMatchView["board"];
  lastMove: ChessMatchView["moves"][number] | undefined;
  checkedSquare: ChessSquare | undefined;
  selectedSquare: ChessSquare | undefined;
  legalDestinations: ReadonlySet<ChessSquare>;
  canMove: boolean;
  promotionMoves: ChessLegalMove[] | undefined;
  onSelect: (square: ChessSquare) => void;
  onPromote: (piece: ChessPromotionPiece) => void;
  onCancelPromotion: () => void;
}

export function ChessBoard({ color, board, lastMove, checkedSquare, selectedSquare, legalDestinations, canMove, promotionMoves, onSelect, onPromote, onCancelPromotion }: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const choosingPromotion = useRef(false);
  const [focusedSquare, setFocusedSquare] = useState<ChessSquare>(color === "white" ? "e2" : "e7");
  const files = color === "white" ? FILES : [...FILES].reverse();
  const ranks = color === "white" ? [...RANKS].reverse() : RANKS;
  const pieces = new Map(board.map((piece) => [piece.square, piece]));

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

  return (
    <div ref={boardRef} className={`chess-board is-${color}`} role="grid" aria-label={`Chess board, ${color} side`}
      onKeyDown={(event) => {
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
        const selected = selectedSquare === square;
        const legal = legalDestinations.has(square);
        const classes = [
          "chess-square",
          (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0 ? "is-dark" : "is-light",
          selected ? "is-selected" : "",
          legal ? "is-legal" : "",
          legal && piece ? "is-capture" : "",
          lastMove?.from === square || lastMove?.to === square ? "is-last" : "",
          checkedSquare === square ? "is-check" : "",
        ].filter(Boolean).join(" ");
        return (
          <button key={square} type="button" className={classes} role="gridcell"
            aria-label={piece ? `${piece.color} ${piece.type} on ${square}` : square}
            aria-description={legal ? "Legal move" : undefined}
            aria-selected={selected} aria-disabled={!canMove || Boolean(promotionMoves)}
            disabled={Boolean(promotionMoves)} data-square={square}
            tabIndex={focusedSquare === square ? 0 : -1}
            onFocus={() => setFocusedSquare(square)}
            onKeyDown={(event) => navigate(event, rowIndex, columnIndex)}
            onClick={() => onSelect(square)}>
            {columnIndex === 0 && <span className="chess-rank-label" aria-hidden="true">{rank}</span>}
            {rowIndex === 7 && <span className="chess-file-label" aria-hidden="true">{file}</span>}
            {piece && <ChessPiece type={piece.type} color={piece.color} />}
            {legal && <span className="chess-move-target" />}
          </button>
        );
      }))}
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
