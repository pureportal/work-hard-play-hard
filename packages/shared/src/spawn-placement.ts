import { getAssetCollisionRects } from "./asset-placement.js";
import { getWallSolidRects, type FloorLayout } from "./building.js";
import { circleIntersectsRect, pointInRect, type Position, type Rect } from "./geometry.js";

export function getSpawnPlacementError(
  layout: FloorLayout,
  bounds: Rect,
  position: Position,
  players: readonly (Position & { connected: boolean })[] = [],
  defaultAccessMode: "open" | "assigned" | "none" = "open",
): "EDIT_OUT_OF_RANGE" | "SPAWN_BLOCKED" | "SPAWN_RESTRICTED" | "SPACE_OCCUPIED" | undefined {
  const { x, y } = position;
  const radius = 13;
  if (!Number.isFinite(x) || !Number.isFinite(y)
    || x - radius < bounds.x || y - radius < bounds.y
    || x + radius > bounds.x + bounds.width || y + radius > bounds.y + bounds.height) {
    return "EDIT_OUT_OF_RANGE";
  }
  const colliders = [
    ...layout.walls.flatMap((wall) => getWallSolidRects(wall, layout.openings)),
    ...getAssetCollisionRects(layout),
  ];
  if (colliders.some((rect) => circleIntersectsRect(x, y, radius, rect))) {
    return "SPAWN_BLOCKED";
  }
  if (layout.rooms.some((room) => (room.access.mode === "default" ? defaultAccessMode : room.access.mode) !== "open"
    && room.footprint.some((rect) => circleIntersectsRect(x, y, radius, rect)))) {
    return "SPAWN_RESTRICTED";
  }
  if (players.some((player) => player.connected && pointInRect(player.x, player.y, {
    x: x - radius - 16, y: y - radius - 16, width: radius * 2 + 32, height: radius * 2 + 32,
  }))) {
    return "SPACE_OCCUPIED";
  }
  return undefined;
}
