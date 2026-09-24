import { getAssetPlacementError } from "./asset-placement.js";
import { getOutdoorBounds, getOpeningRect, type FloorLayout, type WallOpening } from "./building.js";
import { getWallPlacementError } from "./layout-placement.js";
import { rectanglesOverlap } from "./geometry.js";
import { detectLayoutRooms } from "./room-detection.js";
import type { BuildProject } from "./public-economy.js";

export interface ProjectLayoutConflict {
  kind: "object" | "wall" | "opening" | "layout";
  id: string;
  reason: "overlap" | "changed" | "placement";
}

export function rebaseProjectLayout(project: BuildProject, current: FloorLayout, floor: { width: number; height: number }): {
  layout: FloorLayout;
  conflicts: ProjectLayoutConflict[];
} {
  if (project.floorId !== current.floorId || !project.baseLayout) {
    return { layout: current, conflicts: [{ kind: "layout", id: project.floorId, reason: "changed" }] };
  }
  const base = project.baseLayout;
  const conflicts: ProjectLayoutConflict[] = [];
  const changed = { objects: new Set<string>(), walls: new Set<string>(), openings: new Set<string>() };
  const merge = <T extends { id: string }>(kind: "object" | "wall" | "opening", before: T[], proposed: T[], existing: T[]): T[] => {
    const previous = new Map(before.map((item) => [item.id, item]));
    const next = new Map(proposed.map((item) => [item.id, item]));
    const merged = new Map(existing.map((item) => [item.id, item]));
    for (const id of new Set([...previous.keys(), ...next.keys()])) {
      const original = previous.get(id);
      const draft = next.get(id);
      if (JSON.stringify(original) === JSON.stringify(draft)) continue;
      changed[`${kind}s`].add(id);
      const latest = merged.get(id);
      if (JSON.stringify(latest) !== JSON.stringify(original) && JSON.stringify(latest) !== JSON.stringify(draft)) {
        conflicts.push({ kind, id, reason: "changed" });
      }
      if (draft) merged.set(id, draft);
      else merged.delete(id);
    }
    return [...merged.values()];
  };
  const walls = merge("wall", base.walls, project.layout.walls, current.walls);
  const openings = merge("opening", base.openings, project.layout.openings, current.openings);
  const objects = merge("object", base.objects, project.layout.objects, current.objects);
  const tiles = new Map(current.tiles.map((tile) => [tile.id, tile]));
  const baseTiles = new Map(base.tiles.map((tile) => [tile.id, tile]));
  for (const tile of project.layout.tiles) {
    if (JSON.stringify(tile) !== JSON.stringify(baseTiles.get(tile.id))) tiles.set(tile.id, tile);
    baseTiles.delete(tile.id);
  }
  for (const id of baseTiles.keys()) tiles.delete(id);
  let layout: FloorLayout = { ...current, walls, openings, objects, tiles: [...tiles.values()], revision: current.revision + 1 };
  const bounds = getOutdoorBounds(floor);
  for (const object of objects) {
    if (!changed.objects.has(object.id)) continue;
    const error = getAssetPlacementError(layout, bounds, object);
    if (error) conflicts.push({ kind: "object", id: object.id, reason: error === "ASSET_BLOCKED" ? "overlap" : "placement" });
  }
  for (const wall of walls) {
    if (!changed.walls.has(wall.id)) continue;
    const error = getWallPlacementError(layout, bounds, wall, new Set([wall.id]));
    if (error) conflicts.push({ kind: "wall", id: wall.id, reason: error === "SPACE_OCCUPIED" || error === "WALL_OVERLAP" ? "overlap" : "placement" });
  }
  for (const opening of openings) {
    if (!changed.openings.has(opening.id)) continue;
    const wall = walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) conflicts.push({ kind: "opening", id: opening.id, reason: "changed" });
    else if (openings.some((other) => opening.id !== other.id && openingsOverlap(walls, opening, other)))
      conflicts.push({ kind: "opening", id: opening.id, reason: "overlap" });
  }
  if (changed.walls.size || changed.openings.size) layout = detectLayoutRooms(layout, floor);
  return { layout, conflicts: [...new Map(conflicts.map((conflict) => [`${conflict.kind}:${conflict.id}`, conflict])).values()] };
}

function openingsOverlap(walls: FloorLayout["walls"], first: WallOpening, second: WallOpening): boolean {
  const firstWall = walls.find((wall) => wall.id === first.wallId);
  const secondWall = walls.find((wall) => wall.id === second.wallId);
  return Boolean(firstWall && secondWall && rectanglesOverlap(getOpeningRect(firstWall, first), getOpeningRect(secondWall, second)));
}
