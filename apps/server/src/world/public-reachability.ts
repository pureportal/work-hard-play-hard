import {
  circleIntersectsRect, getAssetDefinition, getOutdoorBounds, getPlacedAssetBounds, getSpawnPlacementError,
  type Floor, type FloorLayout, type GameSettings, type Position,
} from "@workhard/shared";
import { findPath } from "./pathfinding.js";

const verifiedLayouts = new Set<string>();

export function assertPublicReachability(floor: Floor, source: FloorLayout, settings: GameSettings): void {
  const key = JSON.stringify({
    bounds: [floor.width, floor.height], spawn: floor.spawn, access: settings.roomAccess.mode,
    walls: source.walls, openings: source.openings,
    objects: source.objects.map(({ assetId, x, y, rotation, ownerUserId }) => ({ assetId, x, y, rotation, ownerUserId })),
    rooms: source.rooms.map(({ footprint, access, ownerUserId, personalAreas }) => ({ footprint, access: access.mode, ownerUserId, personalAreas })),
  });
  if (verifiedLayouts.has(key)) return;
  const layout = publicNavigationLayout(source, settings);
  const bounds = getOutdoorBounds(floor);
  const spawnError = getSpawnPlacementError(layout, bounds, floor.spawn);
  if (spawnError) throw new Error(spawnError);
  const publicRooms = new Set(layout.rooms.filter((room) => room.access.mode === "open").map((room) => room.id));
  const reachable = (start: Position, destination: Position): boolean => {
    if (Math.hypot(start.x - destination.x, start.y - destination.y) < 0.01) return true;
    const end = findPath(layout, bounds, "", start, destination, publicRooms).at(-1);
    return !!end && Math.hypot(end.x - destination.x, end.y - destination.y) < 0.01;
  };
  const outside = publicExteriorPositions(floor);
  if (!outside.some((position) => !getSpawnPlacementError(layout, bounds, position) && reachable(floor.spawn, position))) {
    throw new Error("SPAWN_UNREACHABLE");
  }
  for (const object of layout.objects) {
    if (getAssetDefinition(object.assetId)?.kind !== "portal") continue;
    const rect = getPlacedAssetBounds(object);
    const position = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    if (object.ownerUserId || layout.rooms.some((room) =>
      (room.access.mode !== "open" || room.ownerUserId || room.personalAreas?.length)
      && room.footprint.some((area) => rect.x < area.x + area.width && rect.x + rect.width > area.x
        && rect.y < area.y + area.height && rect.y + rect.height > area.y))) {
      throw new Error("TELEPORTER_PUBLIC_ONLY");
    }
    if (getSpawnPlacementError(layout, bounds, position) || !reachable(position, floor.spawn)) {
      throw new Error("TELEPORTER_UNREACHABLE");
    }
  }
  if (verifiedLayouts.size >= 64) verifiedLayouts.delete(verifiedLayouts.values().next().value!);
  verifiedLayouts.add(key);
}

export function findRescuePosition(floor: Floor, source: FloorLayout, settings: GameSettings): Position | undefined {
  const layout = publicNavigationLayout(source, settings);
  const bounds = getOutdoorBounds(floor);
  const exterior = publicExteriorPositions(floor).find((position) =>
    !getSpawnPlacementError(layout, bounds, position, [], settings.roomAccess.mode)
    && !layout.rooms.some((room) => room.footprint.some((rect) => circleIntersectsRect(position.x, position.y, 13, rect))));
  const publicRooms = new Set(layout.rooms.filter((room) => !room.ownerUserId && !room.personalAreas?.length
    && (room.access.mode === "open" || room.access.mode === "default" && settings.roomAccess.mode === "open")).map((room) => room.id));
  if (!getSpawnPlacementError(layout, bounds, floor.spawn, [], settings.roomAccess.mode)
    && !layout.rooms.some((room) => !publicRooms.has(room.id)
      && room.footprint.some((rect) => circleIntersectsRect(floor.spawn.x, floor.spawn.y, 13, rect)))) {
    if (!exterior) return floor.spawn;
    const end = findPath(layout, bounds, "", floor.spawn, exterior, publicRooms).at(-1) ?? floor.spawn;
    if (Math.hypot(end.x - exterior.x, end.y - exterior.y) < 0.01) return floor.spawn;
  }
  return exterior;
}

function publicNavigationLayout(source: FloorLayout, settings: GameSettings): FloorLayout {
  return { ...source, rooms: source.rooms.map((room) => ({
    ...room, access: { ...room.access, mode: room.ownerUserId || room.personalAreas?.length ? "none"
      : room.access.mode === "default" ? settings.roomAccess.mode : room.access.mode },
  })) };
}

function publicExteriorPositions(floor: Floor): Position[] {
  const bounds = getOutdoorBounds(floor);
  return [
    { x: bounds.x + 32, y: bounds.y + 32 },
    { x: bounds.x + bounds.width - 32, y: bounds.y + 32 },
    { x: bounds.x + 32, y: bounds.y + bounds.height - 32 },
    { x: bounds.x + bounds.width - 32, y: bounds.y + bounds.height - 32 },
  ];
}

export function assertTeleportersRetained(previous: FloorLayout, next: FloorLayout): void {
  for (const object of previous.objects) {
    if (getAssetDefinition(object.assetId)?.kind !== "portal") continue;
    const retained = next.objects.find((candidate) => candidate.id === object.id);
    if (!retained || retained.assetId !== object.assetId || retained.label !== object.label) {
      throw new Error("TELEPORTER_PERMANENT");
    }
  }
}
