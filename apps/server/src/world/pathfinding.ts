import type { FloorLayout, Position } from "@workhard/shared";
import { canOccupy, type WorldBounds } from "./collision.js";

const GRID_SIZE = 32;
const MAX_VISITED = 4_000;

interface Cell {
  x: number;
  y: number;
}

const directions: Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function cellKey(cell: Cell): string {
  return `${cell.x}:${cell.y}`;
}

function toCell(position: Position): Cell {
  return {
    x: Math.round(position.x / GRID_SIZE),
    y: Math.round(position.y / GRID_SIZE),
  };
}

function toPosition(cell: Cell): Position {
  return { x: cell.x * GRID_SIZE, y: cell.y * GRID_SIZE };
}

function distance(left: Cell, right: Cell): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

export function findPath(
  layout: FloorLayout,
  bounds: WorldBounds,
  userId: string,
  start: Position,
  destination: Position,
  areaAccessIds: ReadonlySet<string> = new Set(),
  blockedAreaIds: ReadonlySet<string> = new Set(),
): Position[] {
  const startCell = toCell(start);
  const goalCell = toCell(destination);
  const open: Cell[] = [startCell];
  const cameFrom = new Map<string, Cell>();
  const gScore = new Map<string, number>([[cellKey(startCell), 0]]);
  const visited = new Set<string>();

  while (open.length > 0 && visited.size < MAX_VISITED) {
    open.sort((left, right) => {
      const leftScore = (gScore.get(cellKey(left)) ?? Number.POSITIVE_INFINITY) + distance(left, goalCell);
      const rightScore = (gScore.get(cellKey(right)) ?? Number.POSITIVE_INFINITY) + distance(right, goalCell);
      return leftScore - rightScore;
    });
    const current = open.shift();
    if (!current) {
      break;
    }

    const currentKey = cellKey(current);
    if (visited.has(currentKey)) {
      continue;
    }
    visited.add(currentKey);

    if (current.x === goalCell.x && current.y === goalCell.y) {
      const cells: Cell[] = [current];
      let cursor = current;
      while (cameFrom.has(cellKey(cursor))) {
        cursor = cameFrom.get(cellKey(cursor)) as Cell;
        cells.push(cursor);
      }
      cells.reverse();
      return cells.slice(1).map(toPosition);
    }

    for (const direction of directions) {
      const neighbor = { x: current.x + direction.x, y: current.y + direction.y };
      const neighborKey = cellKey(neighbor);
      if (visited.has(neighborKey)) {
        continue;
      }
      const currentPosition = toPosition(current);
      const neighborPosition = toPosition(neighbor);
      if (!canOccupy(
        layout,
        bounds,
        userId,
        currentPosition.x,
        currentPosition.y,
        neighborPosition.x,
        neighborPosition.y,
        13,
        areaAccessIds,
        blockedAreaIds,
      )) {
        continue;
      }
      const candidateScore = (gScore.get(currentKey) ?? 0) + 1;
      if (candidateScore < (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, candidateScore);
        open.push(neighbor);
      }
    }
  }

  return [];
}
