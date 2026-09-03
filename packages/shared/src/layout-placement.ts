import {
  BUILD_GRID_SIZE,
  DOOR_WIDTH,
  WINDOW_WIDTH,
  getOpeningRect,
  getWallLength,
  getWallOrientation,
  getWallRect,
  normalizeWall,
  type FloorLayout,
  type OpeningType,
  type Wall,
  type WallOpening,
} from "./building.js";
import { getAssetCollisionRects } from "./asset-placement.js";
import { getPlacedAssetCellRects } from "./assets.js";
import { rectanglesOverlap, type Position, type Rect } from "./geometry.js";

export type WallPlacementError =
  | "EDIT_OUT_OF_RANGE"
  | "SPACE_OCCUPIED"
  | "WALL_OVERLAP"
  | "WALL_INTERSECTS_OPENING";

export type OpeningPlacementError =
  | "OPENING_REQUIRES_WALL"
  | "OPENING_TOO_CLOSE_TO_CORNER"
  | "OPENING_AT_WALL_INTERSECTION"
  | "SPACE_OCCUPIED";

export interface OpeningPlacement {
  wall?: Wall;
  opening?: WallOpening;
  replacedOpeningIds: string[];
  error?: OpeningPlacementError;
}

export function getWallPlacementError(
  layout: FloorLayout,
  bounds: Rect,
  inputWall: Wall,
  ignoredWallIds: ReadonlySet<string> = new Set(),
): WallPlacementError | undefined {
  const wall = normalizeWall(inputWall);
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  for (const point of [wall.start, wall.end]) {
    if (point.x < bounds.x || point.y < bounds.y || point.x > right || point.y > bottom) {
      return "EDIT_OUT_OF_RANGE";
    }
  }
  const wallRect = getWallRect(wall);
  if (layout.objects.some((object) => getPlacedAssetCellRects(object).some((rect) => rectanglesOverlap(wallRect, rect)))) {
    return "SPACE_OCCUPIED";
  }
  const orientation = getWallOrientation(wall);
  const overlapsWall = layout.walls.some((candidateInput) => {
    if (ignoredWallIds.has(candidateInput.id) || getWallOrientation(candidateInput) !== orientation) {
      return false;
    }
    const candidate = normalizeWall(candidateInput);
    if (orientation === "horizontal") {
      return candidate.start.y === wall.start.y
        && rangesOverlap(candidate.start.x, candidate.end.x, wall.start.x, wall.end.x);
    }
    return candidate.start.x === wall.start.x
      && rangesOverlap(candidate.start.y, candidate.end.y, wall.start.y, wall.end.y);
  });
  if (overlapsWall) {
    return "WALL_OVERLAP";
  }
  const intersectsOpening = layout.openings.some((opening) => {
    const openingWall = layout.walls.find((candidate) => candidate.id === opening.wallId);
    if (!openingWall || ignoredWallIds.has(openingWall.id)) {
      return false;
    }
    const intersectionOffset = getPerpendicularIntersectionOffset(openingWall, wall);
    return intersectionOffset !== undefined
      && opening.offset < intersectionOffset
      && intersectionOffset < opening.offset + opening.width;
  });
  return intersectsOpening ? "WALL_INTERSECTS_OPENING" : undefined;
}

export function getWallOpeningPlacement(
  layout: FloorLayout,
  type: OpeningType,
  rawPosition: Position,
  ignoredOpeningIds: ReadonlySet<string> = new Set(),
): OpeningPlacement {
  const x = snapToBuildGrid(rawPosition.x);
  const y = snapToBuildGrid(rawPosition.y);
  const candidates = layout.walls.map((wallInput) => {
    const wall = normalizeWall(wallInput);
    const horizontal = getWallOrientation(wall) === "horizontal";
    const coordinate = horizontal ? x - wall.start.x : y - wall.start.y;
    const distance = horizontal ? Math.abs(y - wall.start.y) : Math.abs(x - wall.start.x);
    return { wall, coordinate, distance, length: getWallLength(wall) };
  }).filter((candidate) => candidate.coordinate >= 0 && candidate.coordinate <= candidate.length)
    .sort((left, right) => left.distance - right.distance || left.length - right.length);
  const candidate = candidates[0];
  if (!candidate || candidate.distance > BUILD_GRID_SIZE / 2) {
    return { replacedOpeningIds: [], error: "OPENING_REQUIRES_WALL" };
  }
  const width = type === "door" ? DOOR_WIDTH : WINDOW_WIDTH;
  const offset = snapToBuildGrid(candidate.coordinate - width / 2);
  const opening: WallOpening = type === "door"
    ? { id: "preview", wallId: candidate.wall.id, offset, width, type }
    : {
      id: "preview",
      wallId: candidate.wall.id,
      offset,
      width,
      type,
      light: { color: "#fff4cf", intensity: 0.2, depth: 112 },
    };
  const replacedOpeningIds = layout.openings.filter((existing) => (
    !ignoredOpeningIds.has(existing.id)
    && existing.wallId === candidate.wall.id
    && offset < existing.offset + existing.width
    && offset + width > existing.offset
  )).map((existing) => existing.id);
  if (offset < BUILD_GRID_SIZE || offset + width > candidate.length - BUILD_GRID_SIZE) {
    return { wall: candidate.wall, opening, replacedOpeningIds, error: "OPENING_TOO_CLOSE_TO_CORNER" };
  }
  const intersectsWall = layout.walls.some((wall) => {
    if (wall.id === candidate.wall.id) {
      return false;
    }
    const intersectionOffset = getPerpendicularIntersectionOffset(candidate.wall, wall);
    return intersectionOffset !== undefined && offset < intersectionOffset && intersectionOffset < offset + width;
  });
  if (intersectsWall) {
    return { wall: candidate.wall, opening, replacedOpeningIds, error: "OPENING_AT_WALL_INTERSECTION" };
  }
  const clearance = getOpeningRect(candidate.wall, opening, BUILD_GRID_SIZE * 2);
  if (getAssetCollisionRects(layout).some((collider) => rectanglesOverlap(clearance, collider))) {
    return { wall: candidate.wall, opening, replacedOpeningIds, error: "SPACE_OCCUPIED" };
  }
  return { wall: candidate.wall, opening, replacedOpeningIds };
}

export function mergeWallSegments(
  walls: Wall[],
  openings: WallOpening[],
): { walls: Wall[]; openings: WallOpening[] } {
  const indexedWalls = walls.map((wall, index) => ({ wall: normalizeWall(wall), index }));
  const groups: { members: typeof indexedWalls; orientation: "horizontal" | "vertical"; fixed: number; start: number; end: number }[] = [];
  const byLine = new Map<string, typeof indexedWalls>();
  for (const indexed of indexedWalls) {
    const orientation = getWallOrientation(indexed.wall);
    const fixed = orientation === "horizontal" ? indexed.wall.start.y : indexed.wall.start.x;
    const key = `${orientation}:${fixed}`;
    const line = byLine.get(key) ?? [];
    line.push(indexed);
    byLine.set(key, line);
  }
  for (const [key, line] of byLine) {
    const [orientation, fixedValue] = key.split(":") as ["horizontal" | "vertical", string];
    const fixed = Number(fixedValue);
    line.sort((left, right) => axisStart(left.wall) - axisStart(right.wall));
    for (const indexed of line) {
      const start = axisStart(indexed.wall);
      const end = axisEnd(indexed.wall);
      const current = groups.at(-1);
      if (current && current.orientation === orientation && current.fixed === fixed && start <= current.end) {
        current.members.push(indexed);
        current.end = Math.max(current.end, end);
      } else {
        groups.push({ members: [indexed], orientation, fixed, start, end });
      }
    }
  }
  groups.sort((left, right) => Math.min(...left.members.map((member) => member.index)) - Math.min(...right.members.map((member) => member.index)));
  const sourceById = new Map(indexedWalls.map(({ wall }) => [wall.id, wall]));
  const wallIdMapping = new Map<string, { wallId: string; start: number }>();
  const mergedWalls = groups.map((group) => {
    const retained = group.members.reduce((current, candidate) => candidate.index < current.index ? candidate : current);
    for (const member of group.members) {
      wallIdMapping.set(member.wall.id, { wallId: retained.wall.id, start: group.start });
    }
    return group.orientation === "horizontal"
      ? { id: retained.wall.id, start: { x: group.start, y: group.fixed }, end: { x: group.end, y: group.fixed } }
      : { id: retained.wall.id, start: { x: group.fixed, y: group.start }, end: { x: group.fixed, y: group.end } };
  });
  const mergedOpenings = openings.flatMap((opening) => {
    const sourceWall = sourceById.get(opening.wallId);
    const mapping = wallIdMapping.get(opening.wallId);
    if (!sourceWall || !mapping) {
      return [];
    }
    return [{
      ...opening,
      wallId: mapping.wallId,
      offset: axisStart(sourceWall) + opening.offset - mapping.start,
    }];
  });
  return { walls: mergedWalls, openings: mergedOpenings };
}

export function getPerpendicularIntersectionOffset(hostInput: Wall, otherInput: Wall): number | undefined {
  const host = normalizeWall(hostInput);
  const other = normalizeWall(otherInput);
  const hostOrientation = getWallOrientation(host);
  if (hostOrientation === getWallOrientation(other)) {
    return undefined;
  }
  if (hostOrientation === "horizontal") {
    if (
      other.start.x < host.start.x
      || other.start.x > host.end.x
      || host.start.y < other.start.y
      || host.start.y > other.end.y
    ) {
      return undefined;
    }
    return other.start.x - host.start.x;
  }
  if (
    other.start.y < host.start.y
    || other.start.y > host.end.y
    || host.start.x < other.start.x
    || host.start.x > other.end.x
  ) {
    return undefined;
  }
  return other.start.y - host.start.y;
}

export function snapToBuildGrid(value: number): number {
  return Math.round(value / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
}

function rangesOverlap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): boolean {
  return firstStart < secondEnd && firstEnd > secondStart;
}

function axisStart(wall: Wall): number {
  return getWallOrientation(wall) === "horizontal" ? wall.start.x : wall.start.y;
}

function axisEnd(wall: Wall): number {
  return getWallOrientation(wall) === "horizontal" ? wall.end.x : wall.end.y;
}
