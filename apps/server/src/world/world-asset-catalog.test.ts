import {
  ASSET_CATALOG, ASSET_RASTER_SIZE, ASSET_ROTATIONS, BUILD_GRID_SIZE,
  getAssetCollisionRects, getAssetPlacementError, getAssetVariants,
  getDefaultAssetVariantId, getPlacedAssetCells, getPlacedAssetInteractions,
  requireAssetDefinition, type AssetRotation, type FloorLayout, type WorldObject,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";

describe("expanded world catalog", () => {
  it("places every design and orientation on its declared layer", () => {
    expect(ASSET_RASTER_SIZE).toBe(16);
    expect(BUILD_GRID_SIZE).toBe(32);
    for (const asset of ASSET_CATALOG.assets) {
      for (const rotation of ASSET_ROTATIONS) {
        for (const variant of getAssetVariants(asset)) {
          const candidate = { ...object(asset.id, 64, 64, rotation), variantId: variant.id };
          const supportingObjects = asset.placement.layer === "surface" ? [object("table-workbench", 64, 64)] : [];
          expect(getAssetPlacementError(layout(supportingObjects), { width: 512, height: 512 }, candidate), `${asset.id}/${variant.id}/${rotation}`).toBeUndefined();
          expect(getAssetCollisionRects(layout([candidate]))).toHaveLength(getPlacedAssetCells(candidate).filter((cell) => cell.solid).length);
          expect(getAssetPlacementError(layout([...supportingObjects, candidate]), { width: 512, height: 512 }, { ...candidate, id: "duplicate" })).toBe("ASSET_BLOCKED");
        }
      }
    }
  });

  it("supports tabletop objects on the new storage furniture", () => {
    const cabinet = object("storage-credenza", 64, 64);
    const vase = object("decor-vase", 80, 64);
    expect(getAssetPlacementError(layout([]), { width: 512, height: 512 }, vase)).toBe("ASSET_REQUIRES_SURFACE");
    expect(getAssetPlacementError(layout([cabinet]), { width: 512, height: 512 }, vase)).toBeUndefined();
    expect(getAssetPlacementError(layout([object("storage-locker", 64, 64)]), { width: 512, height: 512 }, vase)).toBe("ASSET_REQUIRES_SURFACE");
  });

  it("keeps round rugs nonblocking and uses their exact ground cells", () => {
    const rug = object("rug-round", 64, 64);
    const cornerNeighbour = object("rug-round", 128, 128);
    const overlappingRug = object("rug-round", 112, 112);
    expect(getAssetCollisionRects(layout([rug]))).toEqual([]);
    expect(getAssetPlacementError(layout([rug]), { width: 512, height: 512 }, object("chair-beanbag", 80, 80))).toBeUndefined();
    expect(getAssetPlacementError(layout([rug]), { width: 512, height: 512 }, cornerNeighbour)).toBeUndefined();
    expect(getAssetPlacementError(layout([rug]), { width: 512, height: 512 }, overlappingRug)).toBe("ASSET_BLOCKED");
  });

  it("rotates both seats of a loveseat with its footprint", () => {
    const seats = getPlacedAssetInteractions(object("sofa-loveseat", 64, 64, 90));
    expect(seats.map((seat) => seat.direction)).toEqual(["left", "left"]);
    expect(seats.map((seat) => seat.center)).toEqual([{ x: 88, y: 80 }, { x: 88, y: 112 }]);
    expect(seats.map((seat) => seat.cells.length)).toEqual([6, 6]);
  });

  it("keeps all interactive game assets buildable", () => {
    for (const id of ["equipment-falling-blocks", "equipment-tic-tac-toe", "equipment-chess"]) {
      const asset = requireAssetDefinition(id);
      expect(asset.buildable).toBe(true);
      expect(asset.radius).toBe(124);
    }
    expect(requireAssetDefinition("infrastructure-portal").buildable).toBe(false);
  });
});

function object(assetId: string, x: number, y: number, rotation: AssetRotation = 0): WorldObject {
  return { id: `${assetId}:${x}:${y}`, floorId: "floor", assetId, x, y, rotation, variantId: getDefaultAssetVariantId(requireAssetDefinition(assetId)) };
}

function layout(objects: WorldObject[]): FloorLayout {
  return { floorId: "floor", revision: 1, objects, walls: [], openings: [], tiles: [], rooms: [] };
}
