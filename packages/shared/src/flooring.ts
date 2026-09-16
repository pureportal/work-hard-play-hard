import { getOpeningArtworkRect, getWallSolidRects, type FloorLayout } from "./building.js";
import { rectanglesOverlap, subtractRect, type Rect } from "./geometry.js";

const architectureCache = new WeakMap<FloorLayout, {
  revision: number;
  walls: FloorLayout["walls"];
  openings: FloorLayout["openings"];
  wallCount: number;
  openingCount: number;
  rects: Rect[];
}>();

export function getFlooringVisibleRects(layout: FloorLayout, footprint: readonly Rect[]): Rect[] {
  let visible = [...footprint];
  for (const wall of getArchitectureRects(layout)) {
    if (visible.some((rect) => rectanglesOverlap(rect, wall))) {
      visible = visible.flatMap((rect) => subtractRect(rect, wall));
    }
  }
  return visible;
}

function getArchitectureRects(layout: FloorLayout): Rect[] {
  const cached = architectureCache.get(layout);
  if (cached && cached.revision === layout.revision && cached.walls === layout.walls
    && cached.openings === layout.openings && cached.wallCount === layout.walls.length
    && cached.openingCount === layout.openings.length) {
    return cached.rects;
  }
  const walls = new Map(layout.walls.map((wall) => [wall.id, wall]));
  const rects = layout.walls.flatMap((wall) => getWallSolidRects(wall, layout.openings));
  for (const opening of layout.openings) {
    const wall = walls.get(opening.wallId);
    if (wall) rects.push(getOpeningArtworkRect(wall, opening));
  }
  architectureCache.set(layout, {
    revision: layout.revision,
    walls: layout.walls,
    openings: layout.openings,
    wallCount: layout.walls.length,
    openingCount: layout.openings.length,
    rects,
  });
  return rects;
}
