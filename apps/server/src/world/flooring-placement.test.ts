import { describe, expect, it } from "vitest";
import {
  ASSET_CATALOG, ASSET_ROTATIONS, getAssetPlacementError, getDefaultAssetVariantId, getFlooringVisibleRects,
  getOpeningArtworkRect, getPlacedAssetBounds, getPlacedAssetCellRects, getWallPlacementError, getWallSolidRects,
  mergeWallSegments, pointInRect, rectanglesOverlap, requireAssetDefinition,
  type AssetRotation, type FloorLayout, type Position, type Rect, type Wall,
  type WallOpening, type WorldObject,
} from "@workhard/shared";

const bounds = { x: -512, y: -512, width: 1536, height: 1536 };
const orientations = ["horizontal", "vertical"] as const;

function tile(x: number, y: number, assetId = "floor-wood", rotation: AssetRotation = 0): WorldObject {
  return { id: `${x}:${y}`, floorId: "floor", x, y, assetId, rotation, variantId: getDefaultAssetVariantId(requireAssetDefinition(assetId)) };
}

function layout(walls: Wall[], openings: WallOpening[] = [], objects: WorldObject[] = []): FloorLayout {
  return { floorId: "floor", revision: 1, walls, openings, objects, rooms: [], tiles: [] };
}

function area(rects: Rect[]): number {
  return rects.reduce((total, rect) => total + rect.width * rect.height, 0);
}

function verifyCoverage(floor: FloorLayout, object: WorldObject): void {
  const footprint = getPlacedAssetBounds(object);
  const finished = getFlooringVisibleRects(floor, [footprint]);
  const preview = getFlooringVisibleRects(floor, getPlacedAssetCellRects(object));
  const architecture = floor.walls.flatMap((wall) => getWallSolidRects(wall, floor.openings));
  for (const opening of floor.openings) architecture.push(getOpeningArtworkRect(floor.walls.find((wall) => wall.id === opening.wallId)!, opening));
  expect(area(finished)).toBe(area(preview));
  for (const rect of [...finished, ...preview]) {
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(architecture.some((wall) => rectanglesOverlap(rect, wall))).toBe(false);
    expect(rect.x >= footprint.x && rect.y >= footprint.y
      && rect.x + rect.width <= footprint.x + footprint.width && rect.y + rect.height <= footprint.y + footprint.height).toBe(true);
  }
  for (let y = footprint.y + 0.5; y < footprint.y + footprint.height; y++) {
    for (let x = footprint.x + 0.5; x < footprint.x + footprint.width; x++) {
      const uncovered = !architecture.some((rect) => pointInRect(x, y, rect));
      expect(finished.some((rect) => pointInRect(x, y, rect))).toBe(uncovered);
      expect(preview.some((rect) => pointInRect(x, y, rect))).toBe(uncovered);
    }
  }
}

describe.each(orientations)("%s floor edges", (orientation) => {
  const position = (x: number, y: number): Position => orientation === "horizontal" ? { x, y } : { x: y, y: x };
  const placed = (x: number, y: number, assetId?: string, rotation?: AssetRotation) => {
    const point = position(x, y);
    return tile(point.x, point.y, assetId, rotation);
  };
  const wall: Wall = { id: "wall", start: position(0, 128), end: position(384, 128) };

  it.each(ASSET_CATALOG.assets.filter((asset) => asset.kind === "floor-tile"))("fits $name on either side in every rotation and wall direction", (asset) => {
    for (const rotation of ASSET_ROTATIONS) for (const reverse of [false, true]) {
      const floor = layout([reverse ? { ...wall, start: wall.end, end: wall.start } : wall]);
      for (const y of [64, 128]) {
        const candidate = placed(128, y, asset.id, rotation);
        expect(getAssetPlacementError(floor, bounds, candidate)).toBeUndefined();
        expect(area(getFlooringVisibleRects(floor, [getPlacedAssetBounds(candidate)]))).toBe(64 * 58);
      }
      for (const y of [80, 96, 112]) expect(getAssetPlacementError(floor, bounds, placed(128, y, asset.id, rotation))).toBe("ASSET_BLOCKED");
    }
  });

  it("meets the visible wall face without changing furniture or rug clearance", () => {
    const floor = layout([wall]);
    for (const y of [64, 128]) verifyCoverage(floor, placed(128, y));
    for (const assetId of ["rug-woven", "chair-office", "plant-floor"]) {
      expect(getAssetPlacementError(floor, bounds, placed(128, 128, assetId))).toBe("ASSET_BLOCKED");
    }
  });

  it("covers a doorway up to its threshold and rejects crossing a jamb or window", () => {
    const door: WallOpening = { id: "door", wallId: wall.id, offset: 128, width: 64, type: "door" };
    const floor = layout([wall], [door]);
    const threshold = placed(128, 96);
    expect(getAssetPlacementError(floor, bounds, threshold)).toBeUndefined();
    expect(area(getFlooringVisibleRects(floor, [getPlacedAssetBounds(threshold)]))).toBe(64 * 56);
    expect(getAssetPlacementError(floor, bounds, placed(112, 96))).toBe("ASSET_BLOCKED");
    expect(getAssetPlacementError(floor, bounds, placed(144, 96))).toBe("ASSET_BLOCKED");
    verifyCoverage(floor, threshold);
    for (const y of [64, 128]) verifyCoverage(floor, placed(112, y));
    floor.openings = [{ ...door, type: "window", width: 96, light: { color: "#fff", intensity: 0.2, depth: 112 } }];
    expect(getAssetPlacementError(floor, bounds, threshold)).toBe("ASSET_BLOCKED");
    for (const y of [64, 128]) {
      const candidate = placed(128, y);
      expect(getAssetPlacementError(floor, bounds, candidate)).toBeUndefined();
      expect(area(getFlooringVisibleRects(floor, [getPlacedAssetBounds(candidate)]))).toBe(64 * 56);
      verifyCoverage(floor, candidate);
    }
  });

  it("handles wall ends, short segments, negative coordinates, and merged segments", () => {
    const floor = layout([wall]);
    expect(getAssetPlacementError(floor, bounds, placed(384, 96))).toBeUndefined();
    expect(getAssetPlacementError(floor, bounds, placed(368, 96))).toBe("ASSET_BLOCKED");
    const short: Wall = { id: "short", start: position(128, 128), end: position(160, 128) };
    verifyCoverage(layout([short]), placed(112, 128));
    expect(getAssetPlacementError(layout([short]), bounds, placed(112, 96))).toBe("ASSET_BLOCKED");
    const negative = { ...wall, start: position(-256, -128), end: position(-64, -128) };
    expect(getAssetPlacementError(layout([negative]), bounds, placed(-192, -128))).toBeUndefined();
    verifyCoverage(layout([negative]), placed(-192, -128));
    const split = layout([
      { ...wall, end: position(160, 128) },
      { id: "second", start: wall.end, end: position(160, 128) },
    ]);
    const merged = { ...split, ...mergeWallSegments(split.walls, split.openings) };
    for (const version of [split, merged]) {
      expect(getAssetPlacementError(version, bounds, placed(128, 128))).toBeUndefined();
      verifyCoverage(version, placed(128, 128));
    }
  });

  it("allows walls along existing tile edges and rejects walls through tiles", () => {
    const floor = layout([], [], [placed(128, 64), placed(128, 128)]);
    expect(getWallPlacementError(floor, bounds, wall)).toBeUndefined();
    expect(getWallPlacementError(floor, bounds, { ...wall, start: position(0, 160), end: position(384, 160) })).toBe("SPACE_OCCUPIED");
    floor.objects = [placed(128, 128, "rug-woven")];
    expect(getWallPlacementError(floor, bounds, wall)).toBe("SPACE_OCCUPIED");
  });
});

describe("flooring junctions and updates", () => {
  const horizontal: Wall = { id: "horizontal", start: { x: 0, y: 128 }, end: { x: 256, y: 128 } };
  const vertical: Wall = { id: "vertical", start: { x: 128, y: 0 }, end: { x: 128, y: 256 } };
  const joint = { x: 128, y: 128 };

  it.each([
    ["corner", [{ ...horizontal, start: joint }, { ...vertical, start: joint }]],
    ["T intersection", [horizontal, { ...vertical, start: joint }]],
    ["cross intersection", [horizontal, vertical]],
  ] as const)("clips every quadrant at a %s", (_name, walls) => {
    const floor = layout([...walls]);
    for (const x of [64, 128]) for (const y of [64, 128]) {
      const candidate = tile(x, y);
      expect(getAssetPlacementError(floor, bounds, candidate)).toBeUndefined();
      verifyCoverage(floor, candidate);
    }
    expect(getAssetPlacementError(floor, bounds, tile(112, 112))).toBe("ASSET_BLOCKED");
  });

  it("keeps opposite materials separate while retaining raster, bounds, and occupancy checks", () => {
    const first = tile(64, 128);
    const second = tile(128, 128, "floor-stone-tiles");
    const floor = layout([vertical], [], [first]);
    expect(getAssetPlacementError(floor, bounds, second)).toBeUndefined();
    const left = getFlooringVisibleRects(floor, [getPlacedAssetBounds(first)]);
    const right = getFlooringVisibleRects(floor, [getPlacedAssetBounds(second)]);
    expect(left.every((rect) => rect.x + rect.width <= 122)).toBe(true);
    expect(right.every((rect) => rect.x >= 134)).toBe(true);
    expect(getAssetPlacementError(floor, bounds, { ...first, id: "duplicate" })).toBe("ASSET_BLOCKED");
    expect(getAssetPlacementError(floor, bounds, { ...second, x: 129 })).toBe("ASSET_OFF_RASTER");
    expect(getAssetPlacementError(floor, bounds, tile(1008, 128))).toBe("ASSET_OUT_OF_RANGE");
  });

  it("recalculates coverage and placement after walls and openings change", () => {
    const floor = layout([horizontal]);
    const candidate = tile(128, 128);
    expect(area(getFlooringVisibleRects(floor, [getPlacedAssetBounds(candidate)]))).toBe(64 * 58);
    floor.openings.push({ id: "door", wallId: horizontal.id, offset: 128, width: 64, type: "door" });
    expect(getAssetPlacementError(floor, bounds, tile(128, 96))).toBeUndefined();
    expect(area(getFlooringVisibleRects(floor, [getPlacedAssetBounds(candidate)]))).toBe(64 * 60);
    floor.openings[0]!.offset = 224;
    floor.revision++;
    expect(getAssetPlacementError(floor, bounds, tile(128, 96))).toBe("ASSET_BLOCKED");
    expect(area(getFlooringVisibleRects(floor, [getPlacedAssetBounds(candidate)]))).toBe(64 * 58);
    floor.walls = [];
    floor.openings = [];
    expect(getAssetPlacementError(floor, bounds, tile(128, 96))).toBeUndefined();
    expect(getFlooringVisibleRects(floor, [getPlacedAssetBounds(candidate)])).toEqual([getPlacedAssetBounds(candidate)]);
  });
});
