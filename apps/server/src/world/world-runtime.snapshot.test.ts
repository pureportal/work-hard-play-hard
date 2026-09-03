import type { ServerEvent, WorldPlayer, WorldSnapshot } from "@workhard/shared";
import { describe, expect, it, vi } from "vitest";
import { DemoStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

describe("WorldRuntime snapshot fanout", () => {
  it("reuses one assembled snapshot for peers on the same floor", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const firstEvents: ServerEvent[] = [];
    const secondEvents: ServerEvent[] = [];
    runtime.connect("user-maya", "floor-studio", (event) => firstEvents.push(event));
    runtime.connect("user-leo", "floor-studio", (event) => secondEvents.push(event));
    firstEvents.length = 0;
    secondEvents.length = 0;

    runtime.runTickForTest();
    runtime.runTickForTest();

    const firstSnapshot = firstEvents.find((event): event is WorldSnapshot => event.type === "world.snapshot");
    const secondSnapshot = secondEvents.find((event): event is WorldSnapshot => event.type === "world.snapshot");
    expect(firstSnapshot).toBeDefined();
    expect(secondSnapshot).toBe(firstSnapshot);
  });

  it("uses floor indexes when broadcasting snapshots across floors", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const studioEvents: ServerEvent[] = [];
    const rooftopEvents: ServerEvent[] = [];
    runtime.connect("user-maya", "floor-studio", (event) => studioEvents.push(event));
    runtime.connect("user-noah", "floor-rooftop", (event) => rooftopEvents.push(event));
    studioEvents.length = 0;
    rooftopEvents.length = 0;

    runtime.runTickForTest();
    studioEvents.length = 0;
    rooftopEvents.length = 0;
    const players = (runtime as unknown as { players: Map<string, unknown> }).players;
    const peers = (runtime as unknown as { peers: Map<string, unknown> }).peers;
    const playerValues = vi.spyOn(players, "values");
    const peerValues = vi.spyOn(peers, "values");

    runtime.runTickForTest();

    expect(playerValues).not.toHaveBeenCalled();
    expect(peerValues).not.toHaveBeenCalled();
    const studioSnapshot = studioEvents.find((event): event is WorldSnapshot => event.type === "world.snapshot");
    const rooftopSnapshot = rooftopEvents.find((event): event is WorldSnapshot => event.type === "world.snapshot");
    expect(studioSnapshot?.players.every((player) => player.floorId === "floor-studio")).toBe(true);
    expect(rooftopSnapshot?.players.every((player) => player.floorId === "floor-rooftop")).toBe(true);
  });

  it("removes disconnected players and peers from floor snapshots", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const firstEvents: ServerEvent[] = [];
    const secondEvents: ServerEvent[] = [];
    const firstPeerId = runtime.connect("user-maya", "floor-studio", (event) => firstEvents.push(event));
    runtime.connect("user-leo", "floor-studio", (event) => secondEvents.push(event));
    firstEvents.length = 0;
    secondEvents.length = 0;

    runtime.disconnect(firstPeerId);
    firstEvents.length = 0;
    secondEvents.length = 0;
    runtime.runTickForTest();
    runtime.runTickForTest();

    expect(firstEvents.filter((event) => event.type === "world.snapshot")).toHaveLength(0);
    const snapshot = secondEvents.find((event): event is WorldSnapshot => event.type === "world.snapshot");
    const visibleUserIds = snapshot?.players.map((player) => player.userId);
    expect(visibleUserIds).toContain("user-leo");
    expect(visibleUserIds).not.toContain("user-maya");
  });

  it("only broadcasts movement snapshots to the floor that changed", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const studioEvents: ServerEvent[] = [];
    const rooftopEvents: ServerEvent[] = [];
    const studioPeerId = runtime.connect("user-maya", "floor-studio", (event) => studioEvents.push(event));
    runtime.connect("user-noah", "floor-rooftop", (event) => rooftopEvents.push(event));

    runtime.runTickForTest();
    runtime.runTickForTest();
    studioEvents.length = 0;
    rooftopEvents.length = 0;

    runtime.handleCommand(studioPeerId, { type: "movement.input", sequence: 1, dx: 1, dy: 0 });
    runtime.runTickForTest();
    runtime.runTickForTest();

    expect(studioEvents.filter((event) => event.type === "world.snapshot")).toHaveLength(1);
    expect(rooftopEvents.filter((event) => event.type === "world.snapshot")).toHaveLength(0);
  });

  it("heartbeats idle floors independently of active-floor snapshots", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const studioEvents: ServerEvent[] = [];
    const rooftopEvents: ServerEvent[] = [];
    const studioPeerId = runtime.connect("user-maya", "floor-studio", (event) => studioEvents.push(event));
    runtime.connect("user-noah", "floor-rooftop", (event) => rooftopEvents.push(event));

    runtime.runTickForTest();
    runtime.runTickForTest();
    studioEvents.length = 0;
    rooftopEvents.length = 0;
    for (let tick = 0; tick < 100; tick += 1) {
      runtime.handleCommand(studioPeerId, {
        type: "presence.set_availability",
        requestId: `availability-${tick}`,
        availability: tick % 2 === 0 ? "away" : "available",
      });
      runtime.runTickForTest();
    }

    expect(studioEvents.filter((event) => event.type === "world.snapshot")).toHaveLength(50);
    expect(rooftopEvents.filter((event) => event.type === "world.snapshot")).toHaveLength(1);
  });

  it("detaches snapshots from mutable runtime player state", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const events: ServerEvent[] = [];
    runtime.connect("user-maya", "floor-studio", (event) => events.push(event));
    events.length = 0;
    const players = (runtime as unknown as { players: Map<string, WorldPlayer> }).players;
    const player = players.get("user-maya")!;
    player.x = 123;
    player.seat = { objectId: "desk", interactionId: "left" };
    player.proximity = { microphone: true, camera: true, callId: "nearby" };

    runtime.runTickForTest();
    runtime.runTickForTest();

    const snapshot = events.find((event): event is WorldSnapshot => event.type === "world.snapshot")!;
    const capturedPlayer = snapshot.players.find((candidate) => candidate.userId === player.userId)!;
    player.x = 456;
    player.seat.interactionId = "right";
    player.proximity.camera = false;

    expect(capturedPlayer).toMatchObject({
      x: 123,
      seat: { objectId: "desk", interactionId: "left" },
      proximity: { microphone: true, camera: true, callId: "nearby" },
    });
  });

  it("skips lobby reconciliation while every player is idle", () => {
    const store = new DemoStore();
    const getMiniGames = vi.spyOn(store, "getMiniGames");
    const runtime = new WorldRuntime(store);
    const peerId = runtime.connect("user-maya", "floor-studio", () => undefined);
    getMiniGames.mockClear();

    runtime.runTickForTest();
    runtime.runTickForTest();
    expect(getMiniGames).not.toHaveBeenCalled();

    runtime.handleCommand(peerId, { type: "movement.input", sequence: 1, dx: 1, dy: 0 });
    runtime.runTickForTest();
    expect(getMiniGames).toHaveBeenCalled();
  });

  it("only visits active movement states on each tick", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const peerId = runtime.connect("user-maya", "floor-studio", () => undefined);
    runtime.connect("user-leo", "floor-studio", () => undefined);
    const gameRuntime = (runtime as unknown as {
      gameRuntime: { isPlaying: (userId: string) => boolean };
    }).gameRuntime;
    const isPlaying = vi.spyOn(gameRuntime, "isPlaying");

    runtime.runTickForTest();
    expect(isPlaying).not.toHaveBeenCalled();

    runtime.handleCommand(peerId, { type: "movement.input", sequence: 1, dx: 1, dy: 0 });
    isPlaying.mockClear();
    runtime.runTickForTest();
    expect(isPlaying).toHaveBeenCalledOnce();
    expect(isPlaying).toHaveBeenCalledWith("user-maya");

    runtime.handleCommand(peerId, { type: "movement.input", sequence: 2, dx: 0, dy: 0 });
    isPlaying.mockClear();
    runtime.runTickForTest();
    expect(isPlaying).not.toHaveBeenCalled();
  });

  it("suppresses unchanged snapshots while retaining an idle heartbeat", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const events: ServerEvent[] = [];
    const peerId = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));
    events.length = 0;

    runtime.runTickForTest();
    runtime.runTickForTest();
    expect(events.filter((event) => event.type === "world.snapshot")).toHaveLength(1);
    events.length = 0;

    runtime.handleCommand(peerId, {
      type: "chat.send",
      requestId: "chat-request",
      conversationId: "conversation-team",
      body: "Hello",
    });
    runtime.runTickForTest();
    runtime.runTickForTest();
    expect(events.filter((event) => event.type === "world.snapshot")).toHaveLength(0);

    for (let tick = 0; tick < 98; tick += 1) {
      runtime.runTickForTest();
    }
    expect(events.filter((event) => event.type === "world.snapshot")).toHaveLength(1);
  });
});
