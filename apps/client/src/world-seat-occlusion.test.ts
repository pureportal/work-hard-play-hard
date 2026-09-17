import { ASSET_CATALOG, ASSET_ROTATIONS } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { getSeatOcclusionArtwork } from "./world-seat-occlusion";

describe("seating occlusion artwork", () => {
  it("covers every seat and orientation, including seats with no raised foreground", () => {
    for (const asset of ASSET_CATALOG.assets) for (const interaction of asset.interactions ?? []) for (const rotation of ASSET_ROTATIONS) {
      const region = getSeatOcclusionArtwork(asset.id, interaction.id, rotation);
      if (!region) continue;
      expect(region.bounds.width / region.frame.width).toBeCloseTo(1 / 6);
      expect(region.bounds.height / region.frame.height).toBeCloseTo(1 / 6);
      expect(region.frame.x).toBeGreaterThanOrEqual(2);
      expect(region.frame.y).toBeGreaterThanOrEqual(2);
      expect(region.frame.x + region.frame.width).toBeLessThanOrEqual(region.atlasWidth - 2);
      expect(region.frame.y + region.frame.height).toBeLessThanOrEqual(region.atlasHeight - 2);
    }
  });

  it("leaves backless stools unobstructed in every direction", () => {
    for (const rotation of ASSET_ROTATIONS) {
      expect(getSeatOcclusionArtwork("chair-stool", "seat", rotation)).toBeUndefined();
      expect(getSeatOcclusionArtwork("chair-ottoman", "seat", rotation)).toBeUndefined();
      expect(getSeatOcclusionArtwork("chair-drum", "seat-1", rotation)).toBeUndefined();
    }
  });

  it("retains daybed bolsters even though it has no backrest", () => {
    expect(getSeatOcclusionArtwork("sofa-daybed", "seat-1", 90)).toBeDefined();
    expect(getSeatOcclusionArtwork("sofa-daybed", "seat-1", 270)).toBeDefined();
  });

  it("keeps a curved back behind a forward-facing occupant", () => {
    expect(getSeatOcclusionArtwork("chair-beanbag", "seat", 0)).toBeUndefined();
    expect(getSeatOcclusionArtwork("chair-beanbag", "seat", 180)).toBeDefined();
  });

  it("uses each corner sofa seat's depth instead of the character's facing direction", () => {
    expect(getSeatOcclusionArtwork("sofa-corner", "seat-corner", 0))
      .not.toEqual(getSeatOcclusionArtwork("sofa-corner", "seat-bottom", 0));
  });

  it("rejects missing seat metadata", () => {
    expect(() => getSeatOcclusionArtwork("chair-office", "missing", 0)).toThrow("Missing seat occlusion");
  });
});
