import {
  detectLayoutRooms,
  type Floor,
  type FloorLayout,
  type RoomTemplate,
  type Wall,
  type WallOpening,
  type WorldObject,
} from "@workhard/shared";

const studioWalls: Wall[] = [
  wall("wall-studio-top", 64, 64, 1536, 64),
  wall("wall-studio-right", 1536, 64, 1536, 928),
  wall("wall-studio-bottom", 64, 928, 1536, 928),
  wall("wall-studio-left", 64, 64, 64, 928),
  wall("wall-studio-row", 64, 448, 1536, 448),
  wall("wall-studio-top-left-divider", 544, 64, 544, 448),
  wall("wall-studio-top-right-divider", 960, 64, 960, 448),
  wall("wall-studio-lower-divider", 960, 448, 960, 928),
];

const studioOpenings: WallOpening[] = [
  door("door-studio-entry", "wall-studio-bottom", 672),
  door("door-studio-garden", "wall-studio-bottom", 1104),
  door("door-commons", "wall-studio-row", 160),
  door("door-daily", "wall-studio-row", 624),
  door("door-focus", "wall-studio-row", 1120),
  door("door-product-arcade", "wall-studio-lower-divider", 192),
  windowOpening("window-commons-north", "wall-studio-top", 128),
  windowOpening("window-commons-north-east", "wall-studio-top", 336),
  windowOpening("window-daily-north", "wall-studio-top", 608),
  windowOpening("window-focus-north-west", "wall-studio-top", 1008),
  windowOpening("window-focus-north-east", "wall-studio-top", 1328),
  windowOpening("window-commons-west", "wall-studio-left", 160),
  windowOpening("window-product-west", "wall-studio-left", 576),
  windowOpening("window-focus-east", "wall-studio-right", 160),
  windowOpening("window-arcade-east", "wall-studio-right", 576),
  windowOpening("window-product-south-west", "wall-studio-bottom", 160),
  windowOpening("window-product-south-east", "wall-studio-bottom", 400),
  windowOpening("window-arcade-south-west", "wall-studio-bottom", 960),
  windowOpening("window-arcade-south-east", "wall-studio-bottom", 1200),
];

const studioRooms: RoomTemplate[] = [
  room("room-commons", 300, 250, "Commons", "#e9d2c1", 8),
  room("room-daily", 740, 250, "Daily Room", "#ccd9e9", 8),
  room("room-focus", 1200, 250, "Focus Suite", "#d9d1e8", 5, ["user-priya", "user-maya"]),
  room("room-product", 400, 650, "Product Studio", "#cbded4", 12),
  room("room-arcade", 1200, 650, "Arcade", "#e3d2df", 8),
];

const rooftopWalls: Wall[] = [
  wall("wall-rooftop-top", 64, 64, 1216, 64),
  wall("wall-rooftop-right", 1216, 64, 1216, 736),
  wall("wall-rooftop-bottom", 64, 736, 1216, 736),
  wall("wall-rooftop-left", 64, 64, 64, 736),
  wall("wall-rooftop-main-divider", 672, 64, 672, 736),
  wall("wall-rooftop-row", 672, 416, 1216, 416),
  wall("wall-rooftop-lower-divider", 960, 416, 960, 736),
];

const rooftopOpenings: WallOpening[] = [
  door("door-rooftop-entry", "wall-rooftop-bottom", 512),
  door("door-rooftop-garden", "wall-rooftop-right", 560),
  door("door-garden-workshop", "wall-rooftop-main-divider", 160),
  door("door-workshop-quiet", "wall-rooftop-row", 96),
  door("door-workshop-cafe", "wall-rooftop-row", 352),
  door("door-quiet-cafe", "wall-rooftop-lower-divider", 128),
  windowOpening("window-garden-north", "wall-rooftop-top", 160),
  windowOpening("window-garden-north-east", "wall-rooftop-top", 400),
  windowOpening("window-workshop-north", "wall-rooftop-top", 768),
  windowOpening("window-workshop-north-east", "wall-rooftop-top", 1008),
  windowOpening("window-garden-west-north", "wall-rooftop-left", 128),
  windowOpening("window-garden-west-south", "wall-rooftop-left", 480),
  windowOpening("window-workshop-east", "wall-rooftop-right", 160),
  windowOpening("window-cafe-east", "wall-rooftop-right", 448),
  windowOpening("window-garden-south-west", "wall-rooftop-bottom", 128),
  windowOpening("window-garden-south-east", "wall-rooftop-bottom", 352),
  windowOpening("window-quiet-south", "wall-rooftop-bottom", 704),
  windowOpening("window-cafe-south", "wall-rooftop-bottom", 1008),
];

const rooftopRooms: RoomTemplate[] = [
  room("room-garden", 300, 300, "Garden", "#c7dcc7", 10),
  room("room-workshop", 900, 250, "Workshop", "#e7d6ba", 10),
  room("room-quiet", 800, 560, "Quiet Corner", "#d0d8e8", 4, ["user-aisha", "user-noah"]),
  room("room-cafe", 1080, 560, "Cafe", "#e5d5c8", 6),
];

const layoutDefinitions = [
  { floorId: "floor-studio", walls: studioWalls, openings: studioOpenings, rooms: studioRooms },
  { floorId: "floor-rooftop", walls: rooftopWalls, openings: rooftopOpenings, rooms: rooftopRooms },
] satisfies SeedLayoutDefinition[];

interface SeedLayoutDefinition {
  floorId: string;
  walls: Wall[];
  openings: WallOpening[];
  rooms: RoomTemplate[];
}

export function createSeedLayouts(floors: Floor[], objects: WorldObject[]): FloorLayout[] {
  return floors.map((floor) => {
    const definition = layoutDefinitions.find((candidate) => candidate.floorId === floor.id);
    if (!definition) {
      throw new Error(`Missing seeded layout ${floor.id}`);
    }
    return createLayout(
      floor,
      definition.walls,
      definition.openings,
      objects.filter((object) => object.floorId === floor.id),
      definition.rooms,
    );
  });
}

function createLayout(
  floor: Floor,
  walls: Wall[],
  openings: WallOpening[],
  objects: WorldObject[],
  templates: RoomTemplate[],
): FloorLayout {
  return detectLayoutRooms({
    floorId: floor.id,
    revision: 1,
    walls,
    openings,
    tiles: [],
    objects,
    rooms: [],
  }, floor, templates);
}

function wall(id: string, startX: number, startY: number, endX: number, endY: number): Wall {
  return { id, start: { x: startX, y: startY }, end: { x: endX, y: endY } };
}

function door(id: string, wallId: string, offset: number): WallOpening {
  return { id, wallId, offset, width: 64, type: "door" };
}

function windowOpening(id: string, wallId: string, offset: number): WallOpening {
  return {
    id,
    wallId,
    offset,
    width: 96,
    type: "window",
    light: { color: "#fff4cf", intensity: 0.2, depth: 112 },
  };
}

function room(
  id: string,
  x: number,
  y: number,
  name: string,
  color: string,
  capacity: number,
  assignedPersonIds: string[] = [],
): RoomTemplate {
  const assigned = assignedPersonIds.length > 0;
  return {
    id,
    anchor: { x, y },
    name,
    color,
    capacity,
    access: {
      mode: assigned ? "assigned" : "open",
      assignedPersonIds,
      knockable: assigned,
    },
  };
}
