import { Container } from "pixi.js";
import { getOpeningArtworkRect, getWallOrientation, getWallSolidRects, type FloorLayout, type Rect } from "@workhard/shared";
import artworkSource from "./world-architecture-artwork.json";
import type { ColorTheme } from "./theme";
import type { WorldAssetArtwork } from "./world-asset-artwork";
import type { WorldAssetTextures } from "./world-asset-textures";

type ArchitectureKind = keyof typeof artworkSource;

export function getArchitectureArtwork(kind: ArchitectureKind, rotation: 0 | 90 | 180 | 270): WorldAssetArtwork {
  const variant = artworkSource[kind].variants.plaster;
  return {
    path: variant.path, frame: variant.frames[rotation / 90]!, bounds: variant.bounds[rotation / 90]!,
    atlasWidth: variant.width, atlasHeight: variant.height, seatOffset: 0, seatHasBack: false,
  };
}

export function createWorldArchitecture(textures: WorldAssetTextures, layout: FloorLayout, theme: ColorTheme, onError: (error: Error) => void): Container {
  const container = new Container({ label: "world-architecture" });
  const dark = theme === "dark";
  const draw = (kind: ArchitectureKind, rect: Rect, vertical: boolean, restricted = false) => {
    const artwork = getArchitectureArtwork(kind, vertical ? 90 : 0);
    const sprite = textures.createSprite({ ...artwork, bounds: rect }, onError);
    sprite.tint = restricted ? dark ? 0x9683ac : 0xb49bc9 : dark ? 0x858398 : 0xffffff;
    container.addChild(sprite);
  };
  for (const wall of layout.walls) {
    const vertical = getWallOrientation(wall) === "vertical";
    for (const rect of getWallSolidRects(wall, layout.openings)) {
      const artwork = getArchitectureArtwork("wall", vertical ? 90 : 0);
      const length = vertical ? rect.height : rect.width;
      for (let offset = 0; offset < length; offset += 32) {
        const size = Math.min(32, length - offset);
        const sprite = textures.createSprite({
          ...artwork,
          frame: { ...artwork.frame, width: vertical ? artwork.frame.width : size * 6, height: vertical ? size * 6 : artwork.frame.height },
          bounds: { x: rect.x + (vertical ? 0 : offset), y: rect.y + (vertical ? offset : 0), width: vertical ? rect.width : size, height: vertical ? size : rect.height },
        }, onError);
        sprite.tint = dark ? 0x858398 : 0xffffff;
        container.addChild(sprite);
      }
    }
  }
  const walls = new Map(layout.walls.map(wall => [wall.id, wall]));
  for (const opening of layout.openings) {
    const wall = walls.get(opening.wallId);
    if (!wall) continue;
    const restricted = opening.type === "door" && layout.rooms.some(room => room.doorIds.includes(opening.id) && room.access.mode === "assigned");
    draw(opening.type, getOpeningArtworkRect(wall, opening), getWallOrientation(wall) === "vertical", restricted);
  }
  return container;
}
