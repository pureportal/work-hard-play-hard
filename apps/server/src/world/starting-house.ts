import type { Floor, FloorLayout } from "@workhard/shared";
import { LayoutPlan } from "./layout-plan.js";

export function createStartingHouse(): { floor: Floor; layout: FloorLayout } {
  const floor: Floor = {
    id: "floor-main", officeId: "office", name: "Floor 1", level: 1,
    width: 1792, height: 1088, spawn: { x: 896, y: 784 }, background: "#e5ded3",
  };
  const plan = new LayoutPlan(floor);
  plan.wall("north", 512, 256, 1280, 256);
  plan.wall("east", 1280, 256, 1280, 768);
  plan.wall("kitchen-south", 960, 768, 1280, 768);
  plan.wall("south", 512, 832, 960, 832);
  plan.wall("west", 512, 256, 512, 832);
  plan.wall("partition", 960, 256, 960, 832);
  plan.wall("kitchen-north", 960, 576, 1280, 576);
  plan.wall("meeting-south", 512, 512, 960, 512);
  plan.opening("meeting-south", 288, "door");
  plan.opening("south", 288, "door");
  plan.opening("partition", 160, "door");
  plan.opening("partition", 384, "door");
  plan.opening("north", 96, "window");
  plan.opening("north", 608, "window");
  plan.opening("west", 128, "window");
  plan.opening("west", 384, "window");
  plan.opening("east", 160, "window");
  plan.opening("east", 384, "window");
  plan.opening("south", 64, "window");

  plan.flooring("meeting-floor", "floor-carpet", "plush", 512, 256, 448, 256);
  plan.flooring("lounge-floor", "floor-wood", "walnut", 512, 512, 448, 320);
  plan.flooring("studio-floor", "floor-wood", "washed", 960, 256, 320, 320);
  plan.flooring("kitchen-floor", "floor-ceramic", "ivory", 960, 576, 320, 192);
  plan.flooring("patio-floor", "floor-decking", "cedar", 768, 832, 384, 128);
  plan.object("patio-doormat", "rug-coir", 800, 848, "oak");
  plan.object("patio-bench", "outdoor-bench", 992, 880, "white");
  plan.object("patio-lantern", "outdoor-lantern", 944, 896, "sand");
  plan.object("patio-plant", "plant-sakura", 1104, 880, "sakura");

  plan.object("bookshelf", "equipment-bookshelf", 848, 320, "white");
  plan.object("meeting-plant", "plant-floor", 560, 448, "sage");
  plan.object("meeting-whiteboard", "equipment-whiteboard", 672, 304, "white");
  plan.object("round-table", "table-round", 704, 384, "oak");
  plan.object("table-chair-north", "chair-dining", 736, 336, "white");
  plan.object("table-chair-south", "chair-dining", 736, 464, "white", 180);
  plan.object("table-chair-west", "chair-dining", 656, 400, "white", 270);
  plan.object("table-chair-east", "chair-dining", 800, 400, "white", 90);
  plan.object("lounge-rug", "rug-kilim", 608, 608, "white");
  plan.object("sofa", "sofa-straight", 608, 576, "blue");
  plan.object("coffee-table", "table-coffee", 624, 640, "oak");
  plan.object("coffee-table-books", "decor-books", 640, 640, "ivory");
  plan.object("armchair", "chair-lounge", 752, 608, "blue", 90);
  plan.object("side-table", "table-side", 736, 576, "oak");
  plan.object("table-lamp", "decor-lamp", 736, 576, "ivory");
  plan.object("entry-plant", "plant-floor", 896, 560, "sage");
  plan.object("falling-blocks", "equipment-falling-blocks", 704, 704, "white");
  plan.object("chess", "equipment-chess", 560, 720, "white");

  plan.object("studio-bookshelf", "equipment-bookshelf", 1168, 320, "white");
  plan.object("studio-plant", "plant-floor", 1232, 528, "sage");
  plan.object("studio-north-plant", "plant-floor", 1056, 304, "forest");

  plan.object("coffee-bar", "breakroom-coffee-bar", 1024, 704, "mint");
  plan.object("sink", "breakroom-sink", 1120, 704, "mint");
  plan.object("fridge", "breakroom-fridge", 1184, 704, "cream");
  plan.object("fortune-dispenser", "special-fortune", 1056, 624, "mint");

  const layout = plan.finish([
    { id: "room-meeting", anchor: { x: 832, y: 448 }, name: "Meeting room", color: "#b394a0", capacity: 4, meetingRoom: true,
      access: { mode: "open", assignedPersonIds: [], knockable: false },
      build: { mode: "default", assignedPersonIds: [] } },
    { id: "room-main", anchor: { x: 896, y: 784 }, name: "Lounge", color: "#987961", capacity: 12,
      access: { mode: "open", assignedPersonIds: [], knockable: false },
      build: { mode: "default", assignedPersonIds: [] } },
    { id: "room-studio", anchor: { x: 1120, y: 480 }, name: "Studio", color: "#cbc3b2", capacity: 6,
      access: { mode: "open", assignedPersonIds: [], knockable: false },
      build: { mode: "default", assignedPersonIds: [] } },
    { id: "room-kitchen", anchor: { x: 1120, y: 704 }, name: "Kitchen", color: "#eee7d9", capacity: 4,
      access: { mode: "open", assignedPersonIds: [], knockable: false },
      build: { mode: "default", assignedPersonIds: [] } },
  ]);
  return { floor, layout };
}
