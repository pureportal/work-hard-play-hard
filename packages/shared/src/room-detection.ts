import {
  BUILD_GRID_SIZE,
  getOpeningCenter,
  getWallLength,
  getWallOrientation,
  isPointInRoom,
  normalizeWall,
  type FloorLayout,
  type OutdoorWindowLight,
  type Room,
  type RoomAccess,
  type RoomBoundarySegment,
  type RoomSettings,
  type Wall,
  type WallOpening,
} from "./building.js";
import { pointInRect, type Position, type Rect } from "./geometry.js";

const MIN_ROOM_CELLS = 4;
const DEFAULT_ROOM_COLORS = ["#dce7f7", "#e4ddf5", "#d8eadf", "#f3dfd1", "#f1dce7", "#e8e3d4"];

interface BarrierGrid {
  columns: number;
  rows: number;
  vertical: (string | undefined)[];
  horizontal: (string | undefined)[];
}

export interface DetectedRoomGeometry {
  bounds: Rect;
  footprint: Rect[];
  boundary: RoomBoundarySegment[];
  doorIds: string[];
  windowIds: string[];
  privateEligible: boolean;
  area: number;
}

export interface RoomTemplate extends RoomSettings {
  id: string;
  anchor: Position;
  capacity?: number;
}

export interface RoomDetectionInput {
  floorId: string;
  width: number;
  height: number;
  walls: Wall[];
  openings: WallOpening[];
}

export function detectRooms(input: RoomDetectionInput): DetectedRoomGeometry[] {
  const barriers = createBarrierGrid(input.width, input.height, input.walls);
  const visited = new Uint8Array(barriers.columns * barriers.rows);
  const rooms: DetectedRoomGeometry[] = [];
  for (let row = 0; row < barriers.rows; row += 1) {
    for (let column = 0; column < barriers.columns; column += 1) {
      const startIndex = cellIndex(column, row, barriers.columns);
      if (visited[startIndex]) {
        continue;
      }
      const component = floodComponent(column, row, barriers, visited);
      if (component.outdoor || component.cells.length < MIN_ROOM_CELLS) {
        continue;
      }
      rooms.push(createGeometry(component.cells, barriers, input.walls, input.openings));
    }
  }
  return rooms.sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x);
}

export function reconcileRooms(
  input: RoomDetectionInput,
  previousRooms: Room[] = [],
  templates: RoomTemplate[] = [],
): Room[] {
  const geometries = detectRooms(input);
  const unmatchedPrevious = new Set(previousRooms.map((room) => room.id));
  return geometries.map((geometry, index) => {
    const template = templates.find((candidate) => geometry.footprint.some((rect) => pointInRect(candidate.anchor.x, candidate.anchor.y, rect)));
    const previous = findBestPreviousRoom(geometry, previousRooms.filter((room) => unmatchedPrevious.has(room.id)));
    if (previous) {
      unmatchedPrevious.delete(previous.id);
    }
    const identity = template ?? previous;
    const access = normalizeAccess(identity?.access, geometry.privateEligible);
    return {
      id: identity?.id ?? detectedRoomId(input.floorId, geometry),
      floorId: input.floorId,
      name: identity?.name ?? `Room ${index + 1}`,
      color: identity?.color ?? DEFAULT_ROOM_COLORS[index % DEFAULT_ROOM_COLORS.length]!,
      capacity: template?.capacity ?? previous?.capacity ?? Math.max(2, Math.round(geometry.area / 12_000)),
      bounds: geometry.bounds,
      footprint: geometry.footprint,
      boundary: geometry.boundary,
      doorIds: geometry.doorIds,
      windowIds: geometry.windowIds,
      privateEligible: geometry.privateEligible,
      access,
    };
  });
}

export function detectLayoutRooms(
  layout: FloorLayout,
  floor: { width: number; height: number },
  templates: RoomTemplate[] = [],
): FloorLayout {
  return {
    ...layout,
    rooms: reconcileRooms({
      floorId: layout.floorId,
      width: floor.width,
      height: floor.height,
      walls: layout.walls,
      openings: layout.openings,
    }, layout.rooms, templates),
  };
}

export function getOutdoorWindowLights(
  layout: FloorLayout,
  floor: { width: number; height: number },
): OutdoorWindowLight[] {
  const barriers = createBarrierGrid(floor.width, floor.height, layout.walls);
  const outdoorCells = createOutdoorCellMask(barriers);
  const lights: OutdoorWindowLight[] = [];
  for (const opening of layout.openings) {
    if (opening.type !== "window") {
      continue;
    }
    const wall = layout.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) {
      continue;
    }
    const origin = getOpeningCenter(wall, opening);
    const normal = getWallOrientation(wall) === "horizontal" ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const sampleDistance = BUILD_GRID_SIZE / 2;
    const first = { x: origin.x - normal.x * sampleDistance, y: origin.y - normal.y * sampleDistance };
    const second = { x: origin.x + normal.x * sampleDistance, y: origin.y + normal.y * sampleDistance };
    const firstRoom = layout.rooms.find((room) => isPointInRoom(first.x, first.y, room));
    const secondRoom = layout.rooms.find((room) => isPointInRoom(second.x, second.y, room));
    if (Boolean(firstRoom) === Boolean(secondRoom)) {
      continue;
    }
    const room = firstRoom ?? secondRoom;
    const outdoorPoint = firstRoom ? second : first;
    const outdoorIndex = getPointCellIndex(outdoorPoint, barriers);
    if (!room || (outdoorIndex !== undefined && outdoorCells[outdoorIndex] !== 1)) {
      continue;
    }
    const direction = firstRoom ? { x: -normal.x, y: -normal.y } : normal;
    lights.push({
      windowId: opening.id,
      roomId: room.id,
      origin,
      direction,
      width: opening.width,
      depth: opening.light.depth,
      color: opening.light.color,
      intensity: opening.light.intensity,
    });
  }
  return lights;
}

function createBarrierGrid(width: number, height: number, walls: Wall[]): BarrierGrid {
  const columns = Math.ceil(width / BUILD_GRID_SIZE);
  const rows = Math.ceil(height / BUILD_GRID_SIZE);
  const vertical = Array.from({ length: (columns + 1) * rows }, (): string | undefined => undefined);
  const horizontal = Array.from({ length: columns * (rows + 1) }, (): string | undefined => undefined);
  for (const inputWall of walls) {
    const wall = normalizeWall(inputWall);
    const orientation = getWallOrientation(wall);
    assertGridPoint(wall.start);
    assertGridPoint(wall.end);
    if (orientation === "horizontal") {
      const row = wall.start.y / BUILD_GRID_SIZE;
      const startColumn = wall.start.x / BUILD_GRID_SIZE;
      const endColumn = wall.end.x / BUILD_GRID_SIZE;
      for (let column = startColumn; column < endColumn; column += 1) {
        if (row >= 0 && row <= rows && column >= 0 && column < columns) {
          horizontal[horizontalIndex(column, row, columns)] = wall.id;
        }
      }
    } else {
      const column = wall.start.x / BUILD_GRID_SIZE;
      const startRow = wall.start.y / BUILD_GRID_SIZE;
      const endRow = wall.end.y / BUILD_GRID_SIZE;
      for (let row = startRow; row < endRow; row += 1) {
        if (column >= 0 && column <= columns && row >= 0 && row < rows) {
          vertical[verticalIndex(column, row, columns)] = wall.id;
        }
      }
    }
  }
  return { columns, rows, vertical, horizontal };
}

function floodComponent(
  startColumn: number,
  startRow: number,
  barriers: BarrierGrid,
  visited: Uint8Array,
): { cells: number[]; outdoor: boolean } {
  const queue = [cellIndex(startColumn, startRow, barriers.columns)];
  const cells: number[] = [];
  let cursor = 0;
  let outdoor = false;
  visited[queue[0]!] = 1;
  while (cursor < queue.length) {
    const index = queue[cursor++]!;
    cells.push(index);
    const column = index % barriers.columns;
    const row = Math.floor(index / barriers.columns);
    const neighbors = [
      { column: column - 1, row, barrier: barriers.vertical[verticalIndex(column, row, barriers.columns)] },
      { column: column + 1, row, barrier: barriers.vertical[verticalIndex(column + 1, row, barriers.columns)] },
      { column, row: row - 1, barrier: barriers.horizontal[horizontalIndex(column, row, barriers.columns)] },
      { column, row: row + 1, barrier: barriers.horizontal[horizontalIndex(column, row + 1, barriers.columns)] },
    ];
    for (const neighbor of neighbors) {
      const inBounds = neighbor.column >= 0 && neighbor.column < barriers.columns
        && neighbor.row >= 0 && neighbor.row < barriers.rows;
      if (!inBounds) {
        if (!neighbor.barrier) {
          outdoor = true;
        }
        continue;
      }
      if (neighbor.barrier) {
        continue;
      }
      const neighborIndex = cellIndex(neighbor.column, neighbor.row, barriers.columns);
      if (!visited[neighborIndex]) {
        visited[neighborIndex] = 1;
        queue.push(neighborIndex);
      }
    }
  }
  return { cells, outdoor };
}

function createOutdoorCellMask(barriers: BarrierGrid): Uint8Array {
  const visited = new Uint8Array(barriers.columns * barriers.rows);
  const outdoorCells = new Uint8Array(visited.length);
  for (let row = 0; row < barriers.rows; row += 1) {
    for (let column = 0; column < barriers.columns; column += 1) {
      const index = cellIndex(column, row, barriers.columns);
      if (visited[index]) {
        continue;
      }
      const component = floodComponent(column, row, barriers, visited);
      if (component.outdoor) {
        for (const cell of component.cells) {
          outdoorCells[cell] = 1;
        }
      }
    }
  }
  return outdoorCells;
}

function getPointCellIndex(point: Position, barriers: BarrierGrid): number | undefined {
  const column = Math.floor(point.x / BUILD_GRID_SIZE);
  const row = Math.floor(point.y / BUILD_GRID_SIZE);
  if (column < 0 || column >= barriers.columns || row < 0 || row >= barriers.rows) {
    return undefined;
  }
  return cellIndex(column, row, barriers.columns);
}

function createGeometry(
  cells: number[],
  barriers: BarrierGrid,
  walls: Wall[],
  openings: WallOpening[],
): DetectedRoomGeometry {
  const cellSet = new Set(cells);
  const footprint = mergeCells(cells, barriers.columns);
  const bounds = footprint.reduce((result, rect) => ({
    x: Math.min(result.x, rect.x),
    y: Math.min(result.y, rect.y),
    width: Math.max(result.x + result.width, rect.x + rect.width) - Math.min(result.x, rect.x),
    height: Math.max(result.y + result.height, rect.y + rect.height) - Math.min(result.y, rect.y),
  }));
  const boundaryRanges = new Map<string, { start: number; end: number }[]>();
  for (const index of cells) {
    const column = index % barriers.columns;
    const row = Math.floor(index / barriers.columns);
    collectBoundaryRange(boundaryRanges, cellSet, barriers, column, row, "left", walls);
    collectBoundaryRange(boundaryRanges, cellSet, barriers, column, row, "right", walls);
    collectBoundaryRange(boundaryRanges, cellSet, barriers, column, row, "top", walls);
    collectBoundaryRange(boundaryRanges, cellSet, barriers, column, row, "bottom", walls);
  }
  const boundary = [...boundaryRanges].flatMap(([wallId, ranges]) => mergeRanges(ranges).map((range) => ({
    wallId,
    startOffset: range.start,
    endOffset: range.end,
  })));
  const boundaryOpenings = openings.filter((opening) => boundary.some(
    (segment) => segment.wallId === opening.wallId
      && opening.offset < segment.endOffset
      && opening.offset + opening.width > segment.startOffset,
  ));
  const doorIds = boundaryOpenings.filter((opening) => opening.type === "door").map((opening) => opening.id);
  const windowIds = boundaryOpenings.filter((opening) => opening.type === "window").map((opening) => opening.id);
  return {
    bounds,
    footprint,
    boundary,
    doorIds,
    windowIds,
    privateEligible: doorIds.length > 0,
    area: cells.length * BUILD_GRID_SIZE * BUILD_GRID_SIZE,
  };
}

function collectBoundaryRange(
  ranges: Map<string, { start: number; end: number }[]>,
  cells: Set<number>,
  barriers: BarrierGrid,
  column: number,
  row: number,
  side: "left" | "right" | "top" | "bottom",
  walls: Wall[],
): void {
  const neighborColumn = side === "left" ? column - 1 : side === "right" ? column + 1 : column;
  const neighborRow = side === "top" ? row - 1 : side === "bottom" ? row + 1 : row;
  if (
    neighborColumn >= 0
    && neighborColumn < barriers.columns
    && neighborRow >= 0
    && neighborRow < barriers.rows
    && cells.has(cellIndex(neighborColumn, neighborRow, barriers.columns))
  ) {
    return;
  }
  const wallId = side === "left"
    ? barriers.vertical[verticalIndex(column, row, barriers.columns)]
    : side === "right"
      ? barriers.vertical[verticalIndex(column + 1, row, barriers.columns)]
      : side === "top"
        ? barriers.horizontal[horizontalIndex(column, row, barriers.columns)]
        : barriers.horizontal[horizontalIndex(column, row + 1, barriers.columns)];
  if (!wallId) {
    return;
  }
  const wall = walls.find((candidate) => candidate.id === wallId);
  if (!wall) {
    return;
  }
  const normalized = normalizeWall(wall);
  const start = getWallOrientation(normalized) === "horizontal"
    ? column * BUILD_GRID_SIZE - normalized.start.x
    : row * BUILD_GRID_SIZE - normalized.start.y;
  const end = Math.min(getWallLength(normalized), start + BUILD_GRID_SIZE);
  if (end > start) {
    const wallRanges = ranges.get(wallId) ?? [];
    wallRanges.push({ start: Math.max(0, start), end });
    ranges.set(wallId, wallRanges);
  }
}

function mergeCells(cells: number[], columns: number): Rect[] {
  const byRow = new Map<number, number[]>();
  for (const index of cells) {
    const row = Math.floor(index / columns);
    const rowColumns = byRow.get(row) ?? [];
    rowColumns.push(index % columns);
    byRow.set(row, rowColumns);
  }
  const rectangles: Rect[] = [];
  const active = new Map<string, Rect>();
  for (const [row, rowColumns] of [...byRow].sort(([left], [right]) => left - right)) {
    rowColumns.sort((left, right) => left - right);
    const runs: { start: number; end: number }[] = [];
    let start = rowColumns[0]!;
    let end = start + 1;
    for (const column of rowColumns.slice(1)) {
      if (column === end) {
        end += 1;
      } else {
        runs.push({ start, end });
        start = column;
        end = column + 1;
      }
    }
    runs.push({ start, end });
    const currentKeys = new Set<string>();
    for (const run of runs) {
      const key = `${run.start}:${run.end}`;
      currentKeys.add(key);
      const existing = active.get(key);
      if (existing && existing.y + existing.height === row * BUILD_GRID_SIZE) {
        existing.height += BUILD_GRID_SIZE;
      } else {
        const rect = {
          x: run.start * BUILD_GRID_SIZE,
          y: row * BUILD_GRID_SIZE,
          width: (run.end - run.start) * BUILD_GRID_SIZE,
          height: BUILD_GRID_SIZE,
        };
        rectangles.push(rect);
        active.set(key, rect);
      }
    }
    for (const key of active.keys()) {
      if (!currentKeys.has(key)) {
        active.delete(key);
      }
    }
  }
  return rectangles;
}

function mergeRanges(ranges: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const merged: { start: number; end: number }[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function findBestPreviousRoom(geometry: DetectedRoomGeometry, rooms: Room[]): Room | undefined {
  let bestRoom: Room | undefined;
  let bestScore = 0;
  for (const room of rooms) {
    const overlap = footprintIntersectionArea(geometry.footprint, room.footprint);
    const score = overlap / Math.min(geometry.area, footprintArea(room.footprint));
    if (score > bestScore && score >= 0.35) {
      bestScore = score;
      bestRoom = room;
    }
  }
  return bestRoom;
}

function footprintIntersectionArea(left: Rect[], right: Rect[]): number {
  let area = 0;
  for (const first of left) {
    for (const second of right) {
      const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
      const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
      area += width * height;
    }
  }
  return area;
}

function footprintArea(footprint: Rect[]): number {
  return footprint.reduce((total, rect) => total + rect.width * rect.height, 0);
}

function normalizeAccess(access: RoomAccess | undefined, privateEligible: boolean): RoomAccess {
  if (!access || !privateEligible || access.mode === "open" || access.assignedPersonIds.length === 0) {
    return { mode: "open", assignedPersonIds: access?.assignedPersonIds ?? [], knockable: false };
  }
  return {
    mode: "assigned",
    assignedPersonIds: [...new Set(access.assignedPersonIds)],
    knockable: access.knockable,
  };
}

function detectedRoomId(floorId: string, geometry: DetectedRoomGeometry): string {
  const signature = geometry.footprint.map((rect) => `${rect.x},${rect.y},${rect.width},${rect.height}`).join(";");
  let hash = 2_166_136_261;
  for (const character of signature) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return `room-${floorId}-${(hash >>> 0).toString(36)}`;
}

function assertGridPoint(point: Position): void {
  if (point.x % BUILD_GRID_SIZE !== 0 || point.y % BUILD_GRID_SIZE !== 0) {
    throw new Error("WALL_OFF_GRID");
  }
}

function cellIndex(column: number, row: number, columns: number): number {
  return row * columns + column;
}

function verticalIndex(column: number, row: number, columns: number): number {
  return row * (columns + 1) + column;
}

function horizontalIndex(column: number, row: number, columns: number): number {
  return row * columns + column;
}
