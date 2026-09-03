import type { CSSProperties } from "react";
import { TETROMINO_SHAPES, type TetrominoType } from "@workhard/shared";

export const TETROMINO_COLORS: Record<TetrominoType, string> = {
  I: "#24d9f4",
  O: "#ffd447",
  T: "#ad78ff",
  J: "#4d7dff",
  L: "#ff9f43",
  S: "#48dc8b",
  Z: "#ff607d",
};

export const TETRIS_BLOCK_COLORS = [
  "transparent",
  TETROMINO_COLORS.I,
  TETROMINO_COLORS.O,
  TETROMINO_COLORS.T,
  TETROMINO_COLORS.J,
  TETROMINO_COLORS.L,
  TETROMINO_COLORS.S,
  TETROMINO_COLORS.Z,
];

interface TetrisPiecePreviewProps {
  piece: TetrominoType | null;
  label: string;
}

export function TetrisPiecePreview({ piece, label }: TetrisPiecePreviewProps) {
  const filledCells = new Set<string>();
  if (piece) {
    const shape = TETROMINO_SHAPES[piece];
    const rowOffset = Math.floor((4 - shape.length) / 2);
    const columnOffset = Math.floor((4 - shape[0]!.length) / 2);
    shape.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        if (value) {
          filledCells.add(`${rowIndex + rowOffset}-${columnIndex + columnOffset}`);
        }
      });
    });
  }

  const style = piece
    ? { "--tetris-piece-color": TETROMINO_COLORS[piece] } as CSSProperties
    : undefined;

  return (
    <div className={`tetris-piece-preview${piece ? " has-piece" : ""}`} style={style} role="img" aria-label={label}>
      {Array.from({ length: 16 }, (_, index) => {
        const row = Math.floor(index / 4);
        const column = index % 4;
        return <span key={index} className={filledCells.has(`${row}-${column}`) ? "filled" : ""} />;
      })}
    </div>
  );
}
