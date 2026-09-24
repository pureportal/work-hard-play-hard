import type { Position, Rect } from "@workhard/shared";

export const previewWalls: readonly Rect[] = [
  { x: 253, y: 45, width: 5, height: 115 },
  { x: 253, y: 188, width: 5, height: 102 },
  { x: 253, y: 324, width: 5, height: 53 },
  { x: 39, y: 209, width: 109, height: 4 },
  { x: 190, y: 209, width: 147, height: 4 },
  { x: 378, y: 209, width: 95, height: 4 },
];

export const previewFurnitureObstacles: readonly Rect[] = [
  { x: 65, y: 113, width: 74, height: 19 },
  { x: 99, y: 151, width: 20, height: 17 },
  { x: 207, y: 93, width: 15, height: 12 },
  { x: 291, y: 99, width: 71, height: 12 },
  { x: 306, y: 137, width: 67, height: 18 },
  { x: 378, y: 180, width: 33, height: 12 },
  { x: 409, y: 129, width: 45, height: 17 },
  { x: 449, y: 80, width: 10, height: 11 },
  { x: 56, y: 327, width: 35, height: 20 },
  { x: 129, y: 329, width: 68, height: 21 },
  { x: 230, y: 276, width: 15, height: 10 },
  { x: 282, y: 257, width: 74, height: 21 },
  { x: 319, y: 302, width: 102, height: 64 },
  { x: 451, y: 267, width: 14, height: 12 },
];

const cellSize = 10;
const origin = { x: 44, y: 50 };
const columns = 43;
const rows = 33;
const halfBody = 6;
const directions: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function cellPoint(column: number, row: number): Position {
  return { x: origin.x + column * cellSize, y: origin.y + row * cellSize };
}

function cellIndex(point: Position): number {
  const column = Math.max(0, Math.min(columns - 1, Math.round((point.x - origin.x) / cellSize)));
  const row = Math.max(0, Math.min(rows - 1, Math.round((point.y - origin.y) / cellSize)));
  return row * columns + column;
}

export function canStandInPreview(point: Position, obstacles: readonly Rect[]): boolean {
  if (point.x - halfBody < 39 || point.x + halfBody > 473 || point.y - halfBody < 45 || point.y + halfBody > 377) {
    return false;
  }
  const intersects = (rect: Rect) =>
    point.x - halfBody < rect.x + rect.width
    && point.x + halfBody > rect.x
    && point.y - halfBody < rect.y + rect.height
    && point.y + halfBody > rect.y;
  return !previewWalls.some(intersects) && !obstacles.some(intersects);
}

export function canTracePreview(from: Position, to: Position, obstacles: readonly Rect[]): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2));
  for (let step = 0; step <= steps; step++) {
    if (!canStandInPreview({
      x: from.x + (to.x - from.x) * step / steps,
      y: from.y + (to.y - from.y) * step / steps,
    }, obstacles)) return false;
  }
  return true;
}

export function findPreviewPath(from: Position, to: Position, obstacles: readonly Rect[]): Position[] {
  if (!canStandInPreview(from, obstacles) || !canStandInPreview(to, obstacles)) return [];
  const start = cellIndex(from);
  const end = cellIndex(to);
  if (start === end) return canTracePreview(from, to, obstacles) ? [to] : [];

  const previous = new Int32Array(columns * rows).fill(-1);
  const queue = [start];
  previous[start] = start;

  for (let cursor = 0; cursor < queue.length && previous[end] === -1; cursor++) {
    const current = queue[cursor]!;
    const column = current % columns;
    const row = Math.floor(current / columns);
    const currentPoint = current === start ? from : cellPoint(column, row);
    for (const [dx, dy] of directions) {
      const nextColumn = column + dx;
      const nextRow = row + dy;
      if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
      const next = nextRow * columns + nextColumn;
      if (previous[next] !== -1 || !canTracePreview(currentPoint, cellPoint(nextColumn, nextRow), obstacles)) continue;
      previous[next] = current;
      queue.push(next);
    }
  }

  if (previous[end] === -1) return [];
  const path: Position[] = [];
  for (let cell = end; cell !== start; cell = previous[cell]!) {
    path.push(cellPoint(cell % columns, Math.floor(cell / columns)));
  }
  path.reverse();
  const finalPoint = path.at(-1)!;
  if (finalPoint.x !== to.x || finalPoint.y !== to.y) {
    if (!canTracePreview(finalPoint, to, obstacles)) return [];
    path.push(to);
  }
  return path;
}
