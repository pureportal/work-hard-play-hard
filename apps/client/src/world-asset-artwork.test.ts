import { ASSET_CATALOG, ASSET_RASTER_SIZE, ASSET_ROTATIONS, getAssetRasterSize, getAssetVariants, requireAssetDefinition } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { getWorldAssetArtwork } from "./world-asset-artwork";

describe("Blockbench world artwork", () => {
  it("uses one calibrated scale for every model, material, and rotation", () => {
    for (const asset of ASSET_CATALOG.assets) for (const variant of getAssetVariants(asset)) for (const rotation of ASSET_ROTATIONS) {
      const view = getWorldAssetArtwork(asset, variant.id, rotation);
      expect(view.bounds.width / view.frame.width, `${asset.id}/${rotation}`).toBeCloseTo(1 / 6);
      expect(view.bounds.height / view.frame.height).toBeCloseTo(1 / 6);
      expect(view.frame.x).toBeGreaterThanOrEqual(2);
      expect(view.frame.y).toBeGreaterThanOrEqual(2);
      expect(view.frame.x + view.frame.width).toBeLessThanOrEqual(view.atlasWidth - 2);
      expect(view.frame.y + view.frame.height).toBeLessThanOrEqual(view.atlasHeight - 2);
      if (asset.placement.layer === "ground") {
        const footprint = getAssetRasterSize(asset, rotation);
        expect(view.bounds).toEqual({ x: 0, y: 0, width: footprint.width * ASSET_RASTER_SIZE, height: footprint.height * ASSET_RASTER_SIZE });
      }
    }
  });

  it("retains the approved lounge base alignment in all four views", () => {
    for (const id of ["decor-shoji-screen", "breakroom-tea-cart", "plant-sakura"]) {
      const asset = requireAssetDefinition(id);
      for (const variant of getAssetVariants(asset)) for (const rotation of ASSET_ROTATIONS) {
        const view = getWorldAssetArtwork(asset, variant.id, rotation);
        const footprint = getAssetRasterSize(asset, rotation);
        expect(Math.abs(view.bounds.y + view.bounds.height - footprint.height * ASSET_RASTER_SIZE)).toBeLessThan(3);
        expect(Math.abs(view.bounds.x + view.bounds.width / 2 - footprint.width * ASSET_RASTER_SIZE / 2)).toBeLessThan(0.5);
      }
    }
  });

  it("rejects a material outside the asset's theme", () => {
    expect(() => getWorldAssetArtwork(requireAssetDefinition("chair-office"), "wood", 0)).toThrow();
  });

  it("keeps animated frames in their rotation with a fixed scale and anchor", () => {
    for (const id of ["decor-wind-chimes", "decor-pinwheel"]) {
      const asset = requireAssetDefinition(id);
      for (const variant of getAssetVariants(asset)) for (const rotation of ASSET_ROTATIONS) {
        const view = getWorldAssetArtwork(asset, variant.id, rotation);
        expect(view.animation?.frames).toHaveLength(16);
        expect(view.animation?.frameDuration).toBe(100);
        expect(view.animation?.frames[0]).toEqual(view.frame);
        for (const frame of view.animation!.frames) {
          expect(frame.width).toBe(view.frame.width);
          expect(frame.height).toBe(view.frame.height);
          expect(frame.x + frame.width).toBeLessThanOrEqual(view.atlasWidth - 2);
          expect(frame.y + frame.height).toBeLessThanOrEqual(view.atlasHeight - 2);
        }
        expect(new Set(view.animation!.frames.map(frame => `${frame.x}:${frame.y}`)).size).toBe(16);
        expect(view.atlasWidth).toBeLessThanOrEqual(4096);
        expect(view.atlasHeight).toBeLessThanOrEqual(4096);
      }
    }
  });
});
