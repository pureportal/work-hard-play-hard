import { createTestData } from "../testing/workspace-data.js";
import { getPlacedAssetInteractions, type ServerEvent, type WorldPlayer } from "@workhard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

const runtimes: WorldRuntime[] = [];
afterEach(() => runtimes.splice(0).forEach((runtime) => runtime.stop()));

function fixture({ restricted = true, wall = true, startY = 256 } = {}) {
  const store = new WorkspaceStore(createTestData());
  const layout = store.getLayout("floor-studio")!;
  const roomBounds = { x: 224, y: 96, width: 256, height: 320 };
  const chair = { id: "access-seat", floorId: layout.floorId, assetId: "chair-office", variantId: "white", rotation: 90 as const, x: 240, y: 240 };
  store.replaceLayout({
    ...layout,
    revision: layout.revision + 1,
    objects: [chair],
    walls: wall ? [{ id: "partition", start: { x: 224, y: 96 }, end: { x: 224, y: 416 } }] : [],
    openings: [],
    rooms: restricted ? [{ ...layout.rooms[0]!, id: "private-room", bounds: roomBounds, footprint: [roomBounds],
      access: { mode: "assigned", assignedPersonIds: ["user-leo"], knockable: true } }] : [],
  });
  const runtime = new WorldRuntime(store);
  runtimes.push(runtime);
  runtime.restorePlayers(runtime.serializePlayers().map((player) => ({ ...player, x: 196, y: startY })));
  const events: ServerEvent[] = [];
  const peer = runtime.connect("user-maya", layout.floorId, (event) => events.push(event));
  const interaction = getPlacedAssetInteractions(chair)[0]!;
  const sit = () => runtime.handleCommand(peer, { type: "asset.interact", requestId: "sit", objectId: chair.id, interactionId: interaction.id });
  const player = (): WorldPlayer => events.filter((event) => event.type === "world.snapshot").at(-1)!.players.find((candidate) => candidate.userId === "user-maya")!;
  return { store, runtime, events, peer, sit, player, chair, interaction };
}

describe("seat access", () => {
  it.each([256, 480])("does not enter an assigned room by sitting from y=%s", (startY) => {
    const { runtime, events, sit, player } = fixture({ startY });
    sit();
    for (let tick = 0; tick < 120; tick++) runtime.runTickForTest();
    expect(player().seat).toBeUndefined();
    expect(player().roomId).not.toBe("private-room");
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "sit", code: "DESTINATION_BLOCKED" }));
  });

  it("walks around a partition before sitting on its other side", () => {
    const { runtime, events, sit, player, interaction } = fixture({ restricted: false });
    sit();
    runtime.runTickForTest();
    runtime.runTickForTest();
    expect(player().seat).toBeUndefined();
    for (let tick = 0; tick < 160; tick++) runtime.runTickForTest();
    expect(player()).toMatchObject({ ...interaction.center, seat: { objectId: "access-seat", interactionId: interaction.id } });
    expect(events.filter((event) => event.type === "command.error")).toEqual([]);
  });

  it("walks into an accessible room before taking its seat", () => {
    const { store, runtime, sit, player, interaction } = fixture({ wall: false, startY: 480 });
    const layout = store.getLayout("floor-studio")!;
    store.replaceLayout({ ...layout, revision: layout.revision + 1, rooms: layout.rooms.map((room) => ({ ...room, access: { ...room.access, assignedPersonIds: ["user-maya"] } })) });
    sit();
    runtime.runTickForTest();
    runtime.runTickForTest();
    expect(player().seat).toBeUndefined();
    for (let tick = 0; tick < 120; tick++) runtime.runTickForTest();
    expect(player()).toMatchObject({ ...interaction.center, roomId: "private-room", seat: { objectId: "access-seat" } });
  });

  it("rechecks boundaries when a seat approach finishes", () => {
    const { store, runtime, sit, player, events } = fixture({ restricted: false, wall: false, startY: 480 });
    sit();
    runtime.runTickForTest();
    const layout = store.getLayout("floor-studio")!;
    store.replaceLayout({ ...layout, revision: layout.revision + 1,
      walls: [{ id: "partition", start: { x: 224, y: 96 }, end: { x: 224, y: 416 } }] });
    for (let tick = 0; tick < 160; tick++) runtime.runTickForTest();
    expect(player().seat).toBeUndefined();
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "sit", code: "DESTINATION_BLOCKED" }));
  });

  it("does not bypass room capacity by sitting from outside", () => {
    const { store, runtime, sit, player, events } = fixture({ wall: false });
    const layout = store.getLayout("floor-studio")!;
    store.replaceLayout({ ...layout, revision: layout.revision + 1, rooms: layout.rooms.map((room) => ({ ...room, capacity: 1, access: { ...room.access, mode: "open" as const } })) });
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-leo" ? { ...player, x: 368, y: 368 } : player));
    runtime.connect("user-leo", layout.floorId, () => undefined);
    sit();
    for (let tick = 0; tick < 120; tick++) runtime.runTickForTest();
    expect(player().seat).toBeUndefined();
    expect(events).toContainEqual(expect.objectContaining({ type: "command.error", requestId: "sit", code: "DESTINATION_BLOCKED" }));
  });
});
