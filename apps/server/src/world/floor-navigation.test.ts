import { describe, expect, it } from "vitest";
import type { Floor, FloorLayout, Position, WorldObject } from "@workhard/shared";
import { findFloorRoute } from "./floor-navigation.js";

const floors: Floor[] = [1, 2, 3].map((level) => ({
  id: `floor-${level}`,
  officeId: "office",
  name: `Floor ${level}`,
  level,
  width: 512,
  height: 512,
  spawn: { x: 256, y: 448 },
  background: "#ffffff",
}));

const layouts: FloorLayout[] = [
  layout(1, portal("one-up", 1, 32, 32, 2)),
  layout(2, portal("two-down", 2, 32, 32, 1), portal("two-up", 2, 352, 32, 3)),
  layout(3, portal("three-down", 3, 352, 32, 2)),
];

const directPath = (_floorId: string, start: Position, destination: Position): Position[] => (
  start.x === destination.x && start.y === destination.y ? [] : [destination]
);

describe("floor navigation", () => {
  it("keeps same-floor movement on a single walking leg", () => {
    const route = findFloorRoute({
      floors,
      layouts,
      start: { floorId: "floor-1", x: 64, y: 64 },
      destination: { floorId: "floor-1", x: 320, y: 320 },
      findPath: directPath,
    });

    expect(route).toEqual([{
      floorId: "floor-1",
      path: [{ x: 320, y: 320 }],
    }]);
  });

  it("walks to a stair and emerges from its reverse stair on an adjacent floor", () => {
    const route = findFloorRoute({
      floors,
      layouts,
      start: { floorId: "floor-1", x: 64, y: 448 },
      destination: { floorId: "floor-2", x: 256, y: 448 },
      findPath: directPath,
    });

    expect(route).toHaveLength(2);
    expect(route?.[0]).toMatchObject({
      floorId: "floor-1",
      path: [{ x: 64, y: 64 }],
      transition: {
        sourcePortalId: "one-up",
        destinationPortalId: "two-down",
        floorId: "floor-2",
      },
    });
    expect(route?.[1]).toEqual({
      floorId: "floor-2",
      path: [{ x: 256, y: 448 }],
    });
  });

  it("walks between the arrival and departure stairs on every intermediate floor", () => {
    const route = findFloorRoute({
      floors,
      layouts,
      start: { floorId: "floor-1", x: 64, y: 448 },
      destination: { floorId: "floor-3", x: 256, y: 448 },
      findPath: directPath,
    });

    expect(route?.map((leg) => leg.floorId)).toEqual(["floor-1", "floor-2", "floor-3"]);
    expect(route?.[0]?.transition).toMatchObject({ floorId: "floor-2", destinationPortalId: "two-down" });
    expect(route?.[1]).toMatchObject({
      floorId: "floor-2",
      path: [{ x: 384, y: 64 }],
      transition: { floorId: "floor-3", destinationPortalId: "three-down" },
    });
    expect(route?.[2]).toEqual({
      floorId: "floor-3",
      path: [{ x: 256, y: 448 }],
    });
  });
});

function layout(level: number, ...objects: WorldObject[]): FloorLayout {
  return {
    floorId: `floor-${level}`,
    revision: 1,
    walls: [],
    openings: [],
    tiles: [],
    rooms: [],
    objects,
  };
}

function portal(id: string, floor: number, x: number, y: number, destinationLevel: number): WorldObject {
  return {
    id,
    floorId: `floor-${floor}`,
    assetId: "infrastructure-portal",
    x,
    y,
    rotation: 0,
    variantId: "violet",
    label: String(destinationLevel),
  };
}
