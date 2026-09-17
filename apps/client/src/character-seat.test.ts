import { ASSET_CATALOG, ASSET_ROTATIONS, getDefaultAssetVariantId, getPlacedAssetInteractions, type WorldObject } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { getCharacterSeatLayout } from "./character-seat";

const officeChair: WorldObject = Object.freeze({ id: "chair", floorId: "floor-studio", assetId: "chair-office", variantId: "white", rotation: 0, x: 96, y: 64 });

describe("seated character contact", () => {
  it.each([
    [0, 0, 7], [90, -7, 0], [180, 0, -7], [270, 7, 0],
  ] as const)("turns the forward placement with the seat at %s degrees", (rotation, x, y) => {
    const chair = { ...officeChair, rotation };
    const layout = getCharacterSeatLayout(chair, "seat");
    expect(layout.offsetX).toBe(x);
    expect(layout.offsetY).toBeCloseTo(y - 21.5 / Math.SQRT2);
    expect(getCharacterSeatLayout({ ...chair, x: 1000, y: -500 }, "seat")).toEqual(layout);
  });

  it("covers every seat and rotation with a contact point inside its cushion", () => {
    for (const asset of ASSET_CATALOG.assets.filter(asset => asset.interactions?.length)) for (const rotation of ASSET_ROTATIONS) {
      const object = { ...officeChair, assetId: asset.id, variantId: getDefaultAssetVariantId(asset), rotation };
      for (const interaction of getPlacedAssetInteractions(object)) {
        const layout = getCharacterSeatLayout(object, interaction.id);
        expect(Number.isFinite(layout.offsetX) && Number.isFinite(layout.offsetY)).toBe(true);
        expect(Math.abs(layout.offsetX)).toBeLessThan(interaction.bounds.width / 2);
        expect(["chair", "floor"]).toContain(layout.pose);
      }
    }
  });

  it("uses each corner-sofa cushion's facing", () => {
    const sofa = { ...officeChair, assetId: "sofa-corner" };
    expect(getCharacterSeatLayout(sofa, "seat-top").offsetX).toBe(0);
    expect(getCharacterSeatLayout(sofa, "seat-middle").offsetX).toBe(-7);
  });

  it("extends the legs only for floor seating and clears placement when standing", () => {
    expect(getCharacterSeatLayout({ ...officeChair, assetId: "chair-zaisu" }, "seat-1").pose).toBe("floor");
    expect(getCharacterSeatLayout(officeChair, "seat").pose).toBe("chair");
    expect(getCharacterSeatLayout(undefined, undefined)).toEqual({ offsetX: 0, offsetY: 0, pose: "chair" });
  });

  it("raises tall stools and seats deep cushions nearer their front edge", () => {
    const chair = getCharacterSeatLayout(officeChair, "seat");
    expect(getCharacterSeatLayout({ ...officeChair, assetId: "chair-stool" }, "seat").offsetY).toBeCloseTo(chair.offsetY - 7 / Math.SQRT2);
    expect(getCharacterSeatLayout({ ...officeChair, assetId: "chair-lounge" }, "seat").offsetY).toBeGreaterThan(chair.offsetY);
  });
});
