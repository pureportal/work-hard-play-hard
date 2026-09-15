import { Rectangle, Sprite, Texture } from "pixi.js";
import {
  CHARACTER_ANIMATIONS, CHARACTER_CANVAS_SIZE, CHARACTER_DIRECTIONS, CHARACTER_FOOT_ANCHOR,
  CHARACTER_WORLD_SIZE, CHARACTER_SEAT_ANCHOR,
  getCharacterFrame, type CharacterDirection, type CharacterMotion,
} from "@workhard/shared";
import { CharacterAnimation } from "./character-animation";

interface CharacterTextures {
  texture: Texture;
  frames: Map<string, Texture>;
  users: number;
}

const atlases = new WeakMap<HTMLCanvasElement, CharacterTextures>();

export class CharacterSprite {
  readonly sprite: Sprite;
  private readonly frames: Map<string, Texture>;
  private readonly animation = new CharacterAnimation();

  constructor(atlas: HTMLCanvasElement) {
    let textures = atlases.get(atlas);
    if (!textures) {
      const texture = Texture.from(atlas, true);
      texture.source.scaleMode = "linear";
      const frames = new Map<string, Texture>();
      for (const motion of Object.keys(CHARACTER_ANIMATIONS) as CharacterMotion[]) {
        for (const direction of CHARACTER_DIRECTIONS) {
          const animation = CHARACTER_ANIMATIONS[motion];
          for (let index = 0; index < animation.frames; index++) {
            const frame = getCharacterFrame(motion, direction, index * animation.frameDuration);
            frames.set(`${frame.x}:${frame.y}`, new Texture({
              source: texture.source,
              frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
            }));
          }
        }
      }
      textures = { texture, frames, users: 0 };
      atlases.set(atlas, textures);
    }
    const shared = textures;
    shared.users++;
    this.frames = shared.frames;
    this.sprite = new Sprite(this.frames.get("0:0")!);
    this.sprite.anchor.set(CHARACTER_FOOT_ANCHOR.x / CHARACTER_CANVAS_SIZE, CHARACTER_FOOT_ANCHOR.y / CHARACTER_CANVAS_SIZE);
    this.sprite.width = this.sprite.height = CHARACTER_WORLD_SIZE;
    this.sprite.once("destroyed", () => {
      if (--shared.users > 0) return;
      atlases.delete(atlas);
      for (const frame of shared.frames.values()) frame.destroy();
      shared.frames.clear();
      shared.texture.destroy(true);
    });
  }

  update(now: number, motion: CharacterMotion, direction: CharacterDirection): void {
    const frame = this.animation.frame(now, motion, direction);
    this.sprite.texture = this.frames.get(`${frame.x}:${frame.y}`)!;
    const anchor = motion === "sit" || motion === "sit-listen" ? CHARACTER_SEAT_ANCHOR : CHARACTER_FOOT_ANCHOR;
    this.sprite.anchor.set(anchor.x / CHARACTER_CANVAS_SIZE, anchor.y / CHARACTER_CANVAS_SIZE);
  }
}
