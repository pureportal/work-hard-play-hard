import type { Floor, FloorLayout } from "@workhard/shared";
import { LayoutPlan } from "./layout-plan.js";

export function createStartingHouse(): { floor: Floor; layout: FloorLayout } {
  const floor: Floor = {
    id: "floor-main", officeId: "office", name: "Floor 1", level: 1,
    width: 1792, height: 1088, spawn: { x: 832, y: 736 }, background: "#e5ded3",
  };
  const plan = new LayoutPlan(floor);
  plan.wall("north", 512, 256, 1280, 256);
  plan.wall("east", 1280, 256, 1280, 768);
  plan.wall("kitchen-south", 960, 768, 1280, 768);
  plan.wall("south", 512, 832, 960, 832);
  plan.wall("west", 512, 256, 512, 832);
  plan.wall("partition", 960, 256, 960, 832);
  plan.wall("kitchen-north", 960, 576, 1280, 576);
  plan.wall("meeting-south", 512, 576, 960, 576);
  plan.opening("meeting-south", 288, "door");
  plan.opening("south", 288, "door");
  plan.opening("partition", 224, "door");
  plan.opening("partition", 384, "door");
  plan.opening("north", 96, "window");
  plan.opening("north", 608, "window");
  plan.opening("west", 128, "window");
  plan.opening("west", 384, "window");
  plan.opening("east", 160, "window");
  plan.opening("east", 384, "window");
  plan.opening("south", 64, "window");

  plan.flooring("lounge-floor", "floor-parquet", "herringbone", 512, 256, 448, 576);
  plan.flooring("studio-floor", "floor-wood", "oak", 960, 256, 320, 320);
  plan.flooring("kitchen-floor", "floor-ceramic", "ivory", 960, 576, 320, 192);
  plan.flooring("patio-floor", "floor-decking", "cedar", 768, 832, 384, 192);
  plan.object("patio-bench", "outdoor-bench", 992, 864, "white");
  plan.object("patio-lantern", "outdoor-lantern", 944, 864, "sand");
  plan.object("patio-plant", "plant-sakura", 1104, 864, "sakura");

  plan.object("bookshelf", "equipment-bookshelf", 784, 304, "white");
  plan.object("lounge-plant", "plant-floor", 896, 304, "sage");
  plan.object("meeting-whiteboard", "equipment-whiteboard", 544, 320, "white");
  plan.object("round-table", "table-round", 688, 384, "oak");
  plan.object("table-chair-north", "chair-dining", 704, 320, "white");
  plan.object("table-chair-south", "chair-dining", 704, 496, "white", 180);
  plan.object("table-chair-west", "chair-dining", 624, 400, "white", 270);
  plan.object("table-chair-east", "chair-dining", 800, 400, "white", 90);
  plan.object("lounge-rug", "rug-kilim", 576, 656, "oak");
  plan.object("sofa", "sofa-straight", 576, 608, "blue");
  plan.object("coffee-table", "table-coffee", 592, 672, "oak");
  plan.object("coffee-table-books", "decor-books", 608, 672, "ivory");
  plan.object("armchair", "chair-lounge", 736, 672, "blue", 90);
  plan.object("side-table", "table-side", 704, 608, "oak");
  plan.object("table-lamp", "decor-lamp", 704, 608, "ivory");
  plan.object("entry-plant", "plant-floor", 896, 608, "sage");
  plan.object("falling-blocks", "equipment-falling-blocks", 848, 688, "violet");
  plan.object("chess", "equipment-chess", 560, 720, "white");

  plan.object("studio-bookshelf", "equipment-bookshelf", 1168, 528, "white");
  plan.object("studio-plant", "plant-floor", 1232, 480, "sage");
  plan.object("studio-north-plant", "plant-floor", 1072, 288, "forest");

  plan.object("coffee-bar", "breakroom-coffee-bar", 1024, 672, "mint");
  plan.object("sink", "breakroom-sink", 1136, 672, "mint");
  plan.object("fridge", "breakroom-fridge", 1216, 656, "cream");
  plan.object("fortune-dispenser", "special-fortune", 1056, 592, "mint");

  const layout = plan.finish([
    { id: "room-meeting", anchor: { x: 832, y: 480 }, name: "Meeting room", color: "#e9e1d3", capacity: 4, meetingRoom: true,
      access: { mode: "open", assignedPersonIds: [], knockable: false },
      build: { mode: "default", assignedPersonIds: [] } },
    { id: "room-main", anchor: { x: 832, y: 736 }, name: "Lounge", color: "#e9e1d3", capacity: 12,
      access: { mode: "open", assignedPersonIds: [], knockable: false },
      build: { mode: "default", assignedPersonIds: [] } },
    { id: "room-studio", anchor: { x: 1120, y: 480 }, name: "Studio", color: "#dce7df", capacity: 6,
      access: { mode: "open", assignedPersonIds: [], knockable: false },
      build: { mode: "default", assignedPersonIds: [] } },
    { id: "room-kitchen", anchor: { x: 1120, y: 704 }, name: "Kitchen", color: "#eee7d9", capacity: 4,
      access: { mode: "open", assignedPersonIds: [], knockable: false },
      build: { mode: "default", assignedPersonIds: [] } },
  ]);
  return { floor, layout };
}
