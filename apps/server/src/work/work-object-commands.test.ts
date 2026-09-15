import { createTestData } from "../testing/workspace-data.js";
import { describe, expect, it, vi } from "vitest";
import type { ClientCommand, ServerEvent } from "@workhard/shared";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "../world/world-runtime.js";
import { saveWorkObject } from "./work-object-commands.js";

function fixture() {
  const store = new WorkspaceStore(createTestData());
  const layout = store.getLayout("floor-studio")!;
  const board = { id: "save-board", assetId: "equipment-whiteboard", floorId: layout.floorId, x: 192, y: 192, rotation: 0 as const, variantId: "violet" };
  store.replaceLayout({ ...layout, revision: layout.revision + 1, objects: [board], walls: [], openings: [], rooms: [] });
  const runtime = new WorldRuntime(store);
  runtime.restorePlayers(runtime.serializePlayers().map((player) => ({ ...player, x: 240, y: 230 })));
  const events: ServerEvent[] = [];
  const send = (event: ServerEvent) => events.push(event);
  const peerId = runtime.connect("user-maya", layout.floorId, send);
  const database = new MemoryDatabase();
  const command: Extract<ClientCommand, { type: "work.update" }> = { type: "work.update", objectId: board.id, baseRevision: 0, requestId: "save", edit: { type: "whiteboard.save", document: { text: "Plan", cards: [] } } };
  return { store, runtime, peerId, database, command, send, events };
}

describe("durable work object acknowledgement", () => {
  it("waits for database persistence before acknowledging a successful save", async () => {
    const context = fixture();
    let finish!: () => void;
    const persist = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const saving = saveWorkObject(context.command, { ...context, persist });
    expect(context.events.some((event) => event.type === "layout.updated")).toBe(true);
    expect(context.events.some((event) => event.type === "work.saved")).toBe(false);
    finish();
    await saving;
    expect(context.events.at(-1)).toEqual({ type: "work.saved", requestId: "save" });
  });

  it("does not acknowledge failed database writes or stale commands", async () => {
    const context = fixture();
    await expect(saveWorkObject(context.command, { ...context, persist: async () => { throw new Error("Database unavailable"); } })).rejects.toThrow("Database unavailable");
    expect(context.events.some((event) => event.type === "work.saved")).toBe(false);
    const persist = vi.fn();
    await saveWorkObject(context.command, { ...context, persist });
    expect(persist).not.toHaveBeenCalled();
    expect(context.events.at(-1)).toMatchObject({ type: "command.error", code: "WORK_OBJECT_CONFLICT" });
  });

  it("rejects an expired image without storing a broken reference", async () => {
    const context = fixture();
    const command: typeof context.command = { ...context.command, edit: { type: "whiteboard.save", document: { text: "", cards: [{ id: "image", kind: "image", src: `/v1/whiteboards/images/${"a".repeat(64)}`, title: "", text: "", color: "blue", status: "todo", dueDate: "", x: 0, y: 0, width: 240, height: 220 }] } } };
    const persist = vi.fn();
    await saveWorkObject(command, { ...context, persist });
    expect(persist).not.toHaveBeenCalled();
    expect(context.events.at(-1)).toMatchObject({ type: "command.error", code: "IMAGE_NOT_FOUND" });
    expect(context.store.getObject(command.objectId)?.workState).toBeUndefined();
  });
});
