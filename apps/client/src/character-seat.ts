import { getPlacedAssetInteraction, requireAssetDefinition, type CharacterSeatedPose, type WorldObject } from "@workhard/shared";
import type { Container, Sprite } from "pixi.js";
import { getWorldAssetArtwork } from "./world-asset-artwork";
import { getSeatOcclusionArtwork } from "./world-seat-occlusion";
import type { WorldAssetTextures, WorldTextureRegion } from "./world-asset-textures";
import layoutSource from "./world-seat-layout.json";

const layouts = layoutSource as Record<string, { forward: number; surface: number; pose?: CharacterSeatedPose }>;

export function getCharacterSeatLayout(object: WorldObject | undefined, interactionId: string | undefined): { offsetX: number; offsetY: number; pose: CharacterSeatedPose } {
  if (!object || !interactionId) return { offsetX: 0, offsetY: 0, pose: "chair" };
  const layout = layouts[object.assetId];
  const interaction = getPlacedAssetInteraction(object, interactionId);
  if (!layout || !interaction) throw new Error(`Missing seat layout: ${object.assetId}/${interactionId}`);
  const artwork = getWorldAssetArtwork(requireAssetDefinition(object.assetId), object.variantId, object.rotation);
  const direction = { down: [0, 1], left: [-1, 0], up: [0, -1], right: [1, 0] }[interaction.direction]!;
  return {
    offsetX: direction[0]! * layout.forward,
    offsetY: direction[1]! * layout.forward + artwork.seatOffset - (layout.surface + 3) / Math.SQRT2,
    pose: layout.pose ?? "chair",
  };
}

export class CharacterSeatOcclusion {
  private key: string | undefined;
  private support: Container | undefined;
  private mask: Sprite | undefined;
  private artwork: WorldTextureRegion | undefined;

  constructor(private readonly avatar: Container, private readonly textures: WorldAssetTextures, private readonly onError: (error: Error) => void) {
    avatar.once("destroyed", () => this.clear());
  }

  setSeat(object: WorldObject | undefined, interactionId: string | undefined, support: Container | undefined): void {
    const key = object && interactionId ? `${object.assetId}:${object.rotation}:${interactionId}` : undefined;
    if (key === this.key && support === this.support) return;
    this.clear();
    this.key = key;
    this.support = support;
    if (!object || !interactionId || !support) return;
    this.artwork = getSeatOcclusionArtwork(object.assetId, interactionId, object.rotation);
    if (!this.artwork) return;
    this.mask = this.textures.createSprite(this.artwork, this.onError);
    this.mask.label = "seat-occlusion";
    this.avatar.parent!.addChild(this.mask);
    this.avatar.setMask({ mask: this.mask, inverse: true, channel: "alpha" });
    this.update();
  }

  update(): void {
    if (!this.mask || !this.artwork || !this.support) return;
    if (this.support.destroyed) {
      this.clear();
      return;
    }
    const parent = this.avatar.parent!;
    const { bounds } = this.artwork;
    this.mask.position.set(this.support.x + bounds.x * this.support.scale.x - parent.x,
      this.support.y + bounds.y * this.support.scale.y - parent.y);
    this.mask.width = bounds.width * this.support.scale.x;
    this.mask.height = bounds.height * this.support.scale.y;
  }

  private clear(): void {
    if (!this.avatar.destroyed) this.avatar.mask = null;
    this.mask?.destroy();
    this.mask = undefined;
    this.artwork = undefined;
    this.support = undefined;
    this.key = undefined;
  }
}
