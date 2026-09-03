import { getDefaultAssetVariantId, requireAssetDefinition, type WorldObject } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { getAssetDirectionIndicators } from "./asset-orientation";

describe("asset direction indicators", () => {
  it("returns every rotated sit direction for a sofa", () => {
    const indicators = getAssetDirectionIndicators(object("sofa-corner", 90), 0.78);

    expect(indicators).toHaveLength(5);
    expect(indicators.map(({ direction }) => direction)).toEqual(["left", "left", "up", "up", "up"]);
    expect(indicators.map(({ center }) => center)).toEqual([
      { x: 80, y: 16 },
      { x: 80, y: 48 },
      { x: 80, y: 80 },
      { x: 48, y: 80 },
      { x: 16, y: 80 },
    ]);
  });

  it("falls back to the asset orientation when there are no actions", () => {
    const indicators = getAssetDirectionIndicators(object("equipment-tetris", 270), 0.78);

    expect(indicators).toEqual([{
      center: { x: 56, y: 48 },
      bounds: { x: 0, y: 0, width: 112, height: 96 },
      direction: "left",
    }]);
    expect(requireAssetDefinition("equipment-tetris").radius).toBe(124);
  });

  it("moves a single chair arrow clear of the pointer while preserving its origin", () => {
    const indicators = getAssetDirectionIndicators(object("chair-office", 0), 1);

    expect(indicators).toEqual([{
      center: { x: 16, y: 60 },
      origin: { x: 16, y: 16 },
      bounds: { x: 0, y: 0, width: 32, height: 32 },
      direction: "down",
    }]);
  });

  it.each([0.5, 0.78, 1, 1.45])("keeps a compact arrow at least 44 screen pixels from the pointer at %s zoom", (scale) => {
    const [indicator] = getAssetDirectionIndicators(object("chair-office", 0), scale);

    expect(indicator?.origin).toBeDefined();
    expect(Math.hypot(
      indicator!.center.x - indicator!.origin!.x,
      indicator!.center.y - indicator!.origin!.y,
    ) * scale).toBeGreaterThanOrEqual(44);
  });

  it("moves the fallback arrow clear of compact assets without actions", () => {
    const indicators = getAssetDirectionIndicators(object("decor-lamp", 90), 1);

    expect(indicators).toEqual([{
      center: { x: 52, y: 8 },
      origin: { x: 8, y: 8 },
      bounds: { x: 0, y: 0, width: 16, height: 16 },
      direction: "right",
    }]);
  });
});

function object(assetId: string, rotation: WorldObject["rotation"]): WorldObject {
  const definition = requireAssetDefinition(assetId);
  return {
    id: "preview",
    floorId: "floor",
    assetId,
    x: 0,
    y: 0,
    rotation,
    variantId: getDefaultAssetVariantId(definition),
  };
}
