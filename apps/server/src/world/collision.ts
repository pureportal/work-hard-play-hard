import { circleIntersectsRect, getAssetCollisionRects, getWallSolidRects, isPointInRoom, type FloorLayout, type Rect, type Room } from "@workhard/shared";

export interface WorldBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

const COLLISION_CELL_SIZE = 64;

interface ColliderIndex {
  revision: number;
  cells: Map<number, Map<number, Rect[]>>;
}

const colliderCache = new WeakMap<FloorLayout, ColliderIndex>();

function indexColliders(layout: FloorLayout): ColliderIndex {
  const cells = new Map<number, Map<number, Rect[]>>();
  const rects = [
    ...layout.walls.flatMap((wall) => getWallSolidRects(wall, layout.openings)),
    ...getAssetCollisionRects(layout),
  ];
  for (const rect of rects) {
    const minX = Math.floor(rect.x / COLLISION_CELL_SIZE);
    const maxX = Math.floor((rect.x + rect.width) / COLLISION_CELL_SIZE);
    const minY = Math.floor(rect.y / COLLISION_CELL_SIZE);
    const maxY = Math.floor((rect.y + rect.height) / COLLISION_CELL_SIZE);
    for (let cellX = minX; cellX <= maxX; cellX++) {
      let column = cells.get(cellX);
      if (!column) {
        column = new Map();
        cells.set(cellX, column);
      }
      for (let cellY = minY; cellY <= maxY; cellY++) {
        let bucket = column.get(cellY);
        if (!bucket) {
          bucket = [];
          column.set(cellY, bucket);
        }
        bucket.push(rect);
      }
    }
  }
  const index = { revision: layout.revision, cells };
  colliderCache.set(layout, index);
  return index;
}

function intersectsCollider(index: ColliderIndex, x: number, y: number, radius: number): boolean {
  const minX = Math.floor((x - radius) / COLLISION_CELL_SIZE);
  const maxX = Math.floor((x + radius) / COLLISION_CELL_SIZE);
  const minY = Math.floor((y - radius) / COLLISION_CELL_SIZE);
  const maxY = Math.floor((y + radius) / COLLISION_CELL_SIZE);
  for (let cellX = minX; cellX <= maxX; cellX++) {
    const column = index.cells.get(cellX);
    if (!column) continue;
    for (let cellY = minY; cellY <= maxY; cellY++) {
      for (const rect of column.get(cellY) ?? []) {
        if (circleIntersectsRect(x, y, radius, rect)) return true;
      }
    }
  }
  return false;
}

export function canOccupy(
  layout: FloorLayout,
  bounds: WorldBounds,
  userId: string,
  currentX: number,
  currentY: number,
  nextX: number,
  nextY: number,
  radius = 13,
  roomAccessIds: ReadonlySet<string> = new Set(),
  blockedRoomIds: ReadonlySet<string> = new Set(),
): boolean {
  const left = bounds.x ?? 0;
  const top = bounds.y ?? 0;
  if (
    nextX - radius < left
    || nextY - radius < top
    || nextX + radius > left + bounds.width
    || nextY + radius > top + bounds.height
  ) {
    return false;
  }

  const cached = colliderCache.get(layout);
  const index = cached?.revision === layout.revision ? cached : indexColliders(layout);
  if (intersectsCollider(index, nextX, nextY, radius)) {
    return false;
  }

  for (const room of layout.rooms) {
    const wasInside = isPointInRoom(currentX, currentY, room);
    const lacksAccess = room.access.mode !== "open"
      && !(room.access.mode === "assigned" && room.access.assignedPersonIds.includes(userId))
      && !roomAccessIds.has(room.id);
    if (!wasInside && (lacksAccess || blockedRoomIds.has(room.id)) && circleIntersectsRoom(nextX, nextY, radius, room)) {
      return false;
    }
  }

  return true;
}

function circleIntersectsRoom(x: number, y: number, radius: number, room: Room): boolean {
  return room.footprint.some((rect) => circleIntersectsRect(x, y, radius, rect));
}
