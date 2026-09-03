import { describe, expect, it } from "vitest";
import { getDefaultAssetVariantId, requireAssetDefinition, type FloorLayout, type WorldObject } from "@workhard/shared";
import { resolveWorldPointTarget } from "./world-point-target";

describe("world point targets", () => {
  it("treats room floors as movement destinations", () => {
    const layout = createLayout();
    layout.rooms.push({
      id: "product-studio",
      floorId: layout.floorId,
      name: "Product Studio",
      color: "#cce6d8",
      capacity: 12,
      bounds: { x: 0, y: 0, width: 320, height: 240 },
      footprint: [{ x: 0, y: 0, width: 320, height: 240 }],
      boundary: [],
      doorIds: [],
      windowIds: [],
      privateEligible: false,
      access: { mode: "open", assignedPersonIds: [], knockable: false },
    });

    expect(resolveWorldPointTarget(layout, 160, 120)).toEqual({ type: "destination", x: 160, y: 120 });
  });

  it("ignores assets without an interaction", () => {
    const layout = createLayout(createObject("desk", "desk-straight", 32, 32));

    expect(resolveWorldPointTarget(layout, 48, 48)).toEqual({ type: "destination", x: 48, y: 48 });
  });

  it("selects the clicked seat interaction", () => {
    const chair = createObject("chair", "chair-office", 32, 32);
    const layout = createLayout(chair);

    expect(resolveWorldPointTarget(layout, 48, 48)).toEqual({ type: "object", object: chair, interactionId: "seat" });
  });

  it("selects interactive equipment without a cell interaction", () => {
    const gong = createObject("gong", "equipment-gong", 32, 32);
    const layout = createLayout(gong);

    expect(resolveWorldPointTarget(layout, 48, 48)).toEqual({ type: "object", object: gong });
  });

  it("expands small interaction targets only when a minimum target size is requested", () => {
    const chair = createObject("chair", "chair-office", 32, 32);
    const layout = createLayout(chair);

    expect(resolveWorldPointTarget(layout, 68, 48)).toEqual({ type: "destination", x: 68, y: 48 });
    expect(resolveWorldPointTarget(layout, 68, 48, 44)).toEqual({ type: "object", object: chair, interactionId: "seat" });
  });

  it("does not make non-interactive assets into expanded targets", () => {
    const desk = createObject("desk", "desk-straight", 32, 32);
    const layout = createLayout(desk);

    expect(resolveWorldPointTarget(layout, 68, 48, 44)).toEqual({ type: "destination", x: 68, y: 48 });
  });
});

function createLayout(...objects: WorldObject[]): FloorLayout {
  return {
    floorId: "floor-studio",
    revision: 1,
    walls: [],
    openings: [],
    tiles: [],
    rooms: [],
    objects,
  };
}

function createObject(id: string, assetId: string, x: number, y: number): WorldObject {
  return {
    id,
    floorId: "floor-studio",
    assetId,
    x,
    y,
    rotation: 0,
    variantId: getDefaultAssetVariantId(requireAssetDefinition(assetId)),
  };
}
