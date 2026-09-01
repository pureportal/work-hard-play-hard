import { describe, expect, it } from "vitest";
import type { FloorLayout } from "@workhard/shared";
import { DemoStore } from "../store.js";
import { canOccupy } from "./collision.js";
import { findPath } from "./pathfinding.js";

const layout: FloorLayout = {
  floorId: "floor-test",
  revision: 1,
  tiles: [],
  areas: [],
  objects: [],
  walls: [{ id: "wall", x: 64, y: 0, width: 32, height: 96 }],
};

const bounds = { width: 192, height: 192 };

const lockedLayout: FloorLayout = {
  floorId: "floor-private",
  revision: 1,
  tiles: [],
  areas: [{
    id: "area-private",
    floorId: "floor-private",
    name: "Private room",
    type: "private",
    x: 64,
    y: 32,
    width: 64,
    height: 96,
    color: "#cccccc",
    capacity: 2,
    locked: true,
    visibility: "public",
    doors: [{ id: "door", side: "left", offset: 16, width: 64 }],
  }],
  objects: [],
  walls: [],
};

const memberOnlyLayout: FloorLayout = {
  ...lockedLayout,
  areas: lockedLayout.areas.map((area) => ({
    ...area,
    locked: false,
    visibility: "members",
    memberIds: ["member"],
  })),
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
    expect(path.some((point) => point.y >= 128)).toBe(true);
    expect(path.every((point) => point.x >= 13 && point.y >= 13 && point.x <= 179 && point.y <= 179)).toBe(true);
  });

  it("rejects manual and pathfinding movement beyond the floor boundary", () => {
    expect(canOccupy(layout, bounds, "user", 32, 32, 12, 32)).toBe(false);
    expect(findPath(layout, bounds, "user", { x: 32, y: 32 }, { x: -32, y: 32 })).toEqual([]);
  });

  it("allows a room-scoped grant through a locked area boundary", () => {
    expect(canOccupy(lockedLayout, bounds, "user", 32, 64, 52, 64)).toBe(false);
    expect(canOccupy(lockedLayout, bounds, "user", 32, 64, 70, 64)).toBe(false);
    expect(canOccupy(lockedLayout, bounds, "user", 32, 64, 70, 64, 13, new Set(["area-private"]))).toBe(true);
  });

  it("keeps an unlocked members-only room private", () => {
    expect(canOccupy(memberOnlyLayout, bounds, "visitor", 32, 64, 70, 64)).toBe(false);
    expect(findPath(memberOnlyLayout, bounds, "visitor", { x: 32, y: 64 }, { x: 96, y: 64 })).toEqual([]);
    expect(canOccupy(memberOnlyLayout, bounds, "member", 32, 64, 70, 64)).toBe(true);
    expect(canOccupy(memberOnlyLayout, bounds, "manager", 32, 64, 70, 64, 13, new Set(["area-private"]))).toBe(true);
  });

  it("routes authorized entry through the door instead of another room wall", () => {
    const grant = new Set(["area-private"]);

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
      new Set(["area-private"]),
      new Set(["area-private"]),
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
      new Set(["area-quiet"]),
    );

    expect(portalPath.length).toBeGreaterThan(0);
    expect(quietRoomPath.length).toBeGreaterThan(portalPath.length);
  });
});
