import { ASSET_ROTATIONS, requireAssetDefinition, type WorldObject } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { getCharacterSeatLayout } from "./character-seat";
import { getWorldAssetArtwork } from "./world-asset-artwork";

const officeChair: WorldObject = Object.freeze({ id: "chair", floorId: "floor-studio", assetId: "chair-office", variantId: "white", rotation: 180, x: 96, y: 64 });

describe("seated character rendering", () => {
  it.each(ASSET_ROTATIONS)("aligns the seat anchor with the cushion at %s degrees", (rotation) => {
    const chair = { ...officeChair, rotation };
    const artwork = getWorldAssetArtwork(requireAssetDefinition(chair.assetId), chair.variantId, rotation);
    expect(getCharacterSeatLayout(chair).offsetY).toBe(artwork.seatOffset);
    expect(getCharacterSeatLayout(chair).offsetY).toBeCloseTo(-17 / Math.SQRT2);
    expect(getCharacterSeatLayout({ ...chair, x: 1000, y: -500 })).toEqual(getCharacterSeatLayout(chair));
  });

  it("removes the seat lift when standing", () => {
    expect(getCharacterSeatLayout(undefined)).toEqual({ offsetY: 0, hasBack: false });
  });

  it("raises the character to the tall stool's cushion", () => {
    const chairOffset = getCharacterSeatLayout(officeChair).offsetY;
    for (const rotation of ASSET_ROTATIONS) {
      const stoolOffset = getCharacterSeatLayout({ ...officeChair, assetId: "chair-stool", rotation }).offsetY;
      expect(stoolOffset).toBeLessThan(chairOffset - 4);
    }
  });

  it("keeps backless seats from occluding the seated torso", () => {
    for (const assetId of ["chair-stool", "chair-ottoman"]) {
      expect(getCharacterSeatLayout({ ...officeChair, assetId }).hasBack).toBe(false);
    }
    expect(getCharacterSeatLayout(officeChair).hasBack).toBe(true);
  });
});
