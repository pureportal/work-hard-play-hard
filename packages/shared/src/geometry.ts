export interface Position {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function rectanglesOverlap(left: Rect, right: Rect): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

export function circleIntersectsRect(x: number, y: number, radius: number, rect: Rect): boolean {
  const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  const distanceX = x - closestX;
  const distanceY = y - closestY;
  return distanceX * distanceX + distanceY * distanceY < radius * radius;
}

export function subtractRect(rect: Rect, obstacle: Rect): Rect[] {
  if (!rectanglesOverlap(rect, obstacle)) return [rect];
  const left = Math.max(rect.x, obstacle.x);
  const top = Math.max(rect.y, obstacle.y);
  const right = Math.min(rect.x + rect.width, obstacle.x + obstacle.width);
  const bottom = Math.min(rect.y + rect.height, obstacle.y + obstacle.height);
  return [
    { x: rect.x, y: rect.y, width: rect.width, height: top - rect.y },
    { x: rect.x, y: bottom, width: rect.width, height: rect.y + rect.height - bottom },
    { x: rect.x, y: top, width: left - rect.x, height: bottom - top },
    { x: right, y: top, width: rect.x + rect.width - right, height: bottom - top },
  ].filter((piece) => piece.width > 0 && piece.height > 0);
}
