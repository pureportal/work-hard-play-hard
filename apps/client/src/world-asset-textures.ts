import { Rectangle, Sprite, Texture } from "pixi.js";
import type { WorldAssetArtwork } from "./world-asset-artwork";

interface AssetTexture {
  image: HTMLImageElement;
  loaded: Promise<Texture>;
  texture?: Texture;
  frames: Map<string, Texture>;
}

export class WorldAssetTextures {
  private readonly textures = new Map<string, AssetTexture>();
  private destroyed = false;

  createSprite(artwork: WorldAssetArtwork, onError: (error: Error) => void): Sprite {
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

  private async load(artwork: WorldAssetArtwork): Promise<Texture> {
    let entry = this.textures.get(artwork.path);
    if (!entry) {
      const image = new Image();
      const record: AssetTexture = { image, frames: new Map(), loaded: Promise.resolve(Texture.EMPTY) };
      record.loaded = new Promise<Texture>((resolve, reject) => {
        image.onload = () => {
          if (this.destroyed) {
            resolve(Texture.EMPTY);
            return;
          }
          if (image.naturalWidth !== artwork.atlasWidth || image.naturalHeight !== artwork.atlasHeight) {
            this.textures.delete(artwork.path);
            reject(new Error(`Invalid world artwork dimensions: ${artwork.path}`));
            return;
          }
          const texture = Texture.from(image);
          texture.source.scaleMode = "nearest";
          texture.source.minFilter = "linear";
          record.texture = texture;
          resolve(texture);
        };
        image.onerror = () => {
          this.textures.delete(artwork.path);
          reject(new Error(`World artwork could not load: ${artwork.path}`));
        };
        image.src = artwork.path;
      });
      this.textures.set(artwork.path, record);
      entry = record;
    }
    await entry.loaded;
    if (this.destroyed) return Texture.EMPTY;
    return this.frame(entry, artwork);
  }

  private frame(entry: AssetTexture, artwork: WorldAssetArtwork): Texture {
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
