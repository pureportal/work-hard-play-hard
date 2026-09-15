import { describe, expect, it } from "vitest";
import { ASSET_CATALOG, ASSET_ROTATIONS, getPlacedAssetCells, requireAssetDefinition, type FloorLayout, type WorldObject } from "@workhard/shared";
import { getWorldAssetArtwork, getWorldAssetSurfaceHeight } from "./world-asset-artwork";
import { getPlacedWorldAssetArtwork, getWorldAssetPlacementPosition, getWorldAssetSurfaceOffset } from "./world-asset-placement";

function layoutWith(...objects: WorldObject[]): FloorLayout {
  return { floorId: "floor", revision: 1, objects, walls: [], openings: [], rooms: [], tiles: [] };
}

describe("decorations on modeled surfaces", () => {
  it("aligns artwork and pointer placement with every rotated supporting surface", () => {
    for (const asset of ASSET_CATALOG.assets.filter(asset => asset.footprint.some(region => region.allows?.includes("decoration")))) {
      for (const rotation of ASSET_ROTATIONS) {
        const support: WorldObject = { id: "support", assetId: asset.id, variantId: "unused", rotation, floorId: "floor", x: 160, y: 160 };
        const cell = getPlacedAssetCells(support).find(cell => cell.allows.includes("decoration"))!;
        const decoration: WorldObject = { ...support, id: "cup", assetId: "decor-coffee", variantId: "graphite", x: cell.worldX, y: cell.worldY };
        const layout = layoutWith(support, decoration);
        const original = getWorldAssetArtwork(requireAssetDefinition(decoration.assetId), decoration.variantId, rotation);
        const raised = getPlacedWorldAssetArtwork(layout, decoration);
        const offset = -getWorldAssetSurfaceHeight(asset.id) / Math.SQRT2;
        expect(raised.bounds.y - original.bounds.y, `${asset.id}/${rotation}`).toBeCloseTo(offset);
        expect(raised.frame).toEqual(original.frame);
        expect(raised.bounds.width).toBe(original.bounds.width);
        expect(getWorldAssetPlacementPosition(layout, requireAssetDefinition(decoration.assetId), rotation, { x: decoration.x + 8, y: decoration.y + 8 + offset }))
          .toEqual({ x: decoration.x, y: decoration.y });
        expect(getPlacedAssetCells(decoration)[0]).toMatchObject({ worldX: cell.worldX, worldY: cell.worldY, solid: false });
      }
    }
  });

  it("recomputes support after moving or removing furniture", () => {
    const support: WorldObject = { id: "desk", assetId: "desk-standing", variantId: "sage", rotation: 0, floorId: "floor", x: 160, y: 160 };
    const cup: WorldObject = { ...support, id: "cup", assetId: "decor-coffee", variantId: "graphite" };
    const layout = layoutWith(support);
    expect(getWorldAssetSurfaceOffset(layout, cup)).toBeLessThan(-30);
    support.x += 160;
    layout.revision++;
    expect(getWorldAssetSurfaceOffset(layout, cup)).toBe(0);
    layout.objects = [];
    expect(getWorldAssetSurfaceOffset(layout, cup)).toBe(0);
  });
});
