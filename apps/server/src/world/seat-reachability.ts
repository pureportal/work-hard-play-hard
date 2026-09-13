import { getWallSolidRects, isPointInRoom, type FloorLayout, type Position, type Rect } from "@workhard/shared";

export function canReachSeat(layout: FloorLayout, position: Position, seat: Position): boolean {
  if (layout.rooms.some((room) => isPointInRoom(position.x, position.y, room) !== isPointInRoom(seat.x, seat.y, room))) {
    return false;
  }
  return !layout.walls.some((wall) => getWallSolidRects(wall, layout.openings)
    .some((rect) => segmentIntersectsRect(position, seat, rect)));
}

function segmentIntersectsRect(start: Position, end: Position, rect: Rect): boolean {
  let enter = 0;
  let exit = 1;
  for (const axis of ["x", "y"] as const) {
    const delta = end[axis] - start[axis];
    const minimum = rect[axis];
    const maximum = minimum + (axis === "x" ? rect.width : rect.height);
    if (delta === 0) {
      if (start[axis] < minimum || start[axis] > maximum) return false;
      continue;
    }
    const first = (minimum - start[axis]) / delta;
    const last = (maximum - start[axis]) / delta;
    enter = Math.max(enter, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (enter > exit) return false;
  }
  return true;
}
