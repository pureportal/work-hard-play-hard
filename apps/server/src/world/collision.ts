import { getAreaBoundaryWalls, isEnclosedArea, type FloorLayout, type Rect } from "@workhard/shared";

export interface WorldBounds {
  width: number;
  height: number;
}

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
  areaAccessIds: ReadonlySet<string> = new Set(),
  blockedAreaIds: ReadonlySet<string> = new Set(),
): boolean {
  if (nextX - radius < 0 || nextY - radius < 0 || nextX + radius > bounds.width || nextY + radius > bounds.height) {
    return false;
  }

  const colliders = [
    ...layout.walls,
    ...layout.objects.filter((object) => object.solid),
    ...layout.areas.filter(isEnclosedArea).flatMap((area) => getAreaBoundaryWalls(area)),
  ];

  if (colliders.some((rect) => circleIntersectsRect(nextX, nextY, radius, rect))) {
    return false;
  }

  for (const area of layout.areas) {
    const wasInside = pointInRect(currentX, currentY, area);
    const requiresAccess = area.locked || area.visibility === "members";
    const lacksAccess = requiresAccess && !area.memberIds?.includes(userId) && !areaAccessIds.has(area.id);
    if (!wasInside && (lacksAccess || blockedAreaIds.has(area.id)) && circleIntersectsRect(nextX, nextY, radius, area)) {
      return false;
    }
  }

  return true;
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
