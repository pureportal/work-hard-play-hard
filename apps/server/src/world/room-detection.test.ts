import {
  detectLayoutRooms,
  detectRooms,
  getOutdoorWindowLights,
  getWallRect,
  reconcileRooms,
  type RoomDetectionInput,
  type Wall,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";

const floor = { floorId: "floor-test", width: 256, height: 224 };

describe("room detection", () => {
  it("detects a bounded room live and requires a door before private configuration", () => {
    const walls = rectangleWalls(32, 32, 160, 160);
    const withoutDoor = detectRooms({ ...floor, walls, openings: [] });

    expect(withoutDoor).toHaveLength(1);
    expect(withoutDoor[0]).toMatchObject({
      bounds: { x: 32, y: 32, width: 128, height: 128 },
      privateEligible: false,
    });

    const withDoor = detectRooms({
      ...floor,
      walls,
      openings: [{ id: "door", wallId: "bottom", offset: 32, width: 64, type: "door" }],
    });
    expect(withDoor[0]).toMatchObject({ privateEligible: true, doorIds: ["door"] });
  });

  it("drops a room as soon as an unclosed wall gap connects it outdoors", () => {
    const walls = rectangleWalls(32, 32, 160, 160).filter((wall) => wall.id !== "right");

    expect(detectRooms({ ...floor, walls, openings: [] })).toEqual([]);
  });

  it("preserves room ownership and customization across geometry edits", () => {
    const initialInput: RoomDetectionInput = {
      ...floor,
      walls: rectangleWalls(32, 32, 160, 160),
      openings: [{ id: "door", wallId: "bottom", offset: 32, width: 64, type: "door" }],
    };
    const initial = reconcileRooms(initialInput);
    initial[0] = {
      ...initial[0]!,
      name: "Apartment 2A",
      color: "#445566",
      access: { mode: "assigned", assignedPersonIds: ["alex", "sam"], knockable: true },
    };
    const expanded = reconcileRooms({
      ...floor,
      walls: rectangleWalls(32, 32, 192, 160),
      openings: [{ id: "door", wallId: "bottom", offset: 32, width: 64, type: "door" }],
    }, initial);

    expect(expanded[0]).toMatchObject({
      id: initial[0].id,
      name: "Apartment 2A",
      color: "#445566",
      access: { mode: "assigned", assignedPersonIds: ["alex", "sam"], knockable: true },
    });
  });

  it("creates floor light only for windows with an outdoor side", () => {
    const walls = [
      ...rectangleWalls(32, 32, 224, 192),
      wall("divider", 128, 32, 128, 192),
    ];
    const layout = detectLayoutRooms({
      floorId: floor.floorId,
      revision: 1,
      walls,
      openings: [
        {
          id: "outdoor-window",
          wallId: "top",
          offset: 32,
          width: 64,
          type: "window",
          light: { color: "#fff4cf", intensity: 0.2, depth: 96 },
        },
        {
          id: "interior-window",
          wallId: "divider",
          offset: 32,
          width: 64,
          type: "window",
          light: { color: "#fff4cf", intensity: 0.2, depth: 96 },
        },
      ],
      tiles: [],
      objects: [],
      rooms: [],
    }, floor);

    expect(layout.rooms).toHaveLength(2);
    expect(getOutdoorWindowLights(layout, floor)).toEqual([
      expect.objectContaining({ windowId: "outdoor-window", direction: { x: 0, y: 1 }, depth: 96 }),
    ]);
  });

  it("does not treat an enclosed non-room cell as outdoors", () => {
    const walls = [
      ...rectangleWalls(32, 32, 160, 160),
      wall("closet-top", 160, 64, 192, 64),
      wall("closet-right", 192, 64, 192, 96),
      wall("closet-bottom", 160, 96, 192, 96),
    ];
    const layout = detectLayoutRooms({
      floorId: floor.floorId,
      revision: 1,
      walls,
      openings: [{
        id: "closet-window",
        wallId: "right",
        offset: 32,
        width: 32,
        type: "window",
        light: { color: "#fff4cf", intensity: 0.2, depth: 96 },
      }],
      tiles: [],
      objects: [],
      rooms: [],
    }, floor);

    expect(layout.rooms).toHaveLength(1);
    expect(getOutdoorWindowLights(layout, floor)).toEqual([]);
  });

  it("lights windows placed directly on the floor edge", () => {
    const layout = detectLayoutRooms({
      floorId: floor.floorId,
      revision: 1,
      walls: rectangleWalls(0, 0, 160, 160),
      openings: [{
        id: "edge-window",
        wallId: "top",
        offset: 32,
        width: 64,
        type: "window",
        light: { color: "#fff4cf", intensity: 0.2, depth: 96 },
      }],
      tiles: [],
      objects: [],
      rooms: [],
    }, floor);

    expect(getOutdoorWindowLights(layout, floor)).toEqual([
      expect.objectContaining({ windowId: "edge-window", direction: { x: 0, y: 1 } }),
    ]);
  });

  it("uses thin wall rectangles independently of segment length", () => {
    expect(getWallRect(wall("small", 32, 32, 64, 32))).toEqual({ x: 32, y: 26, width: 32, height: 12 });
    expect(getWallRect(wall("long", 32, 32, 224, 32))).toEqual({ x: 32, y: 26, width: 192, height: 12 });
  });
});

function rectangleWalls(left: number, top: number, right: number, bottom: number): Wall[] {
  return [
    wall("top", left, top, right, top),
    wall("right", right, top, right, bottom),
    wall("bottom", left, bottom, right, bottom),
    wall("left", left, top, left, bottom),
  ];
}

function wall(id: string, startX: number, startY: number, endX: number, endY: number): Wall {
  return { id, start: { x: startX, y: startY }, end: { x: endX, y: endY } };
}
