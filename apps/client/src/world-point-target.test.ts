import { describe, expect, it } from "vitest";
import { getDefaultAssetVariantId, requireAssetDefinition, type FloorLayout, type WorldObject } from "@workhard/shared";
import { resolveWorldPointTarget } from "./world-point-target";
import { getWorldAssetArtwork } from "./world-asset-artwork";

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

  it.each(["special-confetti", "special-bubbles", "special-fortune", "special-break-wheel"])("selects %s from its artwork and footprint at every rotation", assetId => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const object = { ...createObject("toy", assetId, 64, 64), rotation };
      const layout = createLayout(object);
      expect(resolveWorldPointTarget(layout, 72, 72)).toEqual({ type: "object", object });
      const { bounds } = getWorldAssetArtwork(requireAssetDefinition(assetId), object.variantId, rotation);
      expect(resolveWorldPointTarget(layout, object.x + bounds.x + bounds.width / 2, object.y + bounds.y + 3, 0, () => true)).toEqual({ type: "object", object });
      const narrowX = assetId !== "special-break-wheel" || rotation % 180 !== 0;
      expect(resolveWorldPointTarget(layout, narrowX ? 62 : 72, narrowX ? 72 : 62, 44)).toEqual({ type: "object", object });
    }
  });

  it.each(["equipment-whiteboard", "equipment-checklist"])("selects %s with pointer and touch targets in every rotation", (assetId) => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const board = { ...createObject("board", assetId, 32, 32), rotation };
      const layout = createLayout(board);
      expect(resolveWorldPointTarget(layout, 40, 40)).toEqual({ type: "object", object: board });
      expect(resolveWorldPointTarget(layout, rotation % 180 ? 24 : 40, rotation % 180 ? 40 : 24, 44)).toEqual({ type: "object", object: board });
      const { bounds } = getWorldAssetArtwork(requireAssetDefinition(assetId), board.variantId, rotation);
      expect(resolveWorldPointTarget(layout, board.x + bounds.x + bounds.width / 2, board.y + bounds.y + bounds.height / 4))
        .toEqual({ type: "object", object: board });
      if (rotation % 180 === 0) {
        const behind = { ...board, id: "behind", y: board.y - 16 };
        expect(resolveWorldPointTarget(createLayout(behind, board), board.x + 32, board.y - 8)).toEqual({ type: "object", object: board });
      }
    }
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
