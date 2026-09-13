import { Container, Graphics, Text } from "pixi.js";
import { getPlacedAssetBounds, requireAssetDefinition, type WorldObject } from "@workhard/shared";
import type { ColorTheme } from "./theme";
import { getWorldAssetArtwork } from "./world-asset-artwork";
import { WorldAssetTextures } from "./world-asset-textures";

export interface WorldAssetView {
  container: Container;
  body: Container;
}

export function createWorldAssetView(
  textures: WorldAssetTextures,
  object: WorldObject,
  theme: ColorTheme,
  onError: (error: Error) => void,
): WorldAssetView {
  const definition = requireAssetDefinition(object.assetId);
  const artwork = getWorldAssetArtwork(definition, object.variantId, object.rotation);
  const bounds = getPlacedAssetBounds(object);
  const container = new Container({ label: `world-asset:${object.id}` });
  container.position.set(object.x, object.y);
  const body = new Container({ label: "artwork" });
  const dark = theme === "dark";
  if (definition.placement.layer !== "ground") {
    const shadow = textures.createSprite(artwork, onError);
    shadow.position.set(artwork.bounds.x + 3, artwork.bounds.y + 4);
    shadow.tint = 0x08090e;
    shadow.alpha = dark ? 0.3 : 0.11;
    body.addChild(shadow);
  }
  const sprite = textures.createSprite(artwork, onError);
  sprite.tint = dark ? 0xe6e6e6 : 0xffffff;
  body.addChild(sprite);
  container.addChild(body);

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
  return { container, body };
}
