import {
  getPlacedAssetBounds,
  getPlacedAssetInteractions,
  rotateDirection,
} from "@workhard/shared";
import type { AssetRotation, FacingDirection, Position, Rect, WorldObject } from "@workhard/shared";

const labels: Record<AssetRotation, string> = {
  0: "North",
  90: "East",
  180: "South",
  270: "West",
};

export function getAssetOrientationLabel(rotation: AssetRotation): string {
  return labels[rotation];
}

export function rotateAssetClockwise(rotation: AssetRotation): AssetRotation {
  return ((rotation + 90) % 360) as AssetRotation;
}

export interface AssetDirectionIndicator {
  center: Position;
  bounds: Rect;
  direction: FacingDirection;
  origin?: Position;
}

export function getAssetDirectionIndicators(object: WorldObject, pointerScale?: number): AssetDirectionIndicator[] {
  const interactions = getPlacedAssetInteractions(object);
  const bounds = getPlacedAssetBounds(object);
  const indicators = interactions.length > 0
    ? interactions.map(({ center, bounds: interactionBounds, direction }) => ({
      center,
      bounds: interactionBounds,
      direction,
    }))
    : [{
      center: {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      },
      bounds,
      direction: rotateDirection("up", object.rotation),
    }];
  if (indicators.length !== 1 || pointerScale === undefined) {
    return indicators;
  }
  const [indicator] = indicators;
  if (!indicator || indicator.bounds.width > 48 || indicator.bounds.height > 48) {
    return indicators;
  }
  const vector = directionVector(indicator.direction);
  const axisSize = vector.x === 0 ? indicator.bounds.height : indicator.bounds.width;
  const distance = Math.max(axisSize / 2 + 14, 44 / pointerScale);
  return [{
    ...indicator,
    origin: indicator.center,
    center: {
      x: indicator.center.x + vector.x * distance,
      y: indicator.center.y + vector.y * distance,
    },
  }];
}

function directionVector(direction: FacingDirection): Position {
  if (direction === "up") {
    return { x: 0, y: -1 };
  }
  if (direction === "down") {
    return { x: 0, y: 1 };
  }
  if (direction === "left") {
    return { x: -1, y: 0 };
  }
  return { x: 1, y: 0 };
}
