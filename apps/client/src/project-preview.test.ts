import { describe, expect, it } from "vitest";
import type { BuildProject, FloorLayout } from "@workhard/shared";
import { projectPreviewBounds } from "./project-preview";

const layout: FloorLayout = { floorId: "floor", revision: 0, walls: [], openings: [], tiles: [], objects: [], rooms: [] };
const project: BuildProject = { id: "proposal", floorId: "floor", fundId: "workspace", baseRevision: 0, baseLayout: layout, edits: 1, layout,
  quote: { assetChanges: [], cost: 0, refund: 0, refunds: [], structural: true, destructive: true,
    requiresApproval: true, purchases: [], removedKeys: [], inventoryIds: [] } };

describe("proposal preview bounds", () => {
  it("includes removed construction as well as added construction", () => {
    const saved = { ...layout, walls: [{ id: "old", start: { x: 0, y: 0 }, end: { x: 64, y: 0 } }] };
    const draft = { ...layout, walls: [{ id: "new", start: { x: 128, y: 128 }, end: { x: 192, y: 128 } }] };
    expect(projectPreviewBounds(saved, { ...project, layout: draft })).toEqual({ x: 0, y: -6, width: 192, height: 140 });
  });

  it("focuses arrival-point changes even without construction", () => {
    expect(projectPreviewBounds(layout, { ...project, spawn: { x: 256, y: 128 } })).toEqual({ x: 256, y: 128, width: 0, height: 0 });
    expect(projectPreviewBounds(layout, project)).toBeUndefined();
  });
});
