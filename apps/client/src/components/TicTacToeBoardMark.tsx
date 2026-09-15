import type { TicTacToeMark } from "@workhard/shared";

export const CELL_NAMES = [
  "top left", "top center", "top right",
  "middle left", "center", "middle right",
  "bottom left", "bottom center", "bottom right",
];

export function BoardMark({ mark, className = "" }: { mark: TicTacToeMark | null; className?: string }) {
  return mark ? <span className={`tic-tac-toe-board-mark is-${mark} ${className}`.trim()} aria-hidden="true" /> : null;
}
