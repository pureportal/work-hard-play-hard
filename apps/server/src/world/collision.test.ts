import { circleIntersectsRect, getAssetCollisionRects, getWallSolidRects, type FloorLayout } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { createTestData } from "../testing/workspace-data.js";
import { WorkspaceStore } from "../store.js";
import { canOccupy } from "./collision.js";

describe("world collision index", () => {
  it("matches every seeded collider across cell boundaries and radii", () => {
    const store = new WorkspaceStore(createTestData());
    const floor = store.getFloor("floor-studio")!;
    const layout = { ...store.getLayout(floor.id)!, rooms: [] };
    const colliders = [
      ...layout.walls.flatMap((wall) => getWallSolidRects(wall, layout.openings)),
      ...getAssetCollisionRects(layout),
    ];
    for (const radius of [0, 13, 31, 64]) {
      for (let index = 0; index < 800; index++) {
        const x = (index * 173) % (floor.width + 192) - 96;
        const y = (index * 239) % (floor.height + 192) - 96;
        const withinFloor = x - radius >= 0 && y - radius >= 0
          && x + radius <= floor.width && y + radius <= floor.height;
        const expected = withinFloor && !colliders.some((rect) => circleIntersectsRect(x, y, radius, rect));
        expect(canOccupy(layout, floor, "user-maya", x, y, x, y, radius)).toBe(expected);
      }
    }
  });

  it("rebuilds the lookup when the layout revision changes", () => {
    const layout: FloorLayout = { floorId: "floor", revision: 1, tiles: [], openings: [], rooms: [], objects: [], walls: [] };
    const floor = { width: 256, height: 256 };
    expect(canOccupy(layout, floor, "user", 32, 32, 128, 128)).toBe(true);
    layout.walls.push({ id: "wall", start: { x: 112, y: 96 }, end: { x: 112, y: 160 } });
    layout.revision++;
    expect(canOccupy(layout, floor, "user", 32, 32, 112, 128)).toBe(false);
  });
});
