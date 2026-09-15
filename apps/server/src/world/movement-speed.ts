import { CHARACTER_WALK_SPEED, type Position } from "@workhard/shared";
import type { FloorRouteLeg } from "./floor-navigation.js";

export const MAX_MOVEMENT_STEP = 8;

const MAX_MOVEMENT_SPEED = 750;
const FULL_SPEED_DISTANCE = 1_200;

export function getMovementSpeed(start: Position, path: readonly Position[], upcomingLegs: readonly FloorRouteLeg[] = []): number {
  let distance = upcomingLegs.reduce((total, leg) => total + leg.distance, 0);
  let previous = start;
  for (const point of path) {
    distance += Math.hypot(point.x - previous.x, point.y - previous.y);
    if (distance >= FULL_SPEED_DISTANCE) {
      return MAX_MOVEMENT_SPEED;
    }
    previous = point;
  }
  return CHARACTER_WALK_SPEED + (MAX_MOVEMENT_SPEED - CHARACTER_WALK_SPEED) * Math.min(distance / FULL_SPEED_DISTANCE, 1);
}
