import { describe, expect, it, vi } from "vitest";
import { ImageCache } from "./image-cache";

describe("image cache", () => {
  it("keeps pending work shared while completed images are evicted", async () => {
    const cache = new ImageCache<Uint8Array>(4, image => image.byteLength);
    let finish!: (image: Uint8Array) => void;
    const load = vi.fn(() => new Promise<Uint8Array>(resolve => { finish = resolve; }));
    const pending = cache.get("pending", load);
    for (let index = 0; index < 12; index++) await cache.get(String(index), async () => new Uint8Array(4));
    expect(cache.get("pending", load)).toBe(pending);
    expect(load).toHaveBeenCalledTimes(1);
    const pixels = new Uint8Array([1, 2]);
    finish(pixels);
    expect(await pending).toBe(pixels);
    expect(await cache.get("pending", load)).toBe(pixels);
  });

  it("evicts the least recently used images by their byte size", async () => {
    const cache = new ImageCache<Uint8Array>(6, image => image.byteLength);
    const small = vi.fn(async () => new Uint8Array(2));
    const large = vi.fn(async () => new Uint8Array(4));
    await cache.get("small", small);
    await cache.get("large", large);
    await cache.get("small", small);
    await cache.get("new", async () => new Uint8Array(2));
    await cache.get("small", small);
    expect(small).toHaveBeenCalledTimes(1);
    await cache.get("large", large);
    expect(large).toHaveBeenCalledTimes(2);
  });

  it("retries rejected work and shares the successful result", async () => {
    const cache = new ImageCache<Uint8Array>(4, image => image.byteLength);
    const load = vi.fn<() => Promise<Uint8Array>>()
      .mockRejectedValueOnce(new Error("Decode failed"))
      .mockResolvedValue(new Uint8Array(4));
    await expect(cache.get("image", load)).rejects.toThrow("Decode failed");
    const image = await cache.get("image", load);
    expect(await cache.get("image", load)).toBe(image);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not retain an image larger than its budget", async () => {
    const cache = new ImageCache<Uint8Array>(4, image => image.byteLength);
    const load = vi.fn(async () => new Uint8Array(8));
    await cache.get("image", load);
    await cache.get("image", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
