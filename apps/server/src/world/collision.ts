import { getAssetCollisionRects, getWallSolidRects, isPointInRoom, type FloorLayout, type Rect, type Room } from "@workhard/shared";

export interface WorldBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

const colliderCache = new WeakMap<FloorLayout, { revision: number; rects: Rect[] }>();

export function circleIntersectsRect(x: number, y: number, radius: number, rect: Rect): boolean {
  const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  const distanceX = x - closestX;
  const distanceY = y - closestY;
  return distanceX * distanceX + distanceY * distanceY < radius * radius;
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
  const colliders = cached?.revision === layout.revision
    ? cached.rects
    : [
      ...layout.walls.flatMap((wall) => getWallSolidRects(wall, layout.openings)),
      ...getAssetCollisionRects(layout),
    ];
  if (cached?.revision !== layout.revision) {
    colliderCache.set(layout, { revision: layout.revision, rects: colliders });
  }

  if (colliders.some((rect) => circleIntersectsRect(nextX, nextY, radius, rect))) {
    return false;
  }

  for (const room of layout.rooms) {
    const wasInside = isPointInRoom(currentX, currentY, room);
    const lacksAccess = room.access.mode === "assigned"
      && !room.access.assignedPersonIds.includes(userId)
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
