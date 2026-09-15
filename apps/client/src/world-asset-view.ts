import { Container, Graphics, Text, type Sprite } from "pixi.js";
import { getFlooringVisibleRects, getPlacedAssetBounds, requireAssetDefinition, type FloorLayout, type WorldObject } from "@workhard/shared";
import type { ColorTheme } from "./theme";
import { getPlacedWorldAssetArtwork } from "./world-asset-placement";
import { WorldAssetTextures } from "./world-asset-textures";
import { createWaterAnimation } from "./world-water";

export interface WorldAssetView {
  container: Container;
  body: Container;
  animate?: ((now: number) => void) | undefined;
}

export function createWorldAssetView(
  textures: WorldAssetTextures,
  object: WorldObject,
  layout: FloorLayout,
  theme: ColorTheme,
  onError: (error: Error) => void,
): WorldAssetView {
  const definition = requireAssetDefinition(object.assetId);
  const artwork = getPlacedWorldAssetArtwork(layout, object);
  const bounds = getPlacedAssetBounds(object);
  const container = new Container({ label: `world-asset:${object.id}` });
  container.position.set(object.x, object.y);
  const body = new Container({ label: "artwork" });
  const dark = theme === "dark";
  const sprites: Sprite[] = [];
  if (definition.placement.layer !== "ground") {
    const shadow = textures.createSprite(artwork, onError);
    shadow.position.set(artwork.bounds.x + 3, artwork.bounds.y + 4);
    shadow.tint = 0x08090e;
    shadow.alpha = dark ? 0.3 : 0.11;
    body.addChild(shadow);
    sprites.push(shadow);
  }
  const sprite = textures.createSprite(artwork, onError);
  sprite.tint = dark ? 0xe6e6e6 : 0xffffff;
  body.addChild(sprite);
  sprites.push(sprite);
  container.addChild(body);

  if (definition.kind === "floor-tile") {
    const visible = getFlooringVisibleRects(layout, [bounds]);
    if (visible.length !== 1 || visible[0] !== bounds) {
      const mask = new Graphics({ label: "flooring-mask" });
      for (const rect of visible) mask.rect(rect.x - object.x, rect.y - object.y, rect.width, rect.height);
      mask.fill(0xffffff);
      container.addChild(mask);
      body.mask = mask;
    }
  }

  if (object.label) {
    const darkLabel = dark || definition.kind === "arcade" || definition.kind === "game";
    const centerX = bounds.x - object.x + bounds.width / 2;
    const centerY = bounds.y - object.y + bounds.height / 2;
    const label = new Text({
      text: object.label,
      style: {
        fontFamily: "Inter, Segoe UI, sans-serif",
        fontSize: definition.kind === "portal" ? 13 : 11,
        fontWeight: "700",
        fill: darkLabel ? "#ffffff" : "#34313b",
      },
    });
    label.anchor.set(0.5);
    const labelY = definition.kind === "portal" ? centerY : bounds.y - object.y + bounds.height - 11;
    label.position.set(centerX, labelY);
    const plate = new Graphics()
      .roundRect(centerX - label.width / 2 - 6, labelY - label.height / 2 - 3, label.width + 12, label.height + 6, 6)
      .fill({ color: darkLabel ? "#292734" : "#fffdfa", alpha: darkLabel ? 0.82 : 0.72 });
    container.addChild(plate, label);
  }
  const animate = artwork.animation ? textures.createAnimation(sprites, artwork) : createWaterAnimation(body, object);
  animate?.(0);
  return { container, body, animate };
}
