import type { ClientCommand, ServerEvent, WorldPlayer } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

describe("WorldRuntime asset seating", () => {
  it("walks to a distant seat and sits automatically", () => {
    const runtime = new WorldRuntime(new DemoStore());
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya"
      ? { ...player, x: 196, y: 400 }
      : player));
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    send(runtime, peer, {
      type: "asset.interact",
      requestId: "walk-and-sit",
      objectId: "object-commons-chair-left",
      interactionId: "seat",
    });
    for (let tick = 0; tick < 160; tick += 1) {
      runtime.runTickForTest();
    }

    expect(events.find((event) => event.type === "command.error" && event.requestId === "walk-and-sit")).toBeUndefined();
    expect(latestPlayer(events, "user-maya")).toMatchObject({
      x: 240,
      y: 256,
      facing: "left",
      seat: { objectId: "object-commons-chair-left", interactionId: "seat" },
    });
    runtime.stop();
  });

  it("centers one player across a multi-cell seat and rejects a second occupant", () => {
    const runtime = new WorldRuntime(new DemoStore());
    runtime.restorePlayers(runtime.serializePlayers().map((player) => {
      if (player.userId === "user-maya") {
        return { ...player, x: 196, y: 256 };
      }
      if (player.userId === "user-leo") {
        return { ...player, x: 196, y: 288 };
      }
      return player;
    }));
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
    const leoPeer = runtime.connect("user-leo", "floor-studio", (event) => leoEvents.push(event));

    send(runtime, mayaPeer, {
      type: "asset.interact",
      requestId: "sit-maya",
      objectId: "object-commons-chair-left",
      interactionId: "seat",
    });
    runtime.runTickForTest();
    runtime.runTickForTest();

    expect(latestPlayer(mayaEvents, "user-maya")).toMatchObject({
      x: 240,
      y: 256,
      facing: "left",
      seat: { objectId: "object-commons-chair-left", interactionId: "seat" },
    });

    send(runtime, leoPeer, {
      type: "asset.interact",
      requestId: "sit-leo",
      objectId: "object-commons-chair-left",
      interactionId: "seat",
    });

    expect(leoEvents.at(-1)).toMatchObject({
      type: "command.error",
      requestId: "sit-leo",
      code: "SEAT_OCCUPIED",
    });
    runtime.stop();
  });

  it("returns a seated player to a valid standing position before movement", () => {
    const runtime = new WorldRuntime(new DemoStore());
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya"
      ? { ...player, x: 196, y: 256 }
      : player));
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    send(runtime, peer, {
      type: "asset.interact",
      requestId: "sit",
      objectId: "object-commons-chair-left",
      interactionId: "seat",
    });
    send(runtime, peer, { type: "movement.input", sequence: 1, dx: -1, dy: 0 });
    runtime.runTickForTest();
    runtime.runTickForTest();

    const player = latestPlayer(events, "user-maya");
    expect(player?.seat).toBeUndefined();
    expect(player?.x).toBeLessThan(196);
    runtime.stop();
  });
});

describe("WorldRuntime asset placement", () => {
  it("places supported decorations and rejects invalid stacking", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "place-laptop",
      baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "asset", assetId: "decor-laptop", variantId: "graphite", rotation: 0, position: { x: 272, y: 240 } },
    });

    expect(events.some((event) => event.type === "command.error" && event.requestId === "place-laptop")).toBe(false);
    expect(store.getLayout("floor-studio")?.objects).toContainEqual(expect.objectContaining({
      assetId: "decor-laptop",
      x: 272,
      y: 240,
    }));

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "stack-lamp",
      baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "asset", assetId: "decor-lamp", variantId: "graphite", rotation: 0, position: { x: 272, y: 240 } },
    });
    expect(events.at(-1)).toMatchObject({ type: "command.error", requestId: "stack-lamp", code: "ASSET_BLOCKED" });

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "floating-lamp",
      baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "asset", assetId: "decor-lamp", variantId: "graphite", rotation: 0, position: { x: 1008, y: 800 } },
    });
    expect(events.at(-1)).toMatchObject({ type: "command.error", requestId: "floating-lamp", code: "ASSET_REQUIRES_SURFACE" });
    runtime.stop();
  });
});

function send(runtime: WorldRuntime, peerId: string, command: ClientCommand): void {
  runtime.handleCommand(peerId, command);
}

function latestPlayer(events: ServerEvent[], userId: string): WorldPlayer | undefined {
  const snapshot = events.filter((event) => event.type === "world.snapshot").at(-1);
  return snapshot?.type === "world.snapshot"
    ? snapshot.players.find((player) => player.userId === userId)
    : undefined;
}
