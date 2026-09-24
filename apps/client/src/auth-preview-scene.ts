import { DEFAULT_CHARACTER_APPEARANCE, requireAssetDefinition, type CharacterAppearance, type Position } from "@workhard/shared";
import { Application, Container, Graphics, type Ticker } from "pixi.js";
import "pixi.js/unsafe-eval";
import { PreviewActor } from "./auth-preview-behavior";
import { previewFurnitureObstacles, previewWalls } from "./auth-preview-navigation";
import { CharacterSprite } from "./character-sprite";
import { renderCharacter } from "./character-renderer";
import { getWorldAssetArtwork } from "./world-asset-artwork";
import { WorldAssetTextures } from "./world-asset-textures";
import { createWaterAnimation } from "./world-water";

export const PREVIEW_WIDTH = 512;
export const PREVIEW_HEIGHT = 426;

interface Room {
  x: number;
  y: number;
  width: number;
  height: number;
  floor: string;
  variant: string;
  color: number;
}

const rooms: Room[] = [
  { x: 39, y: 45, width: 216, height: 164, floor: "floor-wood", variant: "oak", color: 0xc7a97c },
  { x: 258, y: 45, width: 215, height: 164, floor: "floor-ceramic", variant: "ivory", color: 0xf7eef1 },
  { x: 39, y: 213, width: 216, height: 164, floor: "floor-carpet", variant: "plush", color: 0xe9e7f7 },
  { x: 258, y: 213, width: 215, height: 164, floor: "floor-grass", variant: "lawn", color: 0xe0eee2 },
];

const guestAppearances: CharacterAppearance[] = [
  { face: "bright", hairstyle: "twintails", upperBody: "festival", lowerBody: "festival", shoes: "festival", headwear: "none" },
  { face: "smile", hairstyle: "pixie", upperBody: "cardigan", lowerBody: "cardigan", shoes: "cardigan", headwear: "none" },
  { face: "calm", hairstyle: "bob", upperBody: "ranger", lowerBody: "ranger", shoes: "ranger", headwear: "beret" },
];

interface Wanderer {
  container: Container;
  shadow: Graphics;
  character?: CharacterSprite;
  actor: PreviewActor;
}

const startingPositions: readonly Position[] = [
  { x: 174, y: 180 },
  { x: 354, y: 180 },
  { x: 294, y: 340 },
  { x: 444, y: 340 },
];

export class AuthPreviewScene {
  private readonly textures = new WorldAssetTextures();
  private readonly groundDecor = new Container();
  private readonly furnishings = new Container({ sortableChildren: true });
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly animations: Array<(now: number) => void> = [];
  private readonly wanderers: Wanderer[] = [];
  private destroyed = false;

  constructor(private readonly app: Application, private readonly onError: (error: Error) => void) {
    this.drawCard();
    this.drawRooms();
    this.app.stage.addChild(this.groundDecor);
    this.drawWalls();
    this.addFurniture();
    this.app.stage.addChild(this.furnishings);
    this.addWanderers();
    this.drawFrame();
    void this.loadCharacters();
    this.app.ticker.add(this.tick);
  }

  destroy(): void {
    this.destroyed = true;
    this.app.ticker.remove(this.tick);
    this.textures.destroy();
    this.app.stage.removeChildren().forEach((child) => child.destroy({ children: true }));
  }

  private drawCard(): void {
    this.app.stage.addChild(new Graphics()
      .roundRect(15, 24, 482, 382, 23).fill({ color: 0xfffbf4 })
      .roundRect(20, 28, 472, 372, 19).stroke({ color: 0xe0d7c8, width: 1 }));
  }

  private drawRooms(): void {
    for (const room of rooms) {
      this.app.stage.addChild(new Graphics().rect(room.x, room.y, room.width, room.height).fill(room.color));
      const tiled = new Container();
      const artwork = getWorldAssetArtwork(requireAssetDefinition(room.floor), room.variant, 0);
      for (let x = room.x; x < room.x + room.width; x += 64) {
        for (let y = room.y; y < room.y + room.height; y += 64) {
          const tile = this.textures.createSprite(artwork, this.onError);
          const cell = new Container();
          cell.position.set(x, y);
          cell.addChild(tile);
          tiled.addChild(cell);
        }
      }
      tiled.alpha = room.floor === "floor-wood" ? 0.95 : 0.48;
      const mask = new Graphics().rect(room.x, room.y, room.width, room.height).fill(0xffffff);
      tiled.mask = mask;
      this.app.stage.addChild(tiled, mask);
    }
  }

  private addFurniture(): void {
    const desk = new Container();
    desk.zIndex = 138;
    this.furnishings.addChild(desk);
    this.addAsset("desk-straight", "oak", 57, 72, 0.92, { parent: desk });
    this.addAsset("decor-laptop", "graphite", 74, 76, 0.57, { parent: desk });
    this.addAsset("decor-coffee", "coral", 118, 83, 0.57, { parent: desk });
    this.addAsset("chair-office", "blue", 95, 130, 0.75);
    this.addAsset("plant-sakura", "sakura", 196, 53, 0.72);

    this.addAsset("decor-shoji-screen", "sakura", 287, 57, 0.8);
    this.addAsset("sofa-straight", "blue", 301, 113, 0.78);
    this.addAsset("table-coffee", "white", 371, 161, 0.72);
    this.addAsset("breakroom-coffee-bar", "cherry", 405, 101, 0.55);
    this.addAsset("plant-zz", "porcelain", 445, 54, 0.58);

    this.addAsset("equipment-arcade", "graphite", 50, 226, 0.72);
    this.addAsset("equipment-chess", "white", 123, 259, 0.81);
    this.addAsset("plant-sakura", "sakura", 223, 244, 0.58);

    this.addAsset("outdoor-bench", "white", 277, 227, 0.86);
    this.addAsset("outdoor-koi-pond", "coastal", 315, 298, 0.85, { parent: this.groundDecor });
    this.addAsset("plant-sakura", "sakura", 442, 231, 0.66);
  }

  private addAsset(
    assetId: string,
    variantId: string,
    x: number,
    y: number,
    scale: number,
    options: { parent?: Container } = {},
  ): void {
    const artwork = getWorldAssetArtwork(requireAssetDefinition(assetId), variantId, 0);
    const container = new Container({ label: `preview-asset:${assetId}` });
    container.position.set(x - artwork.bounds.x * scale, y - artwork.bounds.y * scale);
    container.scale.set(scale);
    container.zIndex = y + artwork.bounds.height * scale;
    const sprite = this.textures.createSprite(artwork, this.onError);
    container.addChild(sprite);
    (options.parent ?? this.furnishings).addChild(container);
    const animate = this.textures.createAnimation([sprite], artwork);
    if (animate) this.animations.push(animate);
    if (assetId === "outdoor-koi-pond") {
      const water = createWaterAnimation(container, { id: "preview-pond", floorId: "preview", assetId, variantId, x: 0, y: 0, rotation: 0 });
      if (water) this.animations.push(water);
    }
  }

  private addWanderers(): void {
    startingPositions.forEach((position, index) => {
      const container = new Container({ label: "preview-wanderer" });
      container.position.set(position.x, position.y);
      container.zIndex = position.y;
      const shadow = new Graphics().ellipse(0, 0, 8, 3).fill({ color: 0x302b38, alpha: 0.22 });
      container.addChild(shadow);
      this.furnishings.addChild(container);
      this.wanderers.push({
        container,
        shadow,
        actor: new PreviewActor(index, position, previewFurnitureObstacles),
      });
    });
  }

  private async loadCharacters(): Promise<void> {
    try {
      await Promise.all([DEFAULT_CHARACTER_APPEARANCE, ...guestAppearances].map(async (appearance, index) => {
        const atlas = await renderCharacter(appearance);
        if (this.destroyed) return;
        const character = new CharacterSprite(atlas);
        character.sprite.scale.set(index === 0 ? 0.49 : 0.46);
        const wanderer = this.wanderers[index]!;
        wanderer.character = character;
        wanderer.container.addChild(character.sprite);
      }));
    } catch (error) {
      if (!this.destroyed) this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private drawWalls(): void {
    const walls = new Graphics();
    for (const wall of previewWalls) walls.rect(wall.x, wall.y, wall.width, wall.height).fill(0xb49c86);
    this.app.stage.addChild(walls);
  }

  private drawFrame(): void {
    this.app.stage.addChild(new Graphics()
      .rect(35, 41, 442, 4).fill(0xa68e78)
      .rect(35, 377, 442, 4).fill(0xa68e78)
      .rect(35, 41, 4, 340).fill(0xa68e78)
      .rect(473, 41, 4, 340).fill(0xa68e78));
  }

  private readonly tick = (ticker: Ticker): void => {
    const now = this.reducedMotion.matches ? 0 : performance.now();
    for (const animate of this.animations) animate(now);
    const reserved = new Set(this.wanderers.flatMap(({ actor }) => actor.activity ? [actor.activity.id] : []));
    for (const wanderer of this.wanderers) {
      const { actor, character, container } = wanderer;
      if (!this.reducedMotion.matches && character) {
        actor.advance(ticker.deltaMS, reserved);
        if (actor.activity) reserved.add(actor.activity.id);
      }
      container.position.set(actor.position.x, actor.position.y);
      container.zIndex = actor.position.y;
      wanderer.shadow.visible = actor.motion !== "sit";
      if (character) {
        character.sprite.y = actor.seatOffsetY;
        character.update(now, this.reducedMotion.matches ? "idle" : actor.motion, actor.direction);
      }
    }
  };
}
