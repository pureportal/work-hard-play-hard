import { Container, Sprite } from "pixi.js";
import { getDefaultAssetVariantId, requireAssetDefinition, type WorldObject } from "@workhard/shared";
import { describe, expect, it, vi } from "vitest";
import { CharacterSeat } from "./character-seat";
import { getWorldAssetArtwork } from "./world-asset-artwork";
import { WorldAssetTextures } from "./world-asset-textures";

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillStyle: "", fillRect: vi.fn(), globalCompositeOperation: "",
    getImageData: vi.fn(() => ({ data: [0, 0, 0, 0] })),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

function scene() {
  const parent = new Container();
  const avatar = new Container();
  parent.addChild(avatar);
  const textures = new WorldAssetTextures();
  vi.spyOn(textures, "createSprite").mockImplementation(() => new Sprite());
  return { parent, avatar, seat: new CharacterSeat(avatar, textures, vi.fn()) };
}

const officeChair: WorldObject = Object.freeze({ id: "chair", floorId: "floor-studio", assetId: "chair-office", variantId: "white", rotation: 180, x: 96, y: 64 });

describe("seated character rendering", () => {
  it("keeps the backrest fixed to the chair while the character settles into the seat", () => {
    const { parent, avatar, seat } = scene();
    const artwork = getWorldAssetArtwork(requireAssetDefinition(officeChair.assetId), officeChair.variantId, officeChair.rotation);
    expect(seat.update(officeChair, "up")).toBe(artwork.bounds.y / 2);
    const mask = avatar.mask as Sprite;
    expect(parent.children).toContain(mask);
    expect(mask.renderable).toBe(false);
    for (const position of [{ x: 80, y: 100 }, { x: 96, y: 80 }]) {
      parent.position.set(position.x, position.y);
      seat.align(position.x, position.y);
      expect(mask.x + parent.x).toBeCloseTo(officeChair.x + artwork.bounds.x);
      expect(mask.y + parent.y).toBeCloseTo(officeChair.y + artwork.bounds.y);
    }
    seat.update(undefined, "up");
    expect(avatar.mask).toBeUndefined();
    expect(mask.destroyed).toBe(true);
    expect(parent.children).toEqual([avatar]);
    parent.destroy({ children: true });
  });

  it("places the furniture in front only when the character faces away", () => {
    const { parent, avatar, seat } = scene();
    for (const direction of ["down", "left", "right"] as const) {
      seat.update(officeChair, direction);
      expect(avatar.mask).toBeUndefined();
    }
    for (const assetId of ["chair-stool", "chair-ottoman", "chair-beanbag"]) {
      const definition = requireAssetDefinition(assetId);
      seat.update({ ...officeChair, assetId, variantId: getDefaultAssetVariantId(definition) }, "up");
      expect(avatar.mask).toBeInstanceOf(Sprite);
    }
    expect(seat.update(undefined, "down")).toBe(0);
    parent.destroy({ children: true });
  });

  it("raises the character to the tall stool's cushion", () => {
    const { parent, seat } = scene();
    const chairOffset = seat.update(officeChair, "down");
    for (const rotation of [0, 90, 180, 270] as const) {
      const stoolOffset = seat.update({ ...officeChair, assetId: "chair-stool", rotation }, "down");
      expect(stoolOffset).toBeLessThan(chairOffset - 10);
    }
    parent.destroy({ children: true });
  });
});
