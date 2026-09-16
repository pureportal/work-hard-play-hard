import { applyBuildingProject } from "../testing/building-project.js";
import { createTestData } from "../testing/workspace-data.js";
import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@workhard/shared";
import { WorkspaceStore } from "../store.js";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { clientCommandSchema } from "../protocol.js";
import { WorldRuntime } from "./world-runtime.js";

describe("player start point", () => {
  it.each([
    { role: "member" as const, permissions: [] as ("build")[], allowed: true },
    { role: "guest" as const, permissions: [] as ("build")[], allowed: true },
    { role: "member" as const, permissions: ["build"] as ("build")[], allowed: true },
    { role: "admin" as const, permissions: [] as ("build")[], allowed: true },
  ])("applies approved start points for $role without free build privileges", ({ role, permissions, allowed }) => {
    const { store, runtime, events } = fixture();
    store.updateMemberAccess("user-leo", role, permissions);
    const peer = runtime.connect("user-leo", "floor-studio", (event) => events.push(event));
    const before = structuredClone(store.getFloor("floor-studio")!.spawn);
    moveSpawn(runtime, peer, store, events);
    expect(store.getFloor("floor-studio")!.spawn).toEqual(allowed ? { x: 320, y: 320 } : before);
    expect(events.some((event) => event.type === "command.error" && event.code === "EDIT_FORBIDDEN")).toBe(!allowed);
    runtime.stop();
  });

  it("saves the snapped point, broadcasts it, and uses it for a new player after reload", async () => {
    const { store, runtime, events } = fixture();
    const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));
    const before = runtime.serializePlayers().find((player) => player.userId === "user-maya")!;
    const revision = store.getLayout("floor-studio")!.revision;
    moveSpawn(runtime, peer, store, events, { x: 325, y: 314 });
    expect(store.getLayout("floor-studio")!.revision).toBe(revision + 1);
    expect(events).toContainEqual(expect.objectContaining({ type: "floor.updated", floor: expect.objectContaining({ spawn: { x: 320, y: 320 } }) }));
    expect(events).toContainEqual(expect.objectContaining({ type: "layout.updated", requestId: "move-spawn" }));
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")).toMatchObject({ x: before.x, y: before.y });
    const database = new MemoryDatabase();
    await database.saveWorkspaceState({ store: store.exportMutableState(), players: runtime.serializePlayers() });
    const saved = (await database.loadWorkspaceState())!;
    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState(saved.store);
    const reloaded = new WorldRuntime(restored);
    reloaded.restorePlayers(saved.players);
    const member = restored.addMember({ id: "new-player", username: "new-player", email: "new@example.test" }, "member", []);
    expect(member.position).toEqual({ x: 320, y: 320 });
    reloaded.connect(member.id, "floor-studio", () => undefined);
    expect(reloaded.serializePlayers().find((player) => player.userId === member.id)).toMatchObject({ x: 320, y: 320 });
    expect(restored.getBootstrap(member.id).floors[0]!.spawn).toEqual({ x: 320, y: 320 });
    runtime.stop();
    reloaded.stop();
  });

  it("rejects stale project revisions without changing the start point", () => {
    const { store, runtime, events } = fixture();
    store.updateMemberAccess("user-leo", "member", ["build"]);
    const peer = runtime.connect("user-leo", "floor-studio", (event) => events.push(event));
    const revision = store.getLayout("floor-studio")!.revision;
    moveSpawn(runtime, peer, store, events);
    runtime.handleCommand(peer, { type: "project.edit", fundId: "workspace", requestId: "stale", baseRevision: revision, edit: { tool: "spawn", position: { x: 400, y: 400 } } });
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "stale", code: "PROJECT_STALE" }));
    expect(store.getFloor("floor-studio")!.spawn).toEqual({ x: 320, y: 320 });
    runtime.stop();
  });

  it.each(["wall", "asset", "private", "player", "bounds"] as const)("rejects %s overlap", (obstacle) => {
    const { store, runtime, events } = fixture();
    const layout = store.getLayout("floor-studio")!;
    const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));
    const spawn = structuredClone(store.getFloor("floor-studio")!.spawn);
    let position = { x: 320, y: 320 };
    if (obstacle === "wall") layout.walls.push({ id: "wall", start: { x: 256, y: 320 }, end: { x: 384, y: 320 } });
    if (obstacle === "asset") layout.objects.push({ id: "desk", floorId: layout.floorId, assetId: "desk-straight", variantId: "oak", rotation: 0, x: 320, y: 320 });
    if (obstacle === "private") layout.rooms.push({
      ...new WorkspaceStore(createTestData()).getRoom("room-focus")!, id: "private", bounds: { x: 256, y: 256, width: 128, height: 128 },
      footprint: [{ x: 256, y: 256, width: 128, height: 128 }],
      access: { mode: "assigned", assignedPersonIds: ["user-maya"], knockable: true },
    });
    if (obstacle === "player") {
      runtime.restorePlayers([{ userId: "user-maya", floorId: layout.floorId, x: 320, y: 320, facing: "down", availability: "available", connected: true }]);
    }
    if (obstacle === "bounds") position = { x: -512, y: -512 };
    moveSpawn(runtime, peer, store, events, position);
    expect(events.at(-1)).toMatchObject({ type: "command.error", code: obstacle === "private" ? "SPAWN_RESTRICTED" : obstacle === "player" ? "SPACE_OCCUPIED" : obstacle === "bounds" ? "EDIT_OUT_OF_RANGE" : "SPAWN_BLOCKED" });
    expect(store.getFloor("floor-studio")!.spawn).toEqual(spawn);
    runtime.stop();
  });

  it("validates start point coordinates at the protocol boundary", () => {
    const command = { type: "project.edit", fundId: "workspace", requestId: "spawn", baseRevision: 1, edit: { tool: "spawn", position: { x: 32, y: 64 } } };
    expect(clientCommandSchema.safeParse(command).success).toBe(true);
    for (const x of [NaN, Infinity, "32"]) {
      expect(clientCommandSchema.safeParse({ ...command, edit: { tool: "spawn", position: { x, y: 64 } } }).success).toBe(false);
    }
  });
});

function fixture() {
  const store = new WorkspaceStore(createTestData());
  const layout = store.getLayout("floor-studio")!;
  layout.walls = [];
  layout.openings = [];
  layout.objects = [];
  layout.rooms = [];
  for (const member of store.getMembers()) {
    delete member.position;
    member.online = false;
  }
  return { store, runtime: new WorldRuntime(store), events: [] as ServerEvent[] };
}

function moveSpawn(runtime: WorldRuntime, peer: string, store: WorkspaceStore, events: ServerEvent[], position = { x: 320, y: 320 }) {
  const command = { requestId: "move-spawn", baseRevision: store.getLayout("floor-studio")!.revision, edit: { tool: "spawn" as const, position } };
  applyBuildingProject(runtime, store, peer, events, command);
}
