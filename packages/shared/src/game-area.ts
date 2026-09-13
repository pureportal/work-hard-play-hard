import { getPlacedAssetBounds, requireAssetDefinition } from "./assets.js";
import type { WorldObject } from "./index.js";
import type { Position } from "./geometry.js";

export function getGameArea(object: WorldObject): Position & { radius: number } {
  const bounds = getPlacedAssetBounds(object);
  const definition = requireAssetDefinition(object.assetId);
  if (definition.kind !== "game" || !definition.radius) {
    throw new Error("GAME_AREA_INVALID");
  }
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, radius: definition.radius };
}

export function distanceFromGameArea(position: Position, object: WorldObject): number {
  const area = getGameArea(object);
  return Math.hypot(position.x - area.x, position.y - area.y) - area.radius;
}
