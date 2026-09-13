import { ChessPiece } from "./ChessPiece";

interface ChessMarkProps {
  className?: string;
}

export function ChessMark({ className = "" }: ChessMarkProps) {
  return <span className={`chess-mark ${className}`.trim()} aria-hidden="true"><ChessPiece type="knight" color="white" /></span>;
}
