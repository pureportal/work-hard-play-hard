import { describe, expect, it } from "vitest";
import type { FloorLayout } from "@workhard/shared";
import { getWallOpeningPlacement, mergeWallSegments } from "@workhard/shared";

describe("layout placement", () => {
  it("merges adjacent wall segments and preserves opening positions", () => {
    const merged = mergeWallSegments(
      [
        { id: "first", start: { x: 32, y: 64 }, end: { x: 64, y: 64 } },
        { id: "second", start: { x: 128, y: 64 }, end: { x: 64, y: 64 } },
        { id: "vertical", start: { x: 192, y: 32 }, end: { x: 192, y: 96 } },
      ],
      [{ id: "window", wallId: "second", offset: 32, width: 32, type: "window", light: { color: "#fff", intensity: 0.2, depth: 96 } }],
    );

    expect(merged.walls).toContainEqual({
      id: "first",
      start: { x: 32, y: 64 },
      end: { x: 128, y: 64 },
    });
    expect(merged.walls).toHaveLength(2);
    expect(merged.openings).toContainEqual(expect.objectContaining({
      id: "window",
      wallId: "first",
      offset: 64,
    }));
  });

  it("treats an overlapping opening as a replacement", () => {
    const layout: FloorLayout = {
      floorId: "floor",
      revision: 1,
      walls: [{ id: "wall", start: { x: 32, y: 64 }, end: { x: 256, y: 64 } }],
      openings: [{ id: "door", wallId: "wall", offset: 64, width: 64, type: "door" }],
      tiles: [],
      rooms: [],
      objects: [],
    };

    const placement = getWallOpeningPlacement(layout, "window", { x: 128, y: 64 });

    expect(placement.error).toBeUndefined();
    expect(placement.opening).toMatchObject({ wallId: "wall", offset: 64, type: "window" });
    expect(placement.replacedOpeningIds).toEqual(["door"]);
  });
});
