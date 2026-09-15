import type { CSSProperties } from "react";
import { TETROMINO_SHAPES, type TetrominoType } from "@workhard/shared";

export const TETROMINO_COLORS: Record<TetrominoType, string> = {
  I: "#79c8cf",
  O: "#e6c36e",
  T: "#ad8dd1",
  J: "#7a99db",
  L: "#e5a275",
  S: "#89bd9c",
  Z: "#db8590",
};

export const FALLING_BLOCKS_BLOCK_COLORS = [
  "transparent",
  TETROMINO_COLORS.I,
  TETROMINO_COLORS.O,
  TETROMINO_COLORS.T,
  TETROMINO_COLORS.J,
  TETROMINO_COLORS.L,
  TETROMINO_COLORS.S,
  TETROMINO_COLORS.Z,
  "#929ab0",
  "#566175",
];

interface FallingBlocksPiecePreviewProps {
  piece: TetrominoType | null;
  label: string;
}

export function FallingBlocksPiecePreview({ piece, label }: FallingBlocksPiecePreviewProps) {
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
    ? { "--falling-blocks-piece-color": TETROMINO_COLORS[piece] } as CSSProperties
    : undefined;

  return (
    <div className={`falling-blocks-piece-preview${piece ? " has-piece" : ""}`} style={style} role="img" aria-label={label}>
      {Array.from({ length: 16 }, (_, index) => {
        const row = Math.floor(index / 4);
        const column = index % 4;
        return <span key={index} className={filledCells.has(`${row}-${column}`) ? "filled" : ""} />;
      })}
    </div>
  );
}
