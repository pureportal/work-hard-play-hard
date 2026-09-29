import {
  ASSET_ROTATIONS,
  getMovedAssetCandidates,
  getMovedAssetPlacementError,
  requireAssetDefinition,
  getDefaultAssetVariantId,
  type AssetRotation,
  type FloorLayout,
  type WorldObject,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";

const bounds = { width: 512, height: 512 };

describe("moving a furnished table", () => {
  it.each(ASSET_ROTATIONS)("rotates every item with the table by %s degrees", rotation => {
    const table = object("table", "table-meeting", 32, 32);
    const laptop = object("laptop", "decor-laptop", 48, 48);
    const lamp = object("lamp", "decor-lamp", 112, 64);
    const chair = object("chair", "chair-office", 176, 32);
    const layout = withObjects(table, laptop, lamp, chair);
    const candidate = { ...table, x: 256, y: 128, rotation };
    const moved = getMovedAssetCandidates(layout, candidate);

    expect(moved.map((item) => item.id)).toEqual(["table", "laptop", "lamp"]);
    expect(getMovedAssetPlacementError(layout, bounds, moved)).toBeUndefined();
    expect(moved[1]).toMatchObject({
      x: [272, 288, 336, 272][rotation / 90],
      y: [144, 144, 160, 208][rotation / 90],
      rotation,
    });
    expect(moved[2]).toMatchObject({
      x: [336, 272, 288, 288][rotation / 90],
      y: [160, 208, 144, 160][rotation / 90],
      rotation,
    });
    expect(layout.objects).toEqual([table, laptop, lamp, chair]);
  });

  it("preserves an item's own rotation through a full turn", () => {
    const table = object("table", "table-meeting", 32, 32, 90);
    const laptop = object("laptop", "decor-laptop", 48, 64, 90);
    let layout = withObjects(table, laptop);
    let moved = [table, laptop];
    for (const rotation of [180, 270, 0, 90] as const) {
      const candidate = { ...moved[0]!, rotation };
      moved = getMovedAssetCandidates(layout, candidate);
      expect(getMovedAssetPlacementError(layout, bounds, moved)).toBeUndefined();
      layout = withObjects(...moved);
    }
    expect(moved).toEqual([table, laptop]);
  });

  it("rejects collisions, walls, and floor overflow without changing the layout", () => {
    const table = object("table", "table-meeting", 32, 32);
    const laptop = object("laptop", "decor-laptop", 48, 48);
    const obstacle = object("obstacle", "chair-office", 256, 128);
    const layout = withObjects(table, laptop, obstacle);
    const blocked = getMovedAssetCandidates(layout, { ...table, x: 256, y: 128 });
    expect(getMovedAssetPlacementError(layout, bounds, blocked)).toBe("ASSET_BLOCKED");

    const clear = withObjects(table, laptop);
    clear.walls = [{ id: "wall", start: { x: 256, y: 96 }, end: { x: 256, y: 256 } }];
    expect(getMovedAssetPlacementError(clear, bounds, getMovedAssetCandidates(clear, { ...table, x: 256, y: 128 })))
      .toBe("ASSET_BLOCKED");
    expect(getMovedAssetPlacementError(withObjects(table, laptop), bounds,
      getMovedAssetCandidates(withObjects(table, laptop), { ...table, x: 400, y: 128 })))
      .toBe("ASSET_OUT_OF_RANGE");
    expect(layout.objects).toEqual([table, laptop, obstacle]);
  });

  it("checks carried surface items against other occupants", () => {
    const table = object("table", "table-meeting", 32, 32);
    const laptop = object("laptop", "decor-laptop", 48, 48);
    const other = object("other", "decor-lamp", 272, 144);
    const layout = withObjects(table, laptop, other);
    const moved = getMovedAssetCandidates(layout, { ...table, x: 256, y: 128 });
    expect(getMovedAssetPlacementError(layout, bounds, moved)).toBe("ASSET_BLOCKED");
  });

  it("rejects a move when a decoration spanning two tables would lose support", () => {
    const table = object("table", "table-meeting", 32, 32);
    const neighbor = object("neighbor", "table-meeting", 160, 32);
    const laptop = object("laptop", "decor-laptop", 144, 48);
    const layout = withObjects(table, neighbor, laptop);
    const moved = getMovedAssetCandidates(layout, { ...table, x: 320 });

    expect(moved.map((item) => item.id)).toEqual(["table", "laptop"]);
    expect(getMovedAssetPlacementError(layout, bounds, moved)).toBe("ASSET_REQUIRES_SURFACE");
    expect(layout.objects).toEqual([table, neighbor, laptop]);
  });

  it("does not carry tabletop items when moving flooring beneath the table", () => {
    const tile = object("tile", "floor-wood", 32, 32);
    const table = object("table", "table-meeting", 32, 32);
    const lamp = object("lamp", "decor-lamp", 48, 48);
    const layout = withObjects(tile, table, lamp);

    expect(getMovedAssetCandidates(layout, { ...tile, x: 256, y: 256 }).map((item) => item.id)).toEqual(["tile"]);
    expect(getMovedAssetCandidates(layout, { ...table, x: 256, y: 256 }).map((item) => item.id)).toEqual(["table", "lamp"]);
  });
});

function object(id: string, assetId: string, x: number, y: number, rotation: AssetRotation = 0): WorldObject {
  return { id, floorId: "floor", assetId, x, y, rotation, variantId: getDefaultAssetVariantId(requireAssetDefinition(assetId)) };
}

function withObjects(...objects: WorldObject[]): FloorLayout {
  return { floorId: "floor", revision: 1, walls: [], openings: [], tiles: [], rooms: [], objects };
}
