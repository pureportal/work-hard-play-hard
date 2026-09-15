import type { Floor, FloorLayout } from "@workhard/shared";
import { LayoutPlan } from "./layout-plan.js";

export function createStartingHouse(): { floor: Floor; layout: FloorLayout } {
  const floor: Floor = {
    id: "floor-main", officeId: "office", name: "Floor 1", level: 1,
    width: 1792, height: 1088, spawn: { x: 896, y: 608 }, background: "#e5ded3",
  };
  const plan = new LayoutPlan(floor);
  plan.wall("north", 576, 288, 1216, 288);
  plan.wall("east", 1216, 288, 1216, 736);
  plan.wall("south", 576, 736, 1216, 736);
  plan.wall("west", 576, 288, 576, 736);
  plan.opening("south", 288, "door");
  plan.opening("north", 96, "window");
  plan.opening("north", 448, "window");
  plan.opening("west", 160, "window");
  plan.opening("east", 160, "window");
  plan.flooring("terrace", "floor-decking", "cedar", 768, 736, 256, 128);
  plan.object("bench", "outdoor-bench", 784, 816, "white");
  plan.object("garden", "outdoor-garden-bed", 1056, 768, "sage");
  plan.object("entry-plant", "plant-floor", 1152, 320, "sage");
  const layout = plan.finish([{
    id: "room-main", anchor: { x: 896, y: 512 }, name: "Studio", color: "#e9e1d3", capacity: 12,
    access: { mode: "open", assignedPersonIds: [], knockable: false },
    build: { mode: "default", assignedPersonIds: [] },
  }]);
  return { floor, layout };
}
