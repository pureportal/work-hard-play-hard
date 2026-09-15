import {
  ASSET_CATALOG, ASSET_RASTER_SIZE, ASSET_ROTATIONS, BUILD_GRID_SIZE,
  getAssetCollisionRects, getAssetPlacementError, getAssetVariants,
  getDefaultAssetVariantId, getPlacedAssetCells, getPlacedAssetInteractions,
  requireAssetDefinition, type AssetRotation, type FloorLayout, type WorldObject,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";

describe("expanded world catalog", () => {
  it("keeps the complete Build and Shop collection in each category", () => {
    const major = new Set(["desks", "seating", "tables", "decor", "floor-types"]);
    for (const category of ASSET_CATALOG.categories) {
      const assets = ASSET_CATALOG.assets.filter(asset => asset.category === category.id);
      const minimum = major.has(category.id) ? 30 : 10;
      expect(new Set(assets.filter(asset => asset.buildable).map(asset => asset.id)).size, `${category.name}: Build`).toBeGreaterThanOrEqual(minimum);
      expect(new Set(assets.filter(asset => asset.shop).map(asset => asset.id)).size, `${category.name}: Shop`).toBeGreaterThanOrEqual(minimum);
    }
    expect(ASSET_CATALOG.assets.filter(asset => asset.category === "floor-types").every(asset => asset.kind === "floor-tile")).toBe(true);
    expect(ASSET_CATALOG.assets.filter(asset => asset.category === "floor-decorations").every(asset => asset.kind === "rug")).toBe(true);
  });

  it.each(ASSET_ROTATIONS)("keeps pergola posts solid and the space below its roof usable at %s degrees", rotation => {
    const pergola = object("outdoor-pergola", 128, 128, rotation);
    const cells = getPlacedAssetCells(pergola);
    const clear = cells.filter(cell => !cell.solid);
    const occupied = cells.filter(cell => cell.solid);
    expect(occupied).toHaveLength(4);
    expect(getAssetCollisionRects(layout([pergola]))).toHaveLength(4);
    const minX = Math.min(...clear.map(cell => cell.worldX));
    const minY = Math.min(...clear.map(cell => cell.worldY));
    const chair = object("chair-office", minX + 32, minY + 32);
    expect(getAssetPlacementError(layout([pergola]), { width: 512, height: 512 }, chair)).toBeUndefined();
    expect(getAssetPlacementError(layout([chair]), { width: 512, height: 512 }, pergola)).toBeUndefined();
    const blocked = object("chair-office", occupied[0]!.worldX, occupied[0]!.worldY);
    expect(getAssetPlacementError(layout([pergola]), { width: 512, height: 512 }, blocked)).toBe("ASSET_BLOCKED");
  });

  it.each(ASSET_ROTATIONS)("reserves fixed desktop equipment and keeps usable surfaces at %s degrees", rotation => {
    for (const id of ["desk-music", "desk-animation", "desk-jeweler", "desk-computer-hutch", "table-nesting", "table-kotatsu", "table-lift"]) {
      const desk = object(id, 128, 128, rotation);
      const cells = getPlacedAssetCells(desk);
      const usable = cells.find(cell => cell.allows.includes("decoration"))!;
      const reserved = cells.find(cell => !cell.allows.includes("decoration"))!;
      expect(getAssetPlacementError(layout([desk]), { width: 512, height: 512 }, object("decor-pencil-cup", usable.worldX, usable.worldY))).toBeUndefined();
      expect(getAssetPlacementError(layout([desk]), { width: 512, height: 512 }, object("decor-pencil-cup", reserved.worldX, reserved.worldY))).toBe("ASSET_REQUIRES_SURFACE");
    }
  });

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
