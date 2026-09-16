import { applyBuildingProject } from "../testing/building-project.js";
import { createTestData } from "../testing/workspace-data.js";
import {
  ASSET_ROTATIONS, CHECKLIST_ITEM_LIMIT, CHECKLIST_TEXT_LIMIT, WHITEBOARD_TEXT_LIMIT,
  getAssetVariants, getPlacedAssetCells, getWorkObjectState, requireAssetDefinition,
  canUseWorkObject,
  type ClientCommand, type ServerEvent, type WorkObjectEdit, type WorldObject,
} from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceStore } from "../store.js";
import { clientCommandSchema } from "../protocol.js";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { WorldRuntime } from "./world-runtime.js";

const runtimes: WorldRuntime[] = [];
afterEach(() => {
  runtimes.splice(0).forEach((runtime) => runtime.stop());
  vi.useRealTimers();
});

function fixture() {
  const store = new WorkspaceStore(createTestData());
  const layout = store.getLayout("floor-studio")!;
  const objects: WorldObject[] = [
    { id: "notes", assetId: "equipment-whiteboard", floorId: layout.floorId, x: 192, y: 192, rotation: 0, variantId: "graphite" },
    { id: "tasks", assetId: "equipment-checklist", floorId: layout.floorId, x: 336, y: 192, rotation: 0, variantId: "white" },
  ];
  store.replaceLayout({ ...layout, revision: layout.revision + 1, walls: [], openings: [], rooms: [], objects });
  const runtime = new WorldRuntime(store);
  runtimes.push(runtime);
  runtime.restorePlayers(runtime.serializePlayers().map((player) => ({ ...player, x: 324, y: 232 })));
  const events: ServerEvent[] = [];
  const teammateEvents: ServerEvent[] = [];
  const peer = runtime.connect("user-maya", layout.floorId, (event) => events.push(event));
  const teammate = runtime.connect("user-leo", layout.floorId, (event) => teammateEvents.push(event));
  const update = (objectId: string, edit: WorkObjectEdit, baseRevision = getWorkObjectState(store.getObject(objectId)!)!.revision, source = peer) => {
    const command: ClientCommand = { type: "work.update", requestId: crypto.randomUUID(), objectId, baseRevision, edit };
    runtime.handleCommand(source, clientCommandSchema.parse(command) as ClientCommand);
    return command.requestId;
  };
  return { store, runtime, peer, teammate, events, teammateEvents, update };
}

describe("work objects", () => {
  it("rejects a board that would trap a standing player", () => {
    const { runtime, store, peer, events } = fixture();
    const count = store.getLayout("floor-studio")!.objects.length;
    applyBuildingProject(runtime, store, peer, events, { requestId: "overlap", baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "asset", assetId: "equipment-checklist", position: { x: 288, y: 224 }, rotation: 0, variantId: "graphite" } });
    expect(events.at(-1)).toMatchObject({ code: "PLAYER_IN_THE_WAY", requestId: "overlap" });
    expect(store.getLayout("floor-studio")!.objects).toHaveLength(count);
  });

  it("walks to a reachable side when furniture blocks the nearest approach", () => {
    vi.useFakeTimers();
    const { runtime, store, peer, events } = fixture();
    const layout = store.getLayout("floor-studio")!;
    store.replaceLayout({ ...layout, revision: layout.revision + 1, objects: [...layout.objects,
      { id: "blocking-desk", assetId: "desk-straight", floorId: layout.floorId, x: 224, y: 224, rotation: 0, variantId: "sage" }] });
    runtime.restorePlayers(runtime.serializePlayers().map((player) => ({ ...player, x: 256, y: 400 })));
    runtime.start();
    runtime.handleCommand(peer, { type: "work.approach", requestId: "approach", objectId: "notes" });
    vi.advanceTimersByTime(5_000);
    expect(events.filter((event) => event.type === "command.error")).toEqual([]);
    const player = runtime.serializePlayers().find((candidate) => candidate.userId === "user-maya")!;
    expect(canUseWorkObject(store.getObject("notes")!, store.getLayout("floor-studio")!, player)).toBe(true);
  });

  it("shares saved notes and checklist operations with another player and reconnects", () => {
    const { store, runtime, teammate, teammateEvents, update } = fixture();
    const id = update("notes", { type: "whiteboard.save", document: { text: "Launch plan\nReview the demo", cards: [] } });
    expect(store.getObject("notes")!.workState).toEqual({ kind: "whiteboard", revision: 1, document: { text: "Launch plan\nReview the demo", cards: [] } });
    expect(teammateEvents).toContainEqual(expect.objectContaining({ type: "layout.updated", layout: expect.objectContaining({ objects: expect.arrayContaining([expect.objectContaining({ id: "notes", workState: expect.objectContaining({ revision: 1 }) })]) }) }));
    expect(teammateEvents.some((event) => "requestId" in event && event.requestId === id)).toBe(false);
    update("tasks", { type: "checklist.add", text: "  Review demo  " }, 0, teammate);
    const state = getWorkObjectState(store.getObject("tasks")!)!;
    if (state.kind !== "checklist") throw new Error("Expected checklist");
    const itemId = state.items[0]!.id;
    expect(state.items[0]!.text).toBe("Review demo");
    update("tasks", { type: "checklist.rename", itemId, text: "Review release demo" });
    update("tasks", { type: "checklist.complete", itemId, completed: true });
    expect(store.getObject("tasks")!.workState).toMatchObject({ revision: 3, items: [{ id: itemId, text: "Review release demo", completed: true }] });
    runtime.disconnect(teammate);
    const reconnect: ServerEvent[] = [];
    runtime.connect("user-leo", "floor-studio", (event) => reconnect.push(event));
    const snapshot = reconnect.find((event) => event.type === "workspace.snapshot");
    expect(snapshot?.data.layouts.find((layout) => layout.floorId === "floor-studio")!.objects).toEqual(store.getLayout("floor-studio")!.objects);
    update("tasks", { type: "checklist.complete", itemId, completed: false });
    update("tasks", { type: "checklist.remove", itemId });
    expect(store.getObject("tasks")!.workState).toEqual({ kind: "checklist", revision: 5, items: [] });
  });

  it("rejects stale edits without overwriting content and keeps board revisions independent", () => {
    const { store, events, teammate, update } = fixture();
    update("notes", { type: "whiteboard.save", document: { text: "First", cards: [] } });
    const requestId = update("notes", { type: "whiteboard.save", document: { text: "Stale", cards: [] } }, 0);
    expect(events.at(-1)).toMatchObject({ type: "command.error", code: "WORK_OBJECT_CONFLICT", requestId });
    expect(store.getObject("notes")!.workState).toMatchObject({ document: { text: "First" } });
    update("tasks", { type: "checklist.add", text: "Separate board" }, 0, teammate);
    expect(store.getObject("tasks")!.workState?.revision).toBe(1);
    update("notes", { type: "checklist.add", text: "Wrong action" });
    expect(events.at(-1)).toMatchObject({ code: "WORK_OBJECT_INVALID" });
    update("tasks", { type: "checklist.complete", itemId: "gone", completed: true });
    expect(events.at(-1)).toMatchObject({ code: "CHECKLIST_ITEM_NOT_FOUND" });
  });

  it("preserves content across movement, rotation, persistence, and restores without sharing instances", async () => {
    const { store, runtime, peer, update, events } = fixture();
    update("notes", { type: "whiteboard.save", document: { text: "Saved notes", cards: [] } });
    update("tasks", { type: "checklist.add", text: "Saved task" });
    const before = structuredClone(store.getObject("notes")!.workState);
    applyBuildingProject(runtime, store, peer, events, { requestId: "move", baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "asset.move", objectId: "notes", position: { x: 128, y: 320 }, rotation: 90, variantId: "violet" } });
    expect(store.getObject("notes")).toMatchObject({ x: 128, y: 320, rotation: 90, variantId: "violet", workState: before });
    const database = new MemoryDatabase();
    await database.saveWorkspaceState({ store: store.exportMutableState(), players: runtime.serializePlayers() });
    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState((await database.loadWorkspaceState())!.store);
    expect(restored.getLayout("floor-studio")).toEqual(store.getLayout("floor-studio"));
    expect(restored.getObject("notes")!.workState).not.toBe(store.getObject("notes")!.workState);
    applyBuildingProject(runtime, store, peer, events, { requestId: "remove", baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "item.remove", item: { type: "asset", id: "notes" } } });
    expect(store.getObject("notes")).toBeUndefined();
    expect(store.getObject("tasks")!.workState).toMatchObject({ items: [{ text: "Saved task" }] });
  });

  it("allows only nearby players on the same side of room boundaries to change a board", () => {
    const { store, runtime, peer, events, update } = fixture();
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya" ? { ...player, x: 800, y: 500 } : player));
    update("notes", { type: "whiteboard.save", document: { text: "Too far", cards: [] } });
    expect(events.at(-1)).toMatchObject({ code: "WORK_OBJECT_TOO_FAR" });
    runtime.handleCommand(peer, { type: "work.update", requestId: "wrong-floor", objectId: "object-rooftop-whiteboard", baseRevision: 0, edit: { type: "whiteboard.save", document: { text: "Invalid", cards: [] } } });
    expect(events.at(-1)).toMatchObject({ code: "WORK_OBJECT_NOT_FOUND" });
    const sourceRoom = new WorkspaceStore(createTestData()).getLayout("floor-studio")!.rooms[0]!;
    const layout = store.getLayout("floor-studio")!;
    store.replaceLayout({ ...layout, revision: layout.revision + 1, rooms: [{ ...sourceRoom, bounds: { x: 192, y: 160, width: 128, height: 64 }, footprint: [{ x: 192, y: 160, width: 128, height: 64 }] }] });
    runtime.restorePlayers(runtime.serializePlayers().map((player) => ({ ...player, x: 256, y: 232 })));
    update("notes", { type: "whiteboard.save", document: { text: "Through wall", cards: [] } });
    expect(events.at(-1)).toMatchObject({ code: "WORK_OBJECT_TOO_FAR" });
    expect(store.getObject("notes")!.workState).toBeUndefined();
  });

  it("validates text, item counts, unique IDs, state kinds, and restored revisions", () => {
    const { store, events, update } = fixture();
    const command = { type: "work.update", requestId: "invalid", objectId: "notes", baseRevision: 0 };
    for (const edit of [{ type: "whiteboard.save", document: { text: "x".repeat(WHITEBOARD_TEXT_LIMIT + 1), cards: [] } }, { type: "checklist.add", text: " " }, { type: "checklist.add", text: "x".repeat(CHECKLIST_TEXT_LIMIT + 1) }]) {
      expect(clientCommandSchema.safeParse({ ...command, edit }).success).toBe(false);
    }
    const state = store.exportMutableState();
    const object = state.layouts.find((layout) => layout.floorId === "floor-studio")!.objects.find((candidate) => candidate.id === "tasks")!;
    object.workState = { kind: "checklist", revision: 1, items: Array.from({ length: CHECKLIST_ITEM_LIMIT }, (_, index) => ({ id: String(index), text: "Task", completed: false })) };
    store.restoreMutableState(state);
    update("tasks", { type: "checklist.add", text: "Overflow" });
    expect(events.at(-1)).toMatchObject({ code: "CHECKLIST_FULL" });
    object.workState.items[1]!.id = object.workState.items[0]!.id;
    expect(() => store.restoreMutableState(state)).toThrow("WORK_OBJECT_STATE_INVALID");
    object.workState = { kind: "whiteboard", revision: 1, document: { text: "Wrong type", cards: [] } };
    expect(() => store.restoreMutableState(state)).toThrow("WORK_OBJECT_STATE_INVALID");
    object.workState = { kind: "checklist", revision: -1, items: [] };
    expect(() => store.restoreMutableState(state)).toThrow("WORK_OBJECT_STATE_INVALID");
  });

  it("keeps the existing board footprint, layers, materials, and all rotations", () => {
    const whiteboard = requireAssetDefinition("equipment-whiteboard");
    const checklist = requireAssetDefinition("equipment-checklist");
    expect(whiteboard.footprint).toEqual([{ range: { x: 0, y: 0, width: 8, height: 1 }, type: "body", solid: true }]);
    expect(checklist.footprint).toEqual(whiteboard.footprint);
    expect(checklist.placement).toEqual(whiteboard.placement);
    expect(getAssetVariants(checklist)).toEqual(getAssetVariants(whiteboard));
    for (const rotation of ASSET_ROTATIONS) {
      const object: WorldObject = { id: "board", floorId: "floor", assetId: checklist.id, x: 32, y: 64, variantId: "graphite", rotation };
      const cells = getPlacedAssetCells(object);
      expect(cells).toHaveLength(8);
      expect(cells.every((cell) => cell.solid && cell.worldX % 16 === 0 && cell.worldY % 16 === 0)).toBe(true);
    }
  });
});
