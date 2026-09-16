import { ASSET_CATALOG, ASSET_ROTATIONS, getDefaultAssetVariantId, requireAssetDefinition, type FloorLayout, type WorldObject } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { getAssetOrientationLabel, getRotatedAssetPosition, rotateAssetClockwise } from "./asset-orientation";
import { getAssetDirectionIndicators } from "./asset-direction-indicators";
import { getWorldAssetArtwork } from "./world-asset-artwork";

const layout: FloorLayout = { floorId: "floor", revision: 1, objects: [], walls: [], openings: [], rooms: [], tiles: [] };

describe("asset rotation position", () => {
  it("returns every catalog footprint to its starting position after four turns", () => {
    for (const asset of ASSET_CATALOG.assets) for (const start of ASSET_ROTATIONS) {
      let placed = { ...object(asset.id, start), x: 320, y: 256 };
      for (let turn = 0; turn < 4; turn++) {
        const rotation = rotateAssetClockwise(placed.rotation);
        placed = { ...placed, ...getRotatedAssetPosition(placed, rotation), rotation };
        expect(placed.x % 16).toBe(0);
        expect(placed.y % 16).toBe(0);
      }
      expect({ x: placed.x, y: placed.y, rotation: placed.rotation }, `${asset.id} at ${start}`).toEqual({ x: 320, y: 256, rotation: start });
    }
  });

  it("keeps a narrow radio within its original table cells after two turns", () => {
    const radio = { ...object("decor-radio", 0), x: 464, y: 432 };
    const west = { ...radio, ...getRotatedAssetPosition(radio, 90), rotation: 90 as const };
    expect(getRotatedAssetPosition(west, 180)).toEqual({ x: radio.x, y: radio.y });
  });
});

describe("asset direction indicators", () => {
  it.each([0, 90, 180, 270] as const)("matches the seat and sprite facing at %s degrees", (rotation) => {
    const directions = { down: "South", left: "West", up: "North", right: "East" };
    const [indicator] = getAssetDirectionIndicators(object("chair-office", rotation), layout);
    expect(getAssetOrientationLabel(rotation)).toBe(directions[indicator!.direction]);
  });

  it("returns every rotated sit direction for a sofa", () => {
    const indicators = getAssetDirectionIndicators(object("sofa-corner", 90), layout, 0.78);

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
    const asset = object("equipment-falling-blocks", 270);
    const bounds = getWorldAssetArtwork(requireAssetDefinition(asset.assetId), asset.variantId, asset.rotation).bounds;
    const indicators = getAssetDirectionIndicators(asset, layout, 0.78);

    expect(indicators).toEqual([{
      center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      bounds,
      direction: "right",
    }]);
    expect(requireAssetDefinition("equipment-falling-blocks").radius).toBe(124);
  });

  it("moves a single chair arrow clear of the pointer while preserving its origin", () => {
    const indicators = getAssetDirectionIndicators(object("chair-office", 0), layout, 1);

    expect(indicators).toEqual([{
      center: { x: 16, y: 60 },
      origin: { x: 16, y: 16 },
      bounds: { x: 0, y: 0, width: 32, height: 32 },
      direction: "down",
    }]);
  });

  it.each([0.5, 0.78, 1, 1.45])("keeps a compact arrow at least 44 screen pixels from the pointer at %s zoom", (scale) => {
    const [indicator] = getAssetDirectionIndicators(object("chair-office", 0), layout, scale);

    expect(indicator?.origin).toBeDefined();
    expect(Math.hypot(
      indicator!.center.x - indicator!.origin!.x,
      indicator!.center.y - indicator!.origin!.y,
    ) * scale).toBeGreaterThanOrEqual(44);
  });

  it("moves the fallback arrow clear of compact assets without actions", () => {
    const asset = object("decor-laptop", 90);
    const bounds = getWorldAssetArtwork(requireAssetDefinition(asset.assetId), asset.variantId, asset.rotation).bounds;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const indicators = getAssetDirectionIndicators(asset, layout, 1);

    expect(indicators).toEqual([{
      center: { x: center.x - 44, y: center.y },
      origin: center,
      bounds,
      direction: "left",
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
