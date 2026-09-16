import { CHARACTER_ATLAS_HEIGHT, CHARACTER_ATLAS_SIZE, DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./optimized-images", () => ({ getOptimizedImagePath: (path: string) => `/optimized${path}` }));

class TestImage {
  static instances: TestImage[] = [];
  naturalWidth = CHARACTER_ATLAS_SIZE;
  naturalHeight = CHARACTER_ATLAS_HEIGHT * 2;
  decoding = "";
  src = "";
  onload?: () => Promise<void>;
  onerror?: () => void;
  decode = vi.fn(async () => {});

  constructor() { TestImage.instances.push(this); }
}

let loadCharacterLayers: typeof import("./character-layers").loadCharacterLayers;
const drawImage = vi.fn();
const getImageData = vi.fn((_x: number, _y: number, width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }));
const region = { x: 28, y: 376, width: 64, height: 68 };

beforeEach(async () => {
  vi.resetModules();
  TestImage.instances = [];
  drawImage.mockClear();
  getImageData.mockClear();
  vi.stubGlobal("Image", TestImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({ drawImage, getImageData })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
  ({ loadCharacterLayers } = await import("./character-layers"));
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function finishLoads(prepare: (image: TestImage) => void = () => {}, finished = 0) {
  while (finished < 5) {
    const active = TestImage.instances.slice(finished);
    expect(active.length).toBeGreaterThan(0);
    finished += active.length;
    await Promise.all(active.map(image => { prepare(image); return image.onload!(); }));
  }
}

describe("character layer loading", () => {
  it("shares decoded sources between crops and reads their matching color and depth regions", async () => {
    const first = loadCharacterLayers(DEFAULT_CHARACTER_APPEARANCE, region);
    const second = loadCharacterLayers(DEFAULT_CHARACTER_APPEARANCE, { ...region, x: 32 });
    await Promise.resolve();
    expect(TestImage.instances).toHaveLength(2);
    await finishLoads();
    const pixels = await first;
    await second;
    expect(pixels).toHaveLength(5);
    expect(pixels[0]).toHaveLength(64 * 68 * 8);
    expect(drawImage).toHaveBeenCalledWith(TestImage.instances[0], 28, 376, 64, 68, 0, 0, 64, 68);
    expect(drawImage).toHaveBeenCalledWith(TestImage.instances[0], 28, 376 + CHARACTER_ATLAS_HEIGHT, 64, 68, 0, 68, 64, 68);
    await loadCharacterLayers(DEFAULT_CHARACTER_APPEARANCE, region);
    expect(TestImage.instances).toHaveLength(5);
  });

  it("does not read pixels until decoding completes", async () => {
    const request = loadCharacterLayers(DEFAULT_CHARACTER_APPEARANCE, region);
    await Promise.resolve();
    let finish!: () => void;
    const decoding = new Promise<void>(resolve => { finish = resolve; });
    for (const image of TestImage.instances) image.decode.mockReturnValue(decoding);
    const loads = TestImage.instances.map(image => image.onload!());
    await Promise.resolve();
    expect(drawImage).not.toHaveBeenCalled();
    finish();
    await Promise.all(loads);
    expect(TestImage.instances).toHaveLength(4);
    await finishLoads(undefined, 2);
    await request;
    expect(getImageData).toHaveBeenCalledTimes(5);
  });

  it("retries a failed decode without reloading successful layers", async () => {
    const request = loadCharacterLayers(DEFAULT_CHARACTER_APPEARANCE, region);
    const failure = expect(request).rejects.toThrow("Decode failed");
    await Promise.resolve();
    TestImage.instances[0]!.decode.mockRejectedValueOnce(new Error("Decode failed"));
    await finishLoads();
    await failure;
    const retry = loadCharacterLayers(DEFAULT_CHARACTER_APPEARANCE, region);
    await Promise.resolve();
    expect(TestImage.instances).toHaveLength(6);
    await TestImage.instances.at(-1)!.onload!();
    expect(await retry).toHaveLength(5);
  });

  it("rejects incorrect source dimensions before drawing", async () => {
    const request = loadCharacterLayers(DEFAULT_CHARACTER_APPEARANCE, region);
    const failure = expect(request).rejects.toThrow("invalid dimensions");
    await Promise.resolve();
    await finishLoads(image => { image.naturalWidth = 1; });
    await failure;
    expect(drawImage).not.toHaveBeenCalled();
  });
});
