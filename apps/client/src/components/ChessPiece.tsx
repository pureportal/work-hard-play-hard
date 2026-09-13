import { useId } from "react";
import type { ChessColor, ChessPieceType } from "@workhard/shared";

const silhouettes: Record<ChessPieceType, string> = {
  pawn: "M25 31C17 24 21 12 32 12S47 24 39 31L37 35C36 44 39 48 43 52H21C25 48 28 44 27 35Z",
  knight: "M19 52C19 41 28 37 34 32L27 28L20 34L13 30L18 22L28 13L29 6L35 12L41 10C49 19 50 32 46 43L44 52Z",
  bishop: "M24 33C16 24 25 16 32 9C39 16 48 24 40 33L36 37C36 44 39 48 43 52H21C25 48 28 44 28 37Z",
  rook: "M20 52L23 29L17 25V12H24V19H29V12H35V19H40V12H47V25L41 29L44 52Z",
  queen: "M21 34L16 16L26 25L32 10L38 25L48 16L43 34L38 38C38 45 40 49 44 52H20C24 49 26 45 26 38Z",
  king: "M28 17V11H22V6H28V1H36V6H42V11H36V17C49 12 52 23 43 34L38 38C38 45 40 49 44 52H20C24 49 26 45 26 38L21 34C12 23 15 12 28 17Z",
};

export function ChessPiece({ type, color }: { type: ChessPieceType; color: ChessColor }) {
  const gradientId = useId();
  return (
    <svg className={`chess-piece is-${color}`} viewBox="0 0 64 72" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0.8">
          <stop offset="0" stopColor="var(--piece-highlight)" />
          <stop offset="0.5" stopColor="var(--piece-fill)" />
          <stop offset="0.51" stopColor="var(--piece-shade)" />
          <stop offset="1" stopColor="var(--piece-fill)" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradientId})`} stroke="var(--piece-outline)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d={silhouettes[type]} />
        {type === "knight" ? <><path d="M38 20C43 27 43 36 39 43" fill="none" /><circle cx="29" cy="22" r="1.6" fill="var(--piece-outline)" stroke="none" /></>
          : <path d={type === "pawn" ? "M25 35H39" : "M23 35H41"} fill="none" />}
        {type === "bishop" && <path d="M34 16L29 26" fill="none" />}
        {type === "king" && <path d="M32 20V30" fill="none" />}
        <path d="M21 52H43L47 58V61H17V58Z" />
        <path d="M17 61H47L50 66V69H14V66Z" />
        <path d="M22 57H42M19 65H45" stroke="var(--piece-highlight)" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
