import { createOrganisation, createPublicEconomy, DEFAULT_GAME_SETTINGS, detectLayoutRooms, mergeWallSegments, type FloorLayout } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { assertProjectScope, quoteProject } from "./project-quote.js";
import { PublicEconomyStore } from "./public-economy-store.js";

const floor = { width: 640, height: 640 };
const organisation = createOrganisation("alice");
const settings = { ...DEFAULT_GAME_SETTINGS, roomBuild: { mode: "open" as const, assignedPersonIds: [] } };
const fund = createPublicEconomy().funds[0]!;

function privateRoom(): FloorLayout {
  const layout = detectLayoutRooms({ floorId: "floor", revision: 0, objects: [], tiles: [], rooms: [], walls: [
    { id: "top", start: { x: 96, y: 96 }, end: { x: 288, y: 96 } },
    { id: "bottom", start: { x: 96, y: 288 }, end: { x: 288, y: 288 } },
    { id: "left", start: { x: 96, y: 96 }, end: { x: 96, y: 288 } },
    { id: "right", start: { x: 288, y: 96 }, end: { x: 288, y: 288 } },
  ], openings: [{ id: "door", wallId: "bottom", type: "door", offset: 64, width: 64 }] }, floor);
  layout.rooms[0]!.access = { mode: "assigned", assignedPersonIds: ["alice"], knockable: true };
  layout.rooms[0]!.build = { mode: "assigned", assignedPersonIds: ["alice"] };
  return layout;
}

describe("project safety", () => {
  it("does not report unchanged construction when adjoining wall segments are merged", () => {
    const previous = privateRoom();
    previous.walls.splice(0, 1,
      { id: "top-left", start: { x: 96, y: 96 }, end: { x: 192, y: 96 } },
      { id: "top-right", start: { x: 192, y: 96 }, end: { x: 288, y: 96 } });
    const next = { ...previous, ...mergeWallSegments(previous.walls, previous.openings) };
    expect(next.walls.length).toBeLessThan(previous.walls.length);
    expect(quoteProject(previous, next, "workspace", [])).toMatchObject({ structural: false, cost: 0, refund: 0 });
    next.openings = [{ ...next.openings[0]!, offset: next.openings[0]!.offset + 32 }];
    expect(quoteProject(previous, next, "workspace", []).structural).toBe(true);
  });

  it("does not expose a private room by removing its last door", () => {
    const previous = privateRoom();
    const next = detectLayoutRooms({ ...previous, openings: [] }, floor);
    expect(next.rooms[0]!.access.mode).toBe("open");
    expect(() => assertProjectScope(previous, next, fund, "alice", settings, organisation)).toThrow("ROOM_PRIVACY_PROTECTED");
  });

  it("does not demolish or divide a private room, even for its owner or CEO", () => {
    const previous = privateRoom();
    const opened = detectLayoutRooms({ ...previous, walls: previous.walls.filter((wall) => wall.id !== "right") }, floor);
    expect(() => assertProjectScope(previous, opened, fund, "alice", settings, organisation)).toThrow("ROOM_PRIVACY_PROTECTED");
    const divided = detectLayoutRooms({ ...previous, walls: [...previous.walls, { id: "divider", start: { x: 192, y: 96 }, end: { x: 192, y: 288 } }] }, floor);
    expect(divided.rooms).toHaveLength(2);
    expect(() => assertProjectScope(previous, divided, fund, "alice", settings, organisation)).toThrow("ROOM_PRIVACY_PROTECTED");
  });

  it("protects inherited private access and allows moving a door without exposing the room", () => {
    const previous = privateRoom();
    const moved = detectLayoutRooms({ ...previous, openings: [{ ...previous.openings[0]!, offset: 96 }] }, floor);
    expect(() => assertProjectScope(previous, moved, fund, "alice", settings, organisation)).not.toThrow();
    previous.rooms[0]!.access = { mode: "default", assignedPersonIds: [], knockable: false };
    const next = detectLayoutRooms({ ...previous, openings: [] }, floor);
    const inherited = { ...settings, roomAccess: { mode: "assigned" as const, assignedPersonIds: ["alice"] } };
    expect(() => assertProjectScope(previous, next, fund, "alice", inherited, organisation)).toThrow("ROOM_PRIVACY_PROTECTED");
  });

  it("permits open-room demolition only for people with building permission", () => {
    const previous = privateRoom();
    previous.rooms[0]!.access = { mode: "open", assignedPersonIds: [], knockable: false };
    const next = detectLayoutRooms({ ...previous, walls: previous.walls.filter((wall) => wall.id !== "right") }, floor);
    expect(() => assertProjectScope(previous, next, fund, "bob", settings, organisation)).toThrow("ASSET_ROOM_FORBIDDEN");
    expect(() => assertProjectScope(previous, next, fund, "alice", settings, organisation)).not.toThrow();
  });

  it("returns demolition money to the original fund and never refunds free seed construction", () => {
    const previous = privateRoom();
    const next = { ...previous, walls: [], openings: [], rooms: [] };
    const quote = quoteProject(previous, next, "workspace", [{ key: "wall:h:96:96", floorId: "floor", fundId: "design", paid: 12 }]);
    expect(quote.refunds).toEqual([{ fundId: "design", amount: 4 }]);
    expect(quote.cost).toBe(0);
    expect(quote.refund).toBe(4);
    expect(quoteProject(previous, next, "workspace", []).refund).toBe(0);
  });

  it("releases money reserved by a project when another edit makes it stale", () => {
    const economy = new PublicEconomyStore();
    economy.record("workspace", "alice", "donation", 100, "donation");
    const layout = privateRoom();
    const proposal = economy.propose("alice", "Wall", { kind: "project", project: {
      id: "draft", floorId: "floor", fundId: "workspace", baseRevision: 0, layout, edits: 1,
      quote: { assetChanges: [], cost: 40, refund: 0, refunds: [], structural: true, destructive: false, requiresApproval: true, purchases: [], removedKeys: [], inventoryIds: [] },
    } }, "workspace", createOrganisation(), ["alice", "bob"]);
    expect(economy.invalidateLayoutProposals([{ ...layout, revision: 1 }])).toBe(true);
    expect(economy.proposal(proposal.id).status).toBe("cancelled");
    expect(economy.fund("workspace").balance).toBe(100);
    expect(economy.invalidateLayoutProposals([{ ...layout, revision: 1 }])).toBe(false);
  });
});
