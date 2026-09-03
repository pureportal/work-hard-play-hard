import { pointInRect, type Position, type Rect } from "./geometry.js";
import type { AssetRotation, WorldObject } from "./assets.js";

export const BUILD_GRID_SIZE = 32;
export const WALL_THICKNESS = 12;
export const DOOR_WIDTH = BUILD_GRID_SIZE * 2;
export const WINDOW_WIDTH = BUILD_GRID_SIZE * 3;
export const OUTDOOR_MARGIN = BUILD_GRID_SIZE * 16;
export const MAX_LAYOUT_WALLS_PER_FLOOR = 512;
export const MAX_LAYOUT_OPENINGS_PER_FLOOR = 1_024;
export const MAX_LAYOUT_OBJECTS_PER_FLOOR = 4_096;
export const MAX_LAYOUT_ROOMS_PER_FLOOR = 512;

export type WallOrientation = "horizontal" | "vertical";
export type OpeningType = "door" | "window";
export type RoomAccessMode = "open" | "assigned";

export interface Wall {
  id: string;
  start: Position;
  end: Position;
}

interface WallOpeningBase {
  id: string;
  wallId: string;
  offset: number;
  width: number;
}

export interface Door extends WallOpeningBase {
  type: "door";
}

export interface WindowLightSource {
  color: string;
  intensity: number;
  depth: number;
}

export interface Window extends WallOpeningBase {
  type: "window";
  light: WindowLightSource;
}

export type WallOpening = Door | Window;

export interface RoomBoundarySegment {
  wallId: string;
  startOffset: number;
  endOffset: number;
}

export interface RoomAccess {
  mode: RoomAccessMode;
  assignedPersonIds: string[];
  knockable: boolean;
}

export interface Room {
  id: string;
  floorId: string;
  name: string;
  color: string;
  capacity: number;
  bounds: Rect;
  footprint: Rect[];
  boundary: RoomBoundarySegment[];
  doorIds: string[];
  windowIds: string[];
  privateEligible: boolean;
  access: RoomAccess;
}

export interface RoomSettings {
  name: string;
  color: string;
  access: RoomAccess;
}

export interface FloorTile {
  id: string;
  x: number;
  y: number;
  color: string;
}

export interface FloorLayout {
  floorId: string;
  revision: number;
  walls: Wall[];
  openings: WallOpening[];
  tiles: FloorTile[];
  objects: WorldObject[];
  rooms: Room[];
}

export type LayoutTool = "wall" | "door" | "window" | "asset" | "erase";

export type LayoutEdit =
  | { tool: "wall"; start: Position; end: Position }
  | { tool: "asset"; position: Position; assetId: string; variantId: string; rotation: AssetRotation }
  | { tool: "asset.move"; objectId: string; position: Position; variantId: string; rotation: AssetRotation }
  | { tool: "wall.move"; wallId: string; start: Position; end: Position }
  | { tool: "opening.move"; openingId: string; position: Position }
  | { tool: "item.remove"; item: LayoutItemReference }
  | { tool: Exclude<LayoutTool, "wall" | "asset">; position: Position };

export type LayoutItemReference =
  | { type: "asset"; id: string }
  | { type: "wall"; id: string }
  | { type: "opening"; id: string };

export interface OutdoorWindowLight {
  windowId: string;
  roomId: string;
  origin: Position;
  direction: Position;
  width: number;
  depth: number;
  color: string;
  intensity: number;
}

export function getOutdoorBounds(bounds: Pick<Rect, "width" | "height">, margin = OUTDOOR_MARGIN): Rect {
  return {
    x: -margin,
    y: -margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2,
  };
}

export function getWallOrientation(wall: Wall): WallOrientation {
  if (wall.start.y === wall.end.y && wall.start.x !== wall.end.x) {
    return "horizontal";
  }
  if (wall.start.x === wall.end.x && wall.start.y !== wall.end.y) {
    return "vertical";
  }
  throw new Error("WALL_NOT_AXIS_ALIGNED");
}

export function getWallLength(wall: Wall): number {
  return getWallOrientation(wall) === "horizontal"
    ? Math.abs(wall.end.x - wall.start.x)
    : Math.abs(wall.end.y - wall.start.y);
}

export function normalizeWall(wall: Wall): Wall {
  const orientation = getWallOrientation(wall);
  if (
    (orientation === "horizontal" && wall.start.x <= wall.end.x)
    || (orientation === "vertical" && wall.start.y <= wall.end.y)
  ) {
    return wall;
  }
  return { ...wall, start: wall.end, end: wall.start };
}

export function getWallRect(input: Wall, thickness = WALL_THICKNESS): Rect {
  const wall = normalizeWall(input);
  const halfThickness = thickness / 2;
  if (getWallOrientation(wall) === "horizontal") {
    return {
      x: wall.start.x,
      y: wall.start.y - halfThickness,
      width: wall.end.x - wall.start.x,
      height: thickness,
    };
  }
  return {
    x: wall.start.x - halfThickness,
    y: wall.start.y,
    width: thickness,
    height: wall.end.y - wall.start.y,
  };
}

export function getOpeningCenter(input: Wall, opening: WallOpening): Position {
  const wall = normalizeWall(input);
  const centerOffset = opening.offset + opening.width / 2;
  return getWallOrientation(wall) === "horizontal"
    ? { x: wall.start.x + centerOffset, y: wall.start.y }
    : { x: wall.start.x, y: wall.start.y + centerOffset };
}

export function getOpeningRect(wall: Wall, opening: WallOpening, thickness = WALL_THICKNESS): Rect {
  const center = getOpeningCenter(wall, opening);
  const halfThickness = thickness / 2;
  return getWallOrientation(wall) === "horizontal"
    ? { x: center.x - opening.width / 2, y: center.y - halfThickness, width: opening.width, height: thickness }
    : { x: center.x - halfThickness, y: center.y - opening.width / 2, width: thickness, height: opening.width };
}

export function getWallSolidRects(wall: Wall, openings: WallOpening[], thickness = WALL_THICKNESS): Rect[] {
  const normalized = normalizeWall(wall);
  const length = getWallLength(normalized);
  const doors = openings
    .filter((opening) => opening.wallId === wall.id && opening.type === "door")
    .map((door) => ({ start: Math.max(0, door.offset), end: Math.min(length, door.offset + door.width) }))
    .filter((door) => door.end > door.start)
    .sort((left, right) => left.start - right.start);
  const ranges: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const door of doors) {
    if (door.start > cursor) {
      ranges.push({ start: cursor, end: door.start });
    }
    cursor = Math.max(cursor, door.end);
  }
  if (cursor < length) {
    ranges.push({ start: cursor, end: length });
  }
  const halfThickness = thickness / 2;
  return ranges.map((range) => getWallOrientation(normalized) === "horizontal"
    ? {
      x: normalized.start.x + range.start,
      y: normalized.start.y - halfThickness,
      width: range.end - range.start,
      height: thickness,
    }
    : {
      x: normalized.start.x - halfThickness,
      y: normalized.start.y + range.start,
      width: thickness,
      height: range.end - range.start,
    });
}

export function isPointInRoom(x: number, y: number, room: Room): boolean {
  return pointInRect(x, y, room.bounds) && room.footprint.some((rect) => pointInRect(x, y, rect));
}

export function getRoomDoorPosition(
  layout: FloorLayout,
  room: Room,
  door: Door,
  position: "center" | "inside" | "outside" = "center",
  distance = 36,
): Position {
  const wall = layout.walls.find((candidate) => candidate.id === door.wallId);
  if (!wall) {
    throw new Error("WALL_NOT_FOUND");
  }
  const center = getOpeningCenter(wall, door);
  if (position === "center") {
    return center;
  }
  const orientation = getWallOrientation(wall);
  const first = orientation === "horizontal"
    ? { x: center.x, y: center.y - distance }
    : { x: center.x - distance, y: center.y };
  const second = orientation === "horizontal"
    ? { x: center.x, y: center.y + distance }
    : { x: center.x + distance, y: center.y };
  const firstInside = isPointInRoom(first.x, first.y, room);
  return position === "inside"
    ? (firstInside ? first : second)
    : (firstInside ? second : first);
}
