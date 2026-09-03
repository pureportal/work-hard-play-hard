import { ASSET_RASTER_SIZE, type FloorLayout, type Position } from "@workhard/shared";
import { canOccupy, type WorldBounds } from "./collision.js";

const GRID_SIZE = ASSET_RASTER_SIZE;
const MAX_VISITED = 50_000;

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

interface QueuedCell {
  cell: Cell;
  score: number;
}

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
  roomAccessIds: ReadonlySet<string> = new Set(),
  blockedRoomIds: ReadonlySet<string> = new Set(),
): Position[] {
  const left = bounds.x ?? 0;
  const top = bounds.y ?? 0;
  if (
    destination.x < left
    || destination.y < top
    || destination.x > left + bounds.width
    || destination.y > top + bounds.height
  ) {
    return [];
  }
  const startCell = toCell(start);
  const goalCell = toCell(destination);
  if (cellKey(startCell) === cellKey(goalCell) && canOccupy(
    layout,
    bounds,
    userId,
    start.x,
    start.y,
    destination.x,
    destination.y,
    13,
    roomAccessIds,
    blockedRoomIds,
  )) {
    return Math.hypot(destination.x - start.x, destination.y - start.y) < 0.01 ? [] : [destination];
  }
  const open: QueuedCell[] = [];
  pushOpen(open, { cell: startCell, score: distance(startCell, goalCell) });
  const cameFrom = new Map<string, Cell>();
  const gScore = new Map<string, number>([[cellKey(startCell), 0]]);
  const visited = new Set<string>();
  let closest: Cell | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestPathLength = Number.POSITIVE_INFINITY;

  while (open.length > 0 && visited.size < MAX_VISITED) {
    const queued = popOpen(open);
    if (!queued) {
      break;
    }
    const current = queued.cell;

    const currentKey = cellKey(current);
    if (visited.has(currentKey)) {
      continue;
    }
    visited.add(currentKey);

    const currentPosition = toPosition(current);
    const currentPathLength = gScore.get(currentKey) ?? Number.POSITIVE_INFINITY;
    const distanceToDestination = Math.hypot(currentPosition.x - destination.x, currentPosition.y - destination.y);
    const currentIsStart = currentKey === cellKey(startCell);
    const currentIsValid = canOccupy(
      layout,
      bounds,
      userId,
      start.x,
      start.y,
      currentPosition.x,
      currentPosition.y,
      13,
      roomAccessIds,
      blockedRoomIds,
    );
    if (
      currentIsValid
      && (!currentIsStart || Math.hypot(currentPosition.x - start.x, currentPosition.y - start.y) > 0.01)
      && (distanceToDestination < closestDistance
        || (distanceToDestination === closestDistance && currentPathLength < closestPathLength))
    ) {
      closest = current;
      closestDistance = distanceToDestination;
      closestPathLength = currentPathLength;
    }

    if (current.x === goalCell.x && current.y === goalCell.y) {
      const path = reconstructPath(current, cameFrom);
      if (canOccupy(
        layout,
        bounds,
        userId,
        currentPosition.x,
        currentPosition.y,
        destination.x,
        destination.y,
        13,
        roomAccessIds,
        blockedRoomIds,
      ) && Math.hypot(currentPosition.x - destination.x, currentPosition.y - destination.y) > 0.01) {
        path.push(destination);
      }
      return path;
    }

    for (const direction of directions) {
      const neighbor = { x: current.x + direction.x, y: current.y + direction.y };
      const neighborKey = cellKey(neighbor);
      if (visited.has(neighborKey)) {
        continue;
      }
      const neighborPosition = toPosition(neighbor);
      const traversalPosition = currentIsStart ? start : currentPosition;
      if (!canOccupy(
        layout,
        bounds,
        userId,
        traversalPosition.x,
        traversalPosition.y,
        neighborPosition.x,
        neighborPosition.y,
        13,
        roomAccessIds,
        blockedRoomIds,
      )) {
        continue;
      }
      const candidateScore = (gScore.get(currentKey) ?? 0) + 1;
      if (candidateScore < (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, candidateScore);
        pushOpen(open, { cell: neighbor, score: candidateScore + distance(neighbor, goalCell) });
      }
    }
  }

  return closest ? reconstructPath(closest, cameFrom) : [];
}

function reconstructPath(destination: Cell, cameFrom: Map<string, Cell>): Position[] {
  const cells: Cell[] = [destination];
  let cursor = destination;
  while (cameFrom.has(cellKey(cursor))) {
    cursor = cameFrom.get(cellKey(cursor)) as Cell;
    cells.push(cursor);
  }
  cells.reverse();
  return cells.slice(1).map(toPosition);
}

function pushOpen(open: QueuedCell[], entry: QueuedCell): void {
  open.push(entry);
  let index = open.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (open[parent]!.score <= entry.score) {
      break;
    }
    open[index] = open[parent]!;
    index = parent;
  }
  open[index] = entry;
}

function popOpen(open: QueuedCell[]): QueuedCell | undefined {
  const first = open[0];
  const last = open.pop();
  if (!first || !last || open.length === 0) {
    return first;
  }
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= open.length) {
      break;
    }
    const child = right < open.length && open[right]!.score < open[left]!.score ? right : left;
    if (open[child]!.score >= last.score) {
      break;
    }
    open[index] = open[child]!;
    index = child;
  }
  open[index] = last;
  return first;
}
