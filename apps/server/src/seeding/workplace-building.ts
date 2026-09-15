import type { Floor, FloorLayout, RoomTemplate } from "@workhard/shared";
import { LayoutPlan } from "../world/layout-plan.js";
import { furnishGroundFloor, furnishUpperFloor } from "./workplace-furniture.js";
import { createMakerStudios } from "./workplace-makers.js";
import { furnishSocialSpaces } from "./workplace-social.js";

const open = { mode: "open", assignedPersonIds: [], knockable: false } as const;
const noBuild = { mode: "default", assignedPersonIds: [] } as const;

export function createWorkplaceBuilding(): { floors: Floor[]; layouts: FloorLayout[] } {
  const floors: Floor[] = [
    { id: "floor-workplace", officeId: "office", name: "Studios & Commons", level: 1,
      width: 2048, height: 1408, spawn: { x: 896, y: 576 }, background: "#e5ded3" },
    { id: "floor-retreat", officeId: "office", name: "Library & Leadership", level: 2,
      width: 2048, height: 1408, spawn: { x: 896, y: 576 }, background: "#e5ded3" },
    { id: "floor-makers", officeId: "office", name: "Maker Studios", level: 3,
      width: 2048, height: 1408, spawn: { x: 896, y: 576 }, background: "#e5ded3" },
  ];
  const layouts = floors.map((floor) => {
    const plan = new LayoutPlan(floor);
    buildShell(plan);
    if (floor.level === 3) return createMakerStudios(plan);
    const upper = floor.level === 2;
    const rooms = roomTemplates(upper);
    const surfaces = upper
      ? [["parquet", "herringbone"], ["laminate", "ash"], ["linoleum", "marbled"],
        ["resin", "pearl"], ["sisal", "ribbed"], ["bamboo", "natural"]]
      : [["concrete", "smooth"], ["cork", "natural"], ["carpet", "tiles"],
        ["ceramic", "ivory"], ["wood", "oak"], ["rubber", "crumb"]];
    for (const [index, [material, variant]] of surfaces.entries()) {
      const x = 128 + index % 3 * 512;
      const y = index < 3 ? 128 : 640;
      if (upper && index >= 3) {
        const accent = [["pvc", "safety"], ["jute", "basket"], ["vinyl", "speckle"]][index - 3]!;
        plan.flooring(`floor-${index}`, `floor-${material}`, variant!, x, y, 512, 256);
        plan.flooring(`floor-${index}-nook`, `floor-${accent[0]}`, accent[1]!, x, y + 256, 512, 128);
      } else {
        plan.flooring(`floor-${index}`, `floor-${material}`, variant!, x, y, 512, 384);
      }
    }
    plan.flooring("gallery-floor", upper ? "floor-stone-tiles" : "floor-terrazzo", upper ? "limestone" : "fine", 128, 512, 1536, 128);
    plan.object("stairs", "infrastructure-portal", 1536, 544, "amber").label = upper ? "1" : "2";
    if (upper) {
      plan.object("stairs-makers", "infrastructure-portal", 1376, 544, "blue").label = "3";
      plan.flooring("balcony", "floor-decking", "cedar", 640, 1024, 512, 256);
      plan.flooring("balcony-lawn", "floor-artificial-grass", "soft", 128, 1056, 448, 192);
      furnishUpperFloor(plan);
    } else {
      landscape(plan);
      furnishGroundFloor(plan);
    }
    furnishSocialSpaces(plan);
    return plan.finish(rooms);
  });
  return { floors, layouts };
}

function buildShell(plan: LayoutPlan): void {
  plan.wall("north", 128, 128, 1664, 128);
  plan.wall("east", 1664, 128, 1664, 1024);
  plan.wall("south", 128, 1024, 1664, 1024);
  plan.wall("west", 128, 128, 128, 1024);
  plan.wall("gallery-north", 128, 512, 1664, 512);
  plan.wall("gallery-south", 128, 640, 1664, 640);
  for (const x of [640, 1152]) {
    plan.wall(`partition-${x}-north`, x, 128, x, 512);
    plan.wall(`partition-${x}-south`, x, 640, x, 1024);
  }
  for (const offset of [224, 736, 1248]) {
    plan.opening("gallery-north", offset, "door");
    plan.opening("gallery-south", offset, "door");
  }
  plan.opening("south", 736, "door");
  plan.opening("south", 224, "door");
  plan.opening("east", 416, "door");
  plan.opening("west", 416, "door");
  for (const offset of [96, 320, 608, 832, 1120, 1344]) {
    plan.opening("north", offset, "window");
    plan.opening("south", offset, "window");
  }
  for (const side of ["west", "east"]) {
    plan.opening(side, 160, "window");
    plan.opening(side, 672, "window");
  }
}

function roomTemplates(upper: boolean): RoomTemplate[] {
  const definitions = upper
    ? [["leadership", "Rowan's Office", "#e2d3be"], ["delivery", "Imani's Office", "#d2dfdf"], ["product", "Lucia's Office", "#e5d9da"],
      ["workshop", "Workshop", "#d6e2e0"], ["library", "Library", "#ded6c4"], ["tea", "Tea Room", "#d9e1cb"]]
    : [["engineering", "Engineering Studio", "#dce4de"], ["design", "Design Atelier", "#e9ddc9"], ["juniper", "Juniper", "#d7e0e9"],
      ["cafe", "Café", "#ebe0cf"], ["commons", "Commons", "#e8ddce"], ["games", "Games Room", "#ded9e8"]];
  const rooms = definitions.map<RoomTemplate>(([id, name, color], index) => ({
    id: `room-${id}`, name: name!, color: color!, capacity: upper && index < 3 ? 4 : index === 2 ? 6 : 10,
    anchor: { x: 384 + index % 3 * 512, y: index < 3 ? 464 : 688 },
    access: { ...open, assignedPersonIds: [] }, build: { ...noBuild, assignedPersonIds: [] },
  }));
  rooms.push({ id: upper ? "room-upper-gallery" : "room-gallery", name: "Gallery", color: "#e8e3da", capacity: 20,
    anchor: { x: 896, y: 576 }, access: { ...open, assignedPersonIds: [] }, build: { ...noBuild, assignedPersonIds: [] } });
  if (upper) {
    for (const [index, userId, unitId] of [[0, "rowan", undefined], [1, "imani", "engineering"], [2, "lucia", "product"]] as const) {
      const room = rooms[index]!;
      room.access = { mode: "assigned", assignedPersonIds: [`person-${userId}`], knockable: true };
      room.build = { mode: "assigned", assignedPersonIds: [`person-${userId}`] };
      if (unitId) room.organisationUnitId = `unit-${unitId}`;
    }
    rooms[3]!.organisationUnitId = "unit-platform";
    rooms[3]!.build = { mode: "assigned", assignedPersonIds: [], unitGrants: [{ unitId: "unit-engineering", rank: "leads", descendants: true }] };
  } else {
    for (const [index, unitId] of [[0, "engineering"], [1, "product"]] as const) {
      rooms[index]!.organisationUnitId = `unit-${unitId}`;
      rooms[index]!.build = { mode: "assigned", assignedPersonIds: [], unitGrants: [{ unitId: `unit-${unitId}`, rank: "members", descendants: true }] };
    }
  }
  return rooms;
}

function landscape(plan: LayoutPlan): void {
  plan.flooring("terrace", "floor-decking", "cedar", 640, 1024, 512, 256);
  plan.flooring("cafe-patio", "floor-brick", "herringbone", 128, 1024, 448, 192);
  plan.flooring("front-walk", "floor-pavers", "ash", 832, 1280, 128, 128);
  plan.flooring("front-lawn", "floor-grass", "lawn", 1216, 1056, 640, 256);
  plan.flooring("east-garden", "floor-gravel", "pea", 1728, 128, 256, 384);
  plan.flooring("east-walk", "floor-stone", "flagstone", 1664, 512, 320, 128);
  plan.flooring("pool-lawn", "floor-grass", "lawn", 1728, 704, 256, 256);
  plan.object("pool", "outdoor-pool", 1760, 752, "coastal");
  plan.object("koi", "outdoor-koi-pond", 1792, 192, "sand");
  plan.object("fountain", "outdoor-fountain", 1296, 1136, "sand");
  plan.object("garden-bed", "outdoor-garden-bed", 1584, 1184, "sage");
  plan.object("topiary", "outdoor-topiary", 1824, 1184, "forest");
  plan.object("garden-bench", "outdoor-bench", 1424, 1248, "white");
  plan.object("garden-lantern", "outdoor-lantern", 1216, 1248, "sand");
  plan.object("stone-lantern", "light-stone-lantern", 1744, 384, "matcha");
  plan.object("bamboo", "plant-bamboo", 1920, 368, "matcha");
  plan.object("wind-chimes", "decor-wind-chimes", 1904, 464, "matcha");
  plan.object("picnic-table", "table-picnic", 688, 1120, "oak");
  plan.object("picnic-seat-a", "outdoor-bench", 704, 1072, "white");
  plan.object("picnic-seat-b", "outdoor-bench", 704, 1200, "white", 180);
  plan.object("patio-table", "table-cafe", 416, 1104, "white");
  plan.object("patio-chair", "chair-dining", 496, 1120, "white", 270);
  plan.object("terrace-planter", "plant-planter-row", 1056, 1136, "sage");
}
