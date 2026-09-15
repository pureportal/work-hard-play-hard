import { createTestData } from "../testing/workspace-data.js";
import { describe, expect, it } from "vitest";
import { detectLayoutRooms, type ServerEvent, type WorldPlayer } from "@workhard/shared";
import { WorkspaceStore } from "../store.js";
import { clientCommandSchema } from "../protocol.js";
import { WorldRuntime } from "./world-runtime.js";

describe("builder room accessibility", () => {
  it("uses the selected player's assignments across floors, without an administrator bypass", () => {
    const { store, runtime, events, peer, roomId } = fixture();
    inspect(runtime, peer, "user-leo");
    expect(status(events, roomId)).toBe("accessible");
    const result = events.findLast((event) => event.type === "room.accessibility");
    expect(result?.accessibility.floors.map((floor) => floor.floorId)).toEqual(store.getFloors().map((floor) => floor.id));
    inspect(runtime, peer, "user-maya");
    expect(status(events, roomId)).toBe("restricted");
    expect(status(events, "room-garden")).toBe("accessible");
    runtime.stop();
  });

  it("includes temporary admission and updates when it is revoked", () => {
    const { store, runtime, events, peer, roomId } = fixture();
    runtime.restorePlayers([person("user-leo", 160, 220), person("user-amara", 160, 292)]);
    const hostEvents: ServerEvent[] = [];
    const host = runtime.connect("user-leo", "floor-studio", (event) => hostEvents.push(event));
    const target = runtime.connect("user-amara", "floor-studio", () => undefined);
    inspect(runtime, peer, "user-amara");
    expect(status(events, roomId)).toBe("restricted");
    runtime.handleCommand(target, { type: "room.knock", requestId: "knock", roomId });
    const knock = hostEvents.find((event) => event.type === "room.knock_requested");
    expect(knock).toBeDefined();
    runtime.handleCommand(host, { type: "room.knock_respond", requestId: "admit", knockId: knock!.knock.id, accept: true });
    refresh(runtime);
    expect(status(events, roomId)).toBe("accessible");
    runtime.handleCommand(peer, { type: "room.update_settings", requestId: "revoke", roomId, baseRevision: store.getLayout("floor-studio")!.revision,
      settings: { name: "Private", color: "#abcdef", access: { mode: "assigned", assignedPersonIds: ["user-leo"], knockable: true } } });
    refresh(runtime);
    expect(status(events, roomId)).toBe("restricted");
    runtime.stop();
  });

  it("reports capacity for the selected player and updates when occupancy changes", () => {
    const { store, runtime, events, peer, roomId } = fixture();
    store.getRoom(roomId)!.access = { mode: "open", assignedPersonIds: [], knockable: false };
    store.getRoom(roomId)!.capacity = 1;
    runtime.restorePlayers([person("user-leo", 160, 220)]);
    const host = runtime.connect("user-leo", "floor-studio", () => undefined);
    inspect(runtime, peer, "user-amara");
    expect(status(events, roomId)).toBe("full");
    inspect(runtime, peer, "user-leo");
    expect(status(events, roomId)).toBe("accessible");
    inspect(runtime, peer, "user-amara");
    runtime.disconnect(host);
    refresh(runtime);
    expect(status(events, roomId)).toBe("accessible");
    runtime.stop();
  });

  it("requires build permission, validates the target, and stops updates after revocation or closing", () => {
    const { store, runtime, events, roomId } = fixture();
    store.updateMemberAccess("user-leo", "member", []);
    const peer = runtime.connect("user-leo", "floor-studio", (event) => events.push(event));
    inspect(runtime, peer, "user-maya");
    expect(events.at(-1)).toMatchObject({ type: "command.error", code: "EDIT_FORBIDDEN" });
    store.updateMemberAccess("user-leo", "member", ["build"]);
    inspect(runtime, peer, "missing");
    expect(events.at(-1)).toMatchObject({ type: "command.error", code: "USER_NOT_FOUND" });
    inspect(runtime, peer, "user-maya");
    expect(events.at(-1)?.type).toBe("room.accessibility");
    store.updateMemberAccess("user-leo", "member", []);
    events.length = 0;
    refresh(runtime);
    expect(events.filter((event) => event.type === "room.accessibility")).toEqual([]);
    store.updateMemberAccess("user-leo", "member", ["build"]);
    inspect(runtime, peer, "user-maya");
    runtime.handleCommand(peer, { type: "room.inspect_access", requestId: "close", userId: null });
    events.length = 0;
    store.getRoom(roomId)!.access = { mode: "open", assignedPersonIds: [], knockable: false };
    refresh(runtime);
    expect(events.filter((event) => event.type === "room.accessibility")).toEqual([]);
    expect(clientCommandSchema.safeParse({ type: "room.inspect_access", requestId: "inspect", userId: "user-maya" }).success).toBe(true);
    expect(clientCommandSchema.safeParse({ type: "room.inspect_access", requestId: "inspect", userId: "" }).success).toBe(false);
    runtime.stop();
  });

  it("removes an inspection when its builder disconnects", () => {
    const { store, runtime, events, peer, roomId } = fixture();
    inspect(runtime, peer, "user-maya");
    runtime.disconnect(peer);
    store.getRoom(roomId)!.access = { mode: "open", assignedPersonIds: [], knockable: false };
    events.length = 0;
    runtime.connect("user-leo", "floor-studio", () => undefined);
    refresh(runtime);
    expect(events.filter((event) => event.type === "room.accessibility")).toEqual([]);
    runtime.stop();
  });
});

function fixture() {
  const store = new WorkspaceStore(createTestData());
  const floor = store.getFloor("floor-studio")!;
  const layout = detectLayoutRooms({
    ...store.getLayout(floor.id)!, rooms: [], objects: [],
    walls: [
      { id: "top", start: { x: 64, y: 64 }, end: { x: 256, y: 64 } },
      { id: "bottom", start: { x: 64, y: 256 }, end: { x: 256, y: 256 } },
      { id: "left", start: { x: 64, y: 64 }, end: { x: 64, y: 256 } },
      { id: "right", start: { x: 256, y: 64 }, end: { x: 256, y: 256 } },
    ],
    openings: [{ id: "door", wallId: "bottom", type: "door", offset: 64, width: 64 }],
  }, floor);
  const room = layout.rooms[0]!;
  room.access = { mode: "assigned", assignedPersonIds: ["user-leo"], knockable: true };
  layout.revision += 1;
  store.replaceLayout(layout);
  const runtime = new WorldRuntime(store);
  const events: ServerEvent[] = [];
  const peer = runtime.connect("user-maya", floor.id, (event) => events.push(event));
  return { store, runtime, events, peer, roomId: room.id };
}

function person(userId: string, x: number, y: number): WorldPlayer {
  return { userId, floorId: "floor-studio", x, y, facing: "down", availability: "available", connected: true };
}

function inspect(runtime: WorldRuntime, peer: string, userId: string) {
  runtime.handleCommand(peer, { type: "room.inspect_access", requestId: "inspect", userId });
}

function status(events: ServerEvent[], roomId: string) {
  return events.findLast((event) => event.type === "room.accessibility")?.accessibility.floors
    .flatMap((floor) => floor.rooms).find((room) => room.roomId === roomId)?.status;
}

function refresh(runtime: WorldRuntime) {
  runtime.runTickForTest();
  runtime.runTickForTest();
}
