import { ASSET_CATALOG, ASSET_RASTER_SIZE, ASSET_ROTATIONS, getAssetRasterSize, getAssetVariants, requireAssetDefinition } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { getWorldAssetArtwork } from "./world-asset-artwork";

describe("world artwork placement", () => {
  it("anchors every design and direction within its rotated footprint", () => {
    for (const asset of ASSET_CATALOG.assets) {
      for (const variant of getAssetVariants(asset)) {
        const front = getWorldAssetArtwork(asset, variant.id, 0);
        for (const rotation of ASSET_ROTATIONS) {
          const view = getWorldAssetArtwork(asset, variant.id, rotation);
          const footprint = getAssetRasterSize(asset, rotation);
          expect(view.bounds.width).toBeLessThanOrEqual(footprint.width * ASSET_RASTER_SIZE + 0.0001);
          expect(view.bounds.y).toBeCloseTo(front.bounds.y);
          expect(view.bounds.x + view.bounds.width / 2).toBeCloseTo(footprint.width * ASSET_RASTER_SIZE / 2);
          expect(view.bounds.y + view.bounds.height).toBeCloseTo(footprint.height * ASSET_RASTER_SIZE);
          expect(view.frame.x).toBeGreaterThanOrEqual(2);
          expect(view.frame.y).toBeGreaterThanOrEqual(2);
          expect(view.frame.x + view.frame.width).toBeLessThanOrEqual(view.atlasWidth - 2);
          expect(view.frame.y + view.frame.height).toBeLessThanOrEqual(view.atlasHeight - 2);
        }
      }
    }
  });

  it("maps long furniture to its cells while preserving thin upright profiles", () => {
    for (const assetId of ["sofa-straight", "storage-cubby", "equipment-bookshelf", "breakroom-coffee-bar", "plant-planter-row", "decor-books"]) {
      const asset = requireAssetDefinition(assetId);
      const variant = getAssetVariants(asset)[0]!;
      const front = getWorldAssetArtwork(asset, variant.id, 0);
      const side = getWorldAssetArtwork(asset, variant.id, 90);
      const footprint = getAssetRasterSize(asset, 90);
      expect(side.bounds.width).toBe(footprint.width * ASSET_RASTER_SIZE);
      expect(side.bounds.height).toBe(footprint.height * ASSET_RASTER_SIZE - front.bounds.y);
    }
    for (const rotation of [90, 270] as const) {
      const gong = getWorldAssetArtwork(requireAssetDefinition("equipment-gong"), "graphite", rotation);
      expect(gong.bounds.width / gong.bounds.height).toBeCloseTo(gong.frame.width / gong.frame.height);
    }
  });

  it("rejects a design that is not in the asset theme", () => {
    expect(() => getWorldAssetArtwork(requireAssetDefinition("chair-office"), "wood", 0)).toThrow();
  });
});
