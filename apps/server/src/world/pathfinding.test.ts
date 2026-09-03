import { describe, expect, it } from "vitest";
import { getOutdoorBounds, type FloorLayout } from "@workhard/shared";
import { DemoStore } from "../store.js";
import { canOccupy } from "./collision.js";
import { findPath } from "./pathfinding.js";

const layout: FloorLayout = {
  floorId: "floor-test",
  revision: 1,
  tiles: [],
  openings: [],
  rooms: [],
  objects: [],
  walls: [{ id: "wall", start: { x: 64, y: 0 }, end: { x: 64, y: 96 } }],
};

const bounds = { width: 192, height: 192 };

const lockedLayout: FloorLayout = {
  floorId: "floor-private",
  revision: 1,
  tiles: [],
  rooms: [{
    id: "room-private",
    floorId: "floor-private",
    name: "Private room",
    color: "#cccccc",
    capacity: 2,
    bounds: { x: 64, y: 32, width: 64, height: 96 },
    footprint: [{ x: 64, y: 32, width: 64, height: 96 }],
    boundary: [
      { wallId: "top", startOffset: 0, endOffset: 64 },
      { wallId: "right", startOffset: 0, endOffset: 96 },
      { wallId: "bottom", startOffset: 0, endOffset: 64 },
      { wallId: "left", startOffset: 0, endOffset: 96 },
    ],
    doorIds: ["door"],
    windowIds: [],
    privateEligible: true,
    access: { mode: "assigned", assignedPersonIds: ["member"], knockable: true },
  }],
  objects: [],
  walls: [
    { id: "top", start: { x: 64, y: 32 }, end: { x: 128, y: 32 } },
    { id: "right", start: { x: 128, y: 32 }, end: { x: 128, y: 128 } },
    { id: "bottom", start: { x: 64, y: 128 }, end: { x: 128, y: 128 } },
    { id: "left", start: { x: 64, y: 32 }, end: { x: 64, y: 128 } },
  ],
  openings: [{ id: "door", wallId: "left", offset: 16, width: 64, type: "door" }],
};

describe("world navigation", () => {
  it("rejects positions overlapping a wall", () => {
    expect(canOccupy(layout, bounds, "user", 32, 32, 70, 32)).toBe(false);
    expect(canOccupy(layout, bounds, "user", 32, 32, 32, 64)).toBe(true);
  });

  it("routes around collision without leaving the floor", () => {
    const path = findPath(layout, bounds, "user", { x: 32, y: 32 }, { x: 128, y: 32 });

    expect(path.length).toBeGreaterThan(3);
    expect(path.at(-1)).toEqual({ x: 128, y: 32 });
    expect(path.some((point) => point.y > 96 + 13)).toBe(true);
    expect(path.every((point) => point.x >= 13 && point.y >= 13 && point.x <= 179 && point.y <= 179)).toBe(true);
  });

  it("moves to the closest reachable point when the clicked point is occupied", () => {
    const start = { x: 144, y: 144 };
    const destination = { x: 64, y: 32 };
    const path = findPath(layout, bounds, "user", start, destination);
    const endpoint = path.at(-1);

    expect(endpoint).toBeDefined();
    expect(endpoint).not.toEqual(destination);
    expect(Math.hypot(endpoint!.x - destination.x, endpoint!.y - destination.y)).toBeLessThan(
      Math.hypot(start.x - destination.x, start.y - destination.y),
    );
  });

  it("preserves valid sub-cell destinations", () => {
    expect(findPath(layout, bounds, "user", { x: 32, y: 32 }, { x: 36, y: 36 })).toEqual([{ x: 36, y: 36 }]);
  });

  it("allows navigation throughout the outdoor margin", () => {
    const outdoorBounds = getOutdoorBounds({ width: bounds.width, height: bounds.height });
    const path = findPath(layout, outdoorBounds, "user", { x: 32, y: 128 }, { x: -64, y: 128 });

    expect(path.at(-1)).toEqual({ x: -64, y: 128 });
  });

  it("rejects manual and pathfinding movement beyond the floor boundary", () => {
    expect(canOccupy(layout, bounds, "user", 32, 32, 12, 32)).toBe(false);
    expect(findPath(layout, bounds, "user", { x: 32, y: 32 }, { x: -32, y: 32 })).toEqual([]);
  });

  it("allows a room-scoped grant through an assigned-room door", () => {
    expect(canOccupy(lockedLayout, bounds, "user", 32, 64, 52, 64)).toBe(false);
    expect(canOccupy(lockedLayout, bounds, "user", 32, 64, 70, 64)).toBe(false);
    expect(canOccupy(lockedLayout, bounds, "user", 32, 64, 70, 64, 13, new Set(["room-private"]))).toBe(true);
  });

  it("grants assigned people access without a temporary grant", () => {
    expect(canOccupy(lockedLayout, bounds, "visitor", 32, 64, 70, 64)).toBe(false);
    expect(findPath(lockedLayout, bounds, "visitor", { x: 32, y: 64 }, { x: 96, y: 64 }).at(-1)).toEqual({ x: 48, y: 64 });
    expect(canOccupy(lockedLayout, bounds, "member", 32, 64, 70, 64)).toBe(true);
  });

  it("routes authorized entry through the door instead of another room wall", () => {
    const grant = new Set(["room-private"]);

    expect(canOccupy(lockedLayout, bounds, "user", 32, 36, 70, 36, 13, grant)).toBe(false);
    expect(findPath(lockedLayout, bounds, "user", { x: 32, y: 64 }, { x: 96, y: 64 }, grant).at(-1)).toEqual({ x: 96, y: 64 });
  });

  it("treats a full room as unavailable to a new occupant", () => {
    expect(canOccupy(
      lockedLayout,
      bounds,
      "user",
      32,
      64,
      70,
      64,
      13,
      new Set(["room-private"]),
      new Set(["room-private"]),
    )).toBe(false);
  });

  it("keeps the rooftop portal and private-room door reachable from its spawn", () => {
    const store = new DemoStore();
    const rooftop = store.getLayout("floor-rooftop");
    const floor = store.getFloor("floor-rooftop");
    if (!rooftop || !floor) {
      throw new Error("Rooftop seed is missing");
    }

    const portalPath = findPath(rooftop, floor, "user-maya", floor.spawn, { x: 1130, y: 690 });
    const quietRoomPath = findPath(
      rooftop,
      floor,
      "user-maya",
      floor.spawn,
      { x: 720, y: 480 },
      new Set(["room-quiet"]),
    );

    expect(portalPath.length).toBeGreaterThan(0);
    expect(quietRoomPath.length).toBeGreaterThan(0);
  });
});
