import { describe, expect, it } from "vitest";
import { rebaseProjectLayout, type BuildProject, type FloorLayout, type WorldObject } from "@workhard/shared";

const floor = { width: 640, height: 640 };
const base: FloorLayout = { floorId: "floor", revision: 0, walls: [], openings: [], objects: [], tiles: [], rooms: [] };
const chair = (id: string, x: number): WorldObject => ({ id, floorId: "floor", assetId: "chair-office", variantId: "white", rotation: 0, x, y: 64 });
const project = (objects: WorldObject[]): BuildProject => ({
  id: "draft", fundId: "workspace", floorId: "floor", baseRevision: 0, baseLayout: base,
  layout: { ...base, revision: 1, objects }, edits: 1,
  quote: { assetChanges: [], cost: 0, refund: 0, refunds: [], structural: false, destructive: false,
    requiresApproval: true, purchases: [], removedKeys: [], inventoryIds: [] },
});

describe("project layout overlap", () => {
  it("merges a separate object placed after submission", () => {
    const result = rebaseProjectLayout(project([chair("draft-chair", 64)]),
      { ...base, revision: 1, objects: [chair("other-chair", 192)] }, floor);
    expect(result.conflicts).toEqual([]);
    expect(result.layout.objects.map((object) => object.id)).toEqual(["other-chair", "draft-chair"]);
  });

  it("finds object overlap introduced after submission", () => {
    const result = rebaseProjectLayout(project([chair("draft-chair", 64)]),
      { ...base, revision: 1, objects: [chair("other-chair", 64)] }, floor);
    expect(result.conflicts).toContainEqual({ kind: "object", id: "draft-chair", reason: "overlap" });
  });

  it("prechecks overlap within a proposed layout", () => {
    const result = rebaseProjectLayout(project([chair("first", 64), chair("second", 64)]), base, floor);
    expect(result.conflicts).toContainEqual({ kind: "object", id: "first", reason: "overlap" });
    expect(result.conflicts).toContainEqual({ kind: "object", id: "second", reason: "overlap" });
  });
});
