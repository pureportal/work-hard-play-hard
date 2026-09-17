import { Rectangle, Sprite, Texture } from "pixi.js";
import type { WorldAssetArtwork } from "./world-asset-artwork";
import { getOptimizedImagePath } from "./optimized-images";
import { decodeImage } from "./image-decoding";

export type WorldTextureRegion = Pick<WorldAssetArtwork, "path" | "frame" | "bounds" | "atlasWidth" | "atlasHeight" | "animation">;

interface AssetTexture {
  image: HTMLImageElement;
  loaded: Promise<Texture>;
  texture?: Texture;
  frames: Map<string, Texture>;
  alpha?: Uint8Array;
}

export class WorldAssetTextures {
  private readonly textures = new Map<string, AssetTexture>();
  private destroyed = false;

  isPointVisible(artwork: WorldTextureRegion, x: number, y: number): boolean {
    const { bounds, frame } = artwork;
    if (x < bounds.x || y < bounds.y || x >= bounds.x + bounds.width || y >= bounds.y + bounds.height) return false;
    const entry = this.textures.get(artwork.path);
    if (!entry?.texture || this.destroyed) return false;
    if (!entry.alpha) {
      const canvas = document.createElement("canvas");
      canvas.width = artwork.atlasWidth;
      canvas.height = artwork.atlasHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(entry.image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      entry.alpha = new Uint8Array(canvas.width * canvas.height);
      for (let index = 0; index < entry.alpha.length; index++) entry.alpha[index] = pixels[index * 4 + 3]!;
      canvas.width = canvas.height = 0;
    }
    return (artwork.animation?.frames ?? [frame]).some(crop => {
      const pixelX = crop.x + Math.floor((x - bounds.x) / bounds.width * crop.width);
      const pixelY = crop.y + Math.floor((y - bounds.y) / bounds.height * crop.height);
      return entry.alpha![pixelY * artwork.atlasWidth + pixelX]! >= 32;
    });
  }

  createSprite(artwork: WorldTextureRegion, onError: (error: Error) => void): Sprite {
    if (this.destroyed) throw new Error("World artwork textures have been destroyed");
    const sprite = new Sprite({ texture: Texture.EMPTY, label: artwork.path });
    sprite.position.set(artwork.bounds.x, artwork.bounds.y);
    sprite.visible = false;
    const applyTexture = (texture: Texture) => {
      if (this.destroyed || sprite.destroyed) return;
      sprite.texture = texture;
      sprite.width = artwork.bounds.width;
      sprite.height = artwork.bounds.height;
      sprite.visible = true;
    };
    const entry = this.textures.get(artwork.path);
    if (entry?.texture) {
      applyTexture(this.frame(entry, artwork));
      return sprite;
    }
    void this.load(artwork).then(applyTexture).catch((error: unknown) => {
      if (!this.destroyed && !sprite.destroyed) onError(error instanceof Error ? error : new Error(String(error)));
    });
    return sprite;
  }

  destroy(): void {
    this.destroyed = true;
    for (const entry of this.textures.values()) {
      for (const frame of entry.frames.values()) frame.destroy();
      entry.texture?.destroy(true);
    }
    this.textures.clear();
  }

  createAnimation(sprites: readonly Sprite[], artwork: WorldTextureRegion): ((now: number) => void) | undefined {
    const animation = artwork.animation;
    if (!animation) return;
    let previousFrame = -1;
    return (now: number) => {
      const entry = this.textures.get(artwork.path);
      if (this.destroyed || !entry?.texture) return;
      const index = Math.floor(Math.max(0, now) / animation.frameDuration) % animation.frames.length;
      if (index === previousFrame) return;
      previousFrame = index;
      const texture = this.frame(entry, { ...artwork, frame: animation.frames[index]! });
      for (const sprite of sprites) if (!sprite.destroyed) sprite.texture = texture;
    };
  }

  private async load(artwork: WorldTextureRegion): Promise<Texture> {
    let entry = this.textures.get(artwork.path);
    if (!entry) {
      const image = new Image();
      image.decoding = "async";
      const record: AssetTexture = { image, frames: new Map(), loaded: Promise.resolve(Texture.EMPTY) };
      record.loaded = new Promise<Texture>((resolve, reject) => {
        image.onload = async () => {
          try {
            await decodeImage(image);
            if (this.destroyed) {
              resolve(Texture.EMPTY);
              return;
            }
            if (image.naturalWidth !== artwork.atlasWidth || image.naturalHeight !== artwork.atlasHeight) {
              throw new Error(`Invalid world artwork dimensions: ${artwork.path}`);
            }
            const texture = Texture.from(image);
            texture.source.scaleMode = "nearest";
            texture.source.minFilter = "linear";
            texture.source.mipmapFilter = "linear";
            texture.source.autoGenerateMipmaps = true;
            record.texture = texture;
            resolve(texture);
          } catch (error) {
            this.textures.delete(artwork.path);
            reject(error);
          }
        };
        image.onerror = () => {
          this.textures.delete(artwork.path);
          reject(new Error(`World artwork could not load: ${artwork.path}`));
        };
        image.src = getOptimizedImagePath(artwork.path);
      });
      this.textures.set(artwork.path, record);
      entry = record;
    }
    await entry.loaded;
    if (this.destroyed) return Texture.EMPTY;
    return this.frame(entry, artwork);
  }

  private frame(entry: AssetTexture, artwork: WorldTextureRegion): Texture {
    const { x, y, width, height } = artwork.frame;
    const key = `${x}:${y}:${width}:${height}`;
    let frame = entry.frames.get(key);
    if (!frame) {
      frame = new Texture({ source: entry.texture!.source, frame: new Rectangle(x, y, width, height) });
      entry.frames.set(key, frame);
    }
    return frame;
  }
}
