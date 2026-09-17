import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorldAssetTextures } from "./world-asset-textures";
import type { WorldAssetArtwork } from "./world-asset-artwork";

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: [0, 0, 0, 0] })),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

let images: HTMLImageElement[];
let textures: WorldAssetTextures;

beforeEach(() => {
  images = [];
  textures = new WorldAssetTextures();
  vi.stubGlobal("Image", vi.fn(function () {
    const image = document.createElement("img");
    image.decode = vi.fn().mockResolvedValue(undefined);
    Object.defineProperties(image, {
      naturalWidth: { value: 1024, configurable: true },
      naturalHeight: { value: 256, configurable: true },
    });
    images.push(image);
    return image;
  }));
});

afterEach(() => {
  textures.destroy();
  vi.unstubAllGlobals();
});

describe("world artwork textures", () => {
  it("waits for decoding before exposing the texture and retries after decode failure", async () => {
    const failed = vi.fn();
    const first = textures.createSprite(artwork(0), failed);
    let rejectDecode!: (error: Error) => void;
    const decoding = new Promise<void>((_resolve, reject) => { rejectDecode = reject; });
    images[0]!.decode = vi.fn(() => decoding);
    images[0]!.dispatchEvent(new Event("load"));
    await Promise.resolve();
    expect(first.visible).toBe(false);
    rejectDecode(new Error("Invalid WebP data"));
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
    const retry = textures.createSprite(artwork(0), failed);
    expect(images).toHaveLength(2);
    images[1]!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(retry.visible).toBe(true));
    first.destroy();
    retry.destroy();
  });

  it("plays synchronized sprite and shadow frames after loading and wraps the loop", async () => {
    const view = artwork(0);
    view.animation = { frames: [view.frame, artwork(512).frame], frameDuration: 100 };
    const sprite = textures.createSprite(view, vi.fn());
    const shadow = textures.createSprite(view, vi.fn());
    const animate = textures.createAnimation([sprite, shadow], view)!;
    animate(100);
    images[0]!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(sprite.visible).toBe(true));
    animate(100);
    expect(sprite.texture.frame.x).toBe(524);
    expect(shadow.texture).toBe(sprite.texture);
    expect(sprite.width).toBe(96);
    expect(sprite.height).toBe(60);
    expect(sprite.y).toBe(-12);
    animate(200);
    expect(sprite.texture.frame.x).toBe(12);
    animate(-100);
    expect(sprite.texture.frame.x).toBe(12);
    sprite.destroy();
    animate(300);
    expect(shadow.texture.frame.x).toBe(524);
    textures.destroy();
    expect(() => animate(400)).not.toThrow();
    shadow.destroy();
  });

  it("selects moving artwork even when its first pose has a transparent pixel", async () => {
    const pixels = new Uint8ClampedArray(1024 * 256 * 4);
    pixels[(82 * 1024 + 624) * 4 + 3] = 255;
    const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({
      drawImage: vi.fn(), getImageData: () => ({ data: pixels }),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
    const view = artwork(0);
    view.animation = { frames: [view.frame, artwork(512).frame], frameDuration: 100 };
    const sprite = textures.createSprite(view, vi.fn());
    images[0]!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(sprite.visible).toBe(true));
    expect(textures.isPointVisible(view, 48, 18)).toBe(true);
    expect(textures.isPointVisible(view, 47, 18)).toBe(false);
    context.mockRestore();
    sprite.destroy();
  });

  it("hit-tests visible pixels in the selected directional crop", async () => {
    const pixels = new Uint8ClampedArray(1024 * 256 * 4);
    pixels[(82 * 1024 + 112) * 4 + 3] = 255;
    const drawImage = vi.fn();
    const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({
      drawImage, getImageData: () => ({ data: pixels }),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
    const sprite = textures.createSprite(artwork(0), vi.fn());
    expect(textures.isPointVisible(artwork(0), 48, 18)).toBe(false);
    images[0]!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(sprite.visible).toBe(true));
    expect(textures.isPointVisible(artwork(0), 48, 18)).toBe(true);
    expect(textures.isPointVisible(artwork(0), 47, 18)).toBe(false);
    expect(textures.isPointVisible(artwork(512), 48, 18)).toBe(false);
    expect(textures.isPointVisible(artwork(0), -1, 18)).toBe(false);
    expect(drawImage).toHaveBeenCalledOnce();
    context.mockRestore();
    sprite.destroy();
  });

  it("shares one loaded atlas between directions without sharing their crop", async () => {
    const failed = vi.fn();
    const front = textures.createSprite(artwork(0), failed);
    const back = textures.createSprite(artwork(512), failed);
    expect(images).toHaveLength(1);
    expect(front.visible).toBe(false);
    images[0]!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(front.visible).toBe(true));
    expect(back.visible).toBe(true);
    expect(front.texture.source).toBe(back.texture.source);
    expect(front.texture.frame.x).toBe(12);
    expect(back.texture.frame.x).toBe(524);
    expect(front.texture.source.scaleMode).toBe("nearest");
    expect(front.texture.source.minFilter).toBe("linear");
    expect(front.width).toBe(96);
    expect(front.height).toBe(60);
    expect(front.position.x).toBe(0);
    expect(front.position.y).toBe(-12);
    expect(failed).not.toHaveBeenCalled();
    front.destroy();
    back.destroy();
  });

  it("ignores late image loads after a placement preview is removed", async () => {
    const failed = vi.fn();
    const sprite = textures.createSprite(artwork(0), failed);
    sprite.destroy();
    images[0]!.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();
    expect(sprite.destroyed).toBe(true);
    expect(failed).not.toHaveBeenCalled();
  });

  it("shows cached directions immediately when a layout or preview is rebuilt", async () => {
    const failed = vi.fn();
    const first = textures.createSprite(artwork(0), failed);
    images[0]!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(first.visible).toBe(true));
    const duplicate = textures.createSprite(artwork(0), failed);
    const back = textures.createSprite(artwork(512), failed);
    expect(duplicate.visible).toBe(true);
    expect(back.visible).toBe(true);
    expect(duplicate.texture).toBe(first.texture);
    expect(back.texture.source).toBe(first.texture.source);
    expect(back.texture.frame.x).toBe(524);
    expect(images).toHaveLength(1);
    const source = first.texture.source;
    textures.destroy();
    expect(source.destroyed).toBe(true);
    expect(first.texture.destroyed).toBe(true);
    expect(back.texture.destroyed).toBe(true);
    first.destroy();
    duplicate.destroy();
    back.destroy();
  });

  it("reports missing files and lets a later load recover", async () => {
    const failed = vi.fn();
    const first = textures.createSprite(artwork(0), failed);
    images[0]!.dispatchEvent(new Event("error"));
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(first.visible).toBe(false);
    const retry = textures.createSprite(artwork(0), failed);
    expect(images).toHaveLength(2);
    images[1]!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(retry.visible).toBe(true));
    first.destroy();
    retry.destroy();
  });

  it("rejects a corrupt atlas with the wrong dimensions", async () => {
    const failed = vi.fn();
    const sprite = textures.createSprite(artwork(0), failed);
    Object.defineProperty(images[0], "naturalWidth", { value: 512 });
    images[0]!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(sprite.visible).toBe(false);
    sprite.destroy();
  });

  it("releases its textures and does not allocate textures after destruction", async () => {
    const failed = vi.fn();
    const sprite = textures.createSprite(artwork(0), failed);
    textures.destroy();
    images[0]!.dispatchEvent(new Event("load"));
    await Promise.resolve();
    await Promise.resolve();
    expect(sprite.visible).toBe(false);
    expect(failed).not.toHaveBeenCalled();
    expect(() => textures.createSprite(artwork(0), failed)).toThrow("destroyed");
    expect(images).toHaveLength(1);
    sprite.destroy();
  });
});

function artwork(x: number): WorldAssetArtwork {
  return {
    path: "/world-assets/storage-credenza/ink.png",
    frame: { x: x + 12, y: 20, width: 200, height: 125 },
    bounds: { x: 0, y: -12, width: 96, height: 60 },
    atlasWidth: 1024,
    atlasHeight: 256,
    seatOffset: 0,
  };
}
