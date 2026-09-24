import { describe, expect, it } from "vitest";
import { PreviewActor, previewActivities } from "./auth-preview-behavior";
import { canStandInPreview, findPreviewPath, previewFurnitureObstacles } from "./auth-preview-navigation";

const starts = [
  { x: 174, y: 180 },
  { x: 354, y: 180 },
  { x: 294, y: 340 },
  { x: 444, y: 340 },
];

describe("auth preview activities", () => {
  it("keeps every activity reachable from every room", () => {
    for (const activity of previewActivities) {
      expect(canStandInPreview(activity.position, previewFurnitureObstacles), activity.id).toBe(true);
      for (const start of [...starts, ...previewActivities.map(({ position }) => position)]) {
        expect(findPreviewPath(start, activity.position, previewFurnitureObstacles).length, `${activity.id} from ${JSON.stringify(start)}`).toBeGreaterThan(0);
      }
    }
  });

  it("sits at the bench, waits, then faces the chess table", () => {
    const actor = new PreviewActor(0, starts[0]!, previewFurnitureObstacles, () => 0);
    actor.advance(50, new Set());
    expect(actor.activity?.id).toBe("bench");

    for (let frame = 0; frame < 500 && actor.motion !== "sit"; frame++) {
      actor.advance(50, new Set(["bench"]));
      expect(canStandInPreview(actor.position, previewFurnitureObstacles)).toBe(true);
    }
    expect(actor.motion).toBe("sit");
    expect(actor.direction).toBe("down");
    expect(actor.seatOffsetY).toBeLessThan(0);
    actor.advance(6000, new Set(["bench"]));
    expect(actor.motion).toBe("sit");
    actor.advance(1100, new Set(["bench"]));
    actor.advance(350, new Set());
    expect(actor.activity?.id).toBe("chess");

    for (let frame = 0; frame < 500 && actor.motion === "walk"; frame++) {
      actor.advance(50, new Set(["chess"]));
      expect(canStandInPreview(actor.position, previewFurnitureObstacles)).toBe(true);
    }
    expect(actor.motion).toBe("idle");
    expect(actor.direction).toBe("left");
    expect(actor.position).toEqual({ x: 215, y: 311 });
  });

  it("assigns distinct opening activities to all four walkers", () => {
    const actors = starts.map((start, index) => new PreviewActor(index, start, previewFurnitureObstacles, () => 0));
    const reserved = new Set<string>();
    for (const actor of actors) {
      actor.advance(2000, reserved);
      expect(actor.activity).toBeDefined();
      reserved.add(actor.activity!.id);
    }
    expect([...reserved]).toEqual(["bench", "chess", "sofa", "coffee"]);
  });
});
