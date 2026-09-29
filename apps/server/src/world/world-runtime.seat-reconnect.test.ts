import { createTestData } from "../testing/workspace-data.js";
import type { ServerEvent, WorldPlayer } from "@workhard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

const chairId = "object-commons-chair-left";
const seat = { objectId: chairId, interactionId: "seat" };
const runtimes: WorldRuntime[] = [];

afterEach(() => runtimes.splice(0).forEach((runtime) => runtime.stop()));

function createSeatingRuntime() {
  const store = new WorkspaceStore(createTestData());
  const runtime = new WorldRuntime(store);
  runtimes.push(runtime);
  runtime.restorePlayers(runtime.serializePlayers().map((player) => {
    if (player.userId === "user-maya") return { ...player, x: 196, y: 256 };
    if (player.userId === "user-leo") return { ...player, x: 196, y: 288 };
    return player;
  }));
  const events: ServerEvent[] = [];
  const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));
  runtime.handleCommand(peer, { type: "asset.interact", requestId: "sit", ...seat });
  expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")).toMatchObject({
    x: 196, y: 256, seat,
  });
  return { store, runtime, peer };
}

function latestPlayer(events: ServerEvent[], userId: string): WorldPlayer | undefined {
  const snapshot = events.filter((event) => event.type === "world.snapshot").at(-1);
  return snapshot?.type === "world.snapshot"
    ? snapshot.players.find((player) => player.userId === userId)
    : undefined;
}

describe("seat reconnection", () => {
  it("resumes an unclaimed seat after disconnect", () => {
    const { runtime, peer } = createSeatingRuntime();
    runtime.disconnect(peer);
    const events: ServerEvent[] = [];
    runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    expect(latestPlayer(events, "user-maya")).toMatchObject({
      x: 240, y: 256, facing: "left", seat,
    });
  });

  it("returns to the saved standing position when another player takes the seat", () => {
    const { runtime, peer } = createSeatingRuntime();
    runtime.disconnect(peer);
    const leoPeer = runtime.connect("user-leo", "floor-studio", () => undefined);
    runtime.handleCommand(leoPeer, { type: "asset.interact", requestId: "sit-leo", ...seat });
    const events: ServerEvent[] = [];
    runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    expect(latestPlayer(events, "user-maya")).toMatchObject({ x: 196, y: 256 });
    expect(latestPlayer(events, "user-maya")?.seat).toBeUndefined();
    expect(latestPlayer(events, "user-leo")?.seat).toEqual(seat);
  });

  it("restores a saved seat after runtime restart", () => {
    const { store, runtime, peer } = createSeatingRuntime();
    runtime.disconnect(peer);
    runtime.stop();
    const saved = runtime.serializePlayers();
    const restored = new WorldRuntime(store);
    runtimes.push(restored);
    restored.restorePlayers(saved);
    const events: ServerEvent[] = [];
    restored.connect("user-maya", "floor-studio", (event) => events.push(event));

    expect(latestPlayer(events, "user-maya")).toMatchObject({
      x: 240, y: 256, facing: "left", seat,
    });
    expect(restored.serializePlayers().find((player) => player.userId === "user-maya")).toMatchObject({
      x: 196, y: 256, seat,
    });
  });

  it("does not resume a removed seat", () => {
    const { store, runtime, peer } = createSeatingRuntime();
    runtime.disconnect(peer);
    const layout = store.getLayout("floor-studio")!;
    layout.objects = layout.objects.filter((object) => object.id !== chairId);
    const events: ServerEvent[] = [];
    runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    expect(latestPlayer(events, "user-maya")?.seat).toBeUndefined();
    expect(latestPlayer(events, "user-maya")).toMatchObject({ x: 196, y: 256 });
  });
});
