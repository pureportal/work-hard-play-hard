import {
  ASSET_CATALOG,
  getAssetCollisionRects,
  getAssetPlacementError,
  getCenteredAssetPosition,
  getDefaultAssetVariantId,
  getPlacedAssetBounds,
  getPlacedAssetCells,
  getAssetVariants,
  requireAssetDefinition,
  type AssetRotation,
  type FloorLayout,
  type WorldObject,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";

const bounds = { width: 512, height: 512 };

describe("raster asset placement", () => {
  it("uses occupied cells instead of an irregular asset's bounding box", () => {
    const cornerDesk = object("corner", "desk-corner", 0, 0);
    const inOpenCorner = object("plant", "plant-floor", 48, 48);
    const onDesk = object("blocked", "plant-floor", 0, 32);
    const layout = withObjects(cornerDesk);

    expect(getAssetPlacementError(layout, bounds, inOpenCorner)).toBeUndefined();
    expect(getAssetPlacementError(layout, bounds, onDesk)).toBe("ASSET_BLOCKED");
  });

  it("rotates I-shaped footprints on the raster", () => {
    const planter = object("planter", "plant-planter-row", 32, 48, 90);

    expect(getPlacedAssetCells(planter).map((cell) => [cell.x, cell.y])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
    expect(getPlacedAssetBounds(planter)).toEqual({ x: 32, y: 48, width: 80, height: 16 });
  });

  it("centers rotated footprints on the placement point", () => {
    const definition = requireAssetDefinition("plant-planter-row");
    const point = { x: 328, y: 248 };
    const verticalPosition = getCenteredAssetPosition(definition, 0, point);
    const horizontalPosition = getCenteredAssetPosition(definition, 90, point);

    expect(verticalPosition).toEqual({ x: 320, y: 208 });
    expect(horizontalPosition).toEqual({ x: 288, y: 240 });
    expect(center(getPlacedAssetBounds(object("vertical", definition.id, verticalPosition.x, verticalPosition.y)))).toEqual(point);
    expect(center(getPlacedAssetBounds(object("horizontal", definition.id, horizontalPosition.x, horizontalPosition.y, 90)))).toEqual(point);
  });

  it("ignores an asset's previous cells while validating a move", () => {
    const chair = object("chair", "chair-office", 32, 32);
    const moved = { ...chair, x: 64, y: 64 };

    expect(getAssetPlacementError(withObjects(chair), bounds, moved)).toBeUndefined();
  });

  it("allows decorations only on footprint cells with matching surface metadata", () => {
    const table = object("table", "table-meeting", 32, 32);
    const validDecoration = object("valid", "decor-desk-plant", 48, 80);
    const unsupportedCell = object("unsupported-cell", "decor-desk-plant", 32, 80);
    const unsupportedFloor = object("unsupported-floor", "decor-desk-plant", 224, 224);
    const layout = withObjects(table);

    expect(getAssetPlacementError(layout, bounds, validDecoration)).toBeUndefined();
    expect(getAssetPlacementError(layout, bounds, unsupportedCell)).toBe("ASSET_REQUIRES_SURFACE");
    expect(getAssetPlacementError(layout, bounds, unsupportedFloor)).toBe("ASSET_REQUIRES_SURFACE");
    expect(getAssetPlacementError(withObjects(table, validDecoration), bounds, object("duplicate", "decor-lamp", 48, 80)))
      .toBe("ASSET_BLOCKED");
  });

  it("checks every occupied cell against walls and floor bounds", () => {
    const layout: FloorLayout = {
      ...withObjects(),
      walls: [{ id: "wall", start: { x: 64, y: 0 }, end: { x: 64, y: 160 } }],
    };

    expect(getAssetPlacementError(layout, bounds, object("wall-overlap", "plant-planter-row", 64, 32)))
      .toBe("ASSET_BLOCKED");
    expect(getAssetPlacementError(layout, bounds, object("outside", "desk-corner", 480, 480)))
      .toBe("ASSET_OUT_OF_RANGE");
  });

  it("places floor surfaces beneath furniture while blocking duplicate tiles", () => {
    const tile = object("tile", "floor-tile", 32, 32);
    const chair = object("chair", "chair-office", 48, 48);

    expect(getAssetPlacementError(withObjects(tile), bounds, chair)).toBeUndefined();
    expect(getAssetPlacementError(withObjects(chair), bounds, tile)).toBeUndefined();
    expect(getAssetPlacementError(withObjects(tile), bounds, { ...tile, id: "other-tile", variantId: "stone" }))
      .toBe("ASSET_BLOCKED");
    expect(getAssetCollisionRects(withObjects(tile))).toEqual([]);
  });

  it("defines multiple selectable designs for every asset", () => {
    for (const definition of ASSET_CATALOG.assets) {
      expect(getAssetVariants(definition).length).toBeGreaterThanOrEqual(2);
    }
    expect(getAssetVariants(requireAssetDefinition("sofa-straight")).map((variant) => variant.id))
      .toEqual(["white", "gray", "blue"]);
    expect(getAssetVariants(requireAssetDefinition("floor-tile")).map((variant) => variant.pattern))
      .toEqual(["wood", "stone", "grass"]);
  });
});

function object(
  id: string,
  assetId: string,
  x: number,
  y: number,
  rotation: AssetRotation = 0,
): WorldObject {
  const definition = requireAssetDefinition(assetId);
  return { id, floorId: "floor", assetId, x, y, rotation, variantId: getDefaultAssetVariantId(definition) };
}

function withObjects(...objects: WorldObject[]): FloorLayout {
  return {
    floorId: "floor",
    revision: 1,
    walls: [],
    openings: [],
    tiles: [],
    objects,
    rooms: [],
  };
}

function center(rectangle: { x: number; y: number; width: number; height: number }) {
  return {
    x: rectangle.x + rectangle.width / 2,
    y: rectangle.y + rectangle.height / 2,
  };
}
