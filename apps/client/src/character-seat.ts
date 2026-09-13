import type { Container, Sprite } from "pixi.js";
import { requireAssetDefinition, type CharacterDirection, type WorldObject } from "@workhard/shared";
import { getWorldAssetArtwork } from "./world-asset-artwork";
import type { WorldAssetTextures } from "./world-asset-textures";

export class CharacterSeat {
  private mask: Sprite | undefined;
  private maskKey: string | undefined;
  private maskX = 0;
  private maskY = 0;

  constructor(
    private readonly avatar: Container,
    private readonly textures: WorldAssetTextures,
    private readonly onError: (error: Error) => void,
  ) {}

  update(object: WorldObject | undefined, direction: CharacterDirection): number {
    const artwork = object && getWorldAssetArtwork(requireAssetDefinition(object.assetId), object.variantId, object.rotation);
    const key = object && direction === "up"
      ? `${object.id}:${object.assetId}:${object.variantId}:${object.rotation}` : undefined;
    if (key !== this.maskKey) {
      this.avatar.mask = null;
      this.mask?.destroy();
      this.mask = undefined;
      this.maskKey = key;
      if (key && artwork) {
        this.mask = this.textures.createSprite(artwork, this.onError);
        this.avatar.parent!.addChild(this.mask);
        this.avatar.setMask({ mask: this.mask, inverse: true, channel: "alpha" });
      }
    }
    if (this.mask && object && artwork) {
      this.maskX = object.x + artwork.bounds.x;
      this.maskY = object.y + artwork.bounds.y;
    }
    if (!artwork) return 0;
    const cushionLift = object?.assetId === "chair-stool" ? artwork.bounds.height * 0.34 : 0;
    return artwork.bounds.y / 2 - cushionLift;
  }

  align(x: number, y: number): void {
    this.mask?.position.set(this.maskX - x, this.maskY - y);
  }
}
