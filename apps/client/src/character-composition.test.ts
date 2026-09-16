import { CHARACTER_ATLAS_HEIGHT, CHARACTER_ATLAS_SIZE, composeCharacterLayers } from "@workhard/shared";
import { describe, expect, it } from "vitest";

describe("character occlusion", () => {
  it("draws the nearest geometry regardless of the order parts were loaded", () => {
    const colors = CHARACTER_ATLAS_SIZE * CHARACTER_ATLAS_HEIGHT * 4;
    const front = new Uint8ClampedArray(colors * 2);
    const back = new Uint8ClampedArray(colors * 2);
    front.set([255, 0, 0, 255]);
    front.set([0, 100, 0, 255], colors);
    back.set([0, 0, 255, 255]);
    back.set([0, 200, 0, 255], colors);
    for (const layers of [[front, back], [back, front]]) {
      const result = composeCharacterLayers(layers);
      expect(result.slice(0, 4)).toEqual(new Uint8ClampedArray([255, 0, 0, 255]));
      expect(result.slice(4, 8)).toEqual(new Uint8ClampedArray([0, 0, 0, 0]));
    }
  });

  it("rejects an incomplete color/depth layer", () => {
    expect(() => composeCharacterLayers([new Uint8ClampedArray(8)])).toThrow("Invalid character layer dimensions");
  });

  it("uses the cropped layer's depth plane and preserves transparent pixels", () => {
    const back = new Uint8ClampedArray([
      0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 0, 0,
      0, 200, 0, 255, 0, 100, 0, 255, 0, 0, 0, 0,
    ]);
    const front = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0,
      0, 100, 0, 255, 0, 200, 0, 255, 0, 0, 0, 0,
    ]);
    expect(composeCharacterLayers([front, back], 3, 1)).toEqual(new Uint8ClampedArray([
      255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0,
    ]));
  });
});
