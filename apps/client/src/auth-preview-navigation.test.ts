import type { Position, Rect } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { canStandInPreview, canTracePreview, findPreviewPath } from "./auth-preview-navigation";

const pond: Rect = { x: 319, y: 302, width: 102, height: 64 };

function expectWalkablePath(start: Position, destination: Position, obstacles: readonly Rect[]): Position[] {
  const path = findPreviewPath(start, destination, obstacles);
  expect(path.length).toBeGreaterThan(0);
  expect(path.at(-1)).toEqual(destination);
  for (let index = 0; index < path.length; index++) {
    expect(canTracePreview(path[index - 1] ?? start, path[index]!, obstacles)).toBe(true);
  }
  return path;
}

describe("auth preview navigation", () => {
  it("routes through the upper and lower door openings", () => {
    const acrossUpperDoor = expectWalkablePath({ x: 174, y: 180 }, { x: 344, y: 180 }, []);
    expect(acrossUpperDoor.some((point) => point.x === 254 && point.y >= 166 && point.y <= 182)).toBe(true);

    const acrossLowerDoor = expectWalkablePath({ x: 174, y: 180 }, { x: 294, y: 300 }, []);
    expect(acrossLowerDoor.some((point) => point.y === 210 && point.x >= 154 && point.x <= 184)).toBe(true);
    expect(acrossLowerDoor.some((point) => point.x === 254 && point.y >= 296 && point.y <= 318)).toBe(true);
  });

  it("blocks walls and furniture while tracing a route around them", () => {
    expect(canTracePreview({ x: 244, y: 150 }, { x: 264, y: 150 }, [])).toBe(false);
    expect(canTracePreview({ x: 244, y: 170 }, { x: 264, y: 170 }, [])).toBe(true);
    expect(canStandInPreview({ x: 344, y: 340 }, [pond])).toBe(false);
    expect(canTracePreview({ x: 294, y: 340 }, { x: 444, y: 340 }, [pond])).toBe(false);
    const aroundPond = expectWalkablePath({ x: 294, y: 340 }, { x: 444, y: 340 }, [pond]);
    expect(aroundPond.some((point) => point.y < 296)).toBe(true);
  });
});
