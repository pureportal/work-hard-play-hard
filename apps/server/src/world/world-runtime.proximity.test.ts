import type { ClientCommand, ServerEvent, WorldPlayer, WorldSnapshot } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

function placePlayers(runtime: WorldRuntime, positions: Record<string, { x: number; y: number }>): void {
  runtime.restorePlayers(runtime.serializePlayers().map((player) => ({
    ...player,
    ...positions[player.userId],
  })));
}

function connect(runtime: WorldRuntime, userId: string, events: ServerEvent[]): string {
  return runtime.connect(userId, "floor-studio", (event) => events.push(event));
}

function send(runtime: WorldRuntime, peerId: string, command: ClientCommand): void {
  runtime.handleCommand(peerId, command);
}

function setMedia(runtime: WorldRuntime, peerId: string, microphone: boolean, camera: boolean): void {
  send(runtime, peerId, {
    type: "proximity.set_media",
    requestId: crypto.randomUUID(),
    microphone,
    camera,
  });
}

function snapshot(runtime: WorldRuntime, events: ServerEvent[]): WorldSnapshot {
  runtime.runTickForTest();
  runtime.runTickForTest();
  const event = events.filter((candidate): candidate is WorldSnapshot => candidate.type === "world.snapshot").at(-1);
  if (!event) {
    throw new Error("Snapshot missing");
  }
  return event;
}

function player(snapshotEvent: WorldSnapshot, userId: string): WorldPlayer {
  const candidate = snapshotEvent.players.find((item) => item.userId === userId);
  if (!candidate) {
    throw new Error(`Player ${userId} missing`);
  }
  return candidate;
}

describe("WorldRuntime proximity calls", () => {
  it("shows a ready player without creating a solo call", () => {
    const runtime = new WorldRuntime(new DemoStore());
    placePlayers(runtime, { "user-maya": { x: 100, y: 100 } });
    const events: ServerEvent[] = [];
    const peer = connect(runtime, "user-maya", events);

    setMedia(runtime, peer, false, true);

    expect(player(snapshot(runtime, events), "user-maya").proximity).toEqual({
      microphone: false,
      camera: true,
    });
    runtime.stop();
  });

  it("forms a call and lets another ready player join it", () => {
    const runtime = new WorldRuntime(new DemoStore());
    placePlayers(runtime, {
      "user-maya": { x: 100, y: 100 },
      "user-leo": { x: 240, y: 100 },
      "user-elena": { x: 400, y: 100 },
    });
    const events: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", events);
    const leoPeer = connect(runtime, "user-leo", []);
    const elenaPeer = connect(runtime, "user-elena", []);

    setMedia(runtime, mayaPeer, true, false);
    setMedia(runtime, leoPeer, true, false);
    let current = snapshot(runtime, events);
    const callId = player(current, "user-maya").proximity?.callId;
    expect(callId).toBeTruthy();
    expect(player(current, "user-leo").proximity?.callId).toBe(callId);

    setMedia(runtime, elenaPeer, false, true);
    current = snapshot(runtime, events);
    expect(player(current, "user-elena").proximity?.callId).toBe(callId);
    runtime.stop();
  });

  it("keeps a call inside shared reach, then ends it after the group separates", () => {
    const runtime = new WorldRuntime(new DemoStore());
    placePlayers(runtime, {
      "user-maya": { x: 100, y: 100 },
      "user-leo": { x: 240, y: 100 },
    });
    const events: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", events);
    const leoPeer = connect(runtime, "user-leo", []);
    setMedia(runtime, mayaPeer, true, false);
    setMedia(runtime, leoPeer, true, false);
    const callId = player(snapshot(runtime, events), "user-maya").proximity?.callId;

    send(runtime, leoPeer, { type: "movement.input", sequence: 1, dx: 1, dy: 0 });
    for (let tick = 0; tick < 4; tick += 1) {
      runtime.runTickForTest();
    }
    send(runtime, leoPeer, { type: "movement.input", sequence: 2, dx: 0, dy: 0 });
    let current = snapshot(runtime, events);
    expect(player(current, "user-maya").proximity?.callId).toBe(callId);
    expect(player(current, "user-leo").proximity?.callId).toBe(callId);

    send(runtime, leoPeer, { type: "movement.input", sequence: 3, dx: 1, dy: 0 });
    for (let tick = 0; tick < 4; tick += 1) {
      runtime.runTickForTest();
    }
    send(runtime, leoPeer, { type: "movement.input", sequence: 4, dx: 0, dy: 0 });
    current = snapshot(runtime, events);
    expect(player(current, "user-maya").proximity?.callId).toBeUndefined();
    expect(player(current, "user-leo").proximity?.callId).toBeUndefined();
    runtime.stop();
  });

  it("ends a call when a participant turns off both devices", () => {
    const runtime = new WorldRuntime(new DemoStore());
    placePlayers(runtime, {
      "user-maya": { x: 100, y: 100 },
      "user-leo": { x: 240, y: 100 },
    });
    const events: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", events);
    const leoPeer = connect(runtime, "user-leo", []);
    setMedia(runtime, mayaPeer, true, false);
    setMedia(runtime, leoPeer, true, false);
    expect(player(snapshot(runtime, events), "user-maya").proximity?.callId).toBeTruthy();

    setMedia(runtime, leoPeer, false, false);

    const current = snapshot(runtime, events);
    expect(player(current, "user-maya").proximity?.callId).toBeUndefined();
    expect(player(current, "user-leo").proximity).toBeUndefined();
    runtime.stop();
  });

  it("keeps ambient participation while a direct call is ringing, then switches on acceptance", () => {
    const runtime = new WorldRuntime(new DemoStore());
    placePlayers(runtime, {
      "user-maya": { x: 100, y: 100 },
      "user-leo": { x: 220, y: 100 },
    });
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);
    setMedia(runtime, mayaPeer, true, false);
    setMedia(runtime, leoPeer, true, false);
    const callId = player(snapshot(runtime, mayaEvents), "user-maya").proximity?.callId;

    send(runtime, mayaPeer, {
      type: "call.request",
      requestId: "ring-leo",
      targetUserId: "user-leo",
    });
    let current = snapshot(runtime, mayaEvents);
    expect(player(current, "user-maya").proximity?.callId).toBe(callId);
    expect(player(current, "user-leo").proximity?.callId).toBe(callId);

    const incoming = leoEvents.filter((event) => event.type === "call.state").at(-1);
    if (incoming?.type !== "call.state") {
      throw new Error("Call did not ring");
    }
    send(runtime, leoPeer, {
      type: "call.respond",
      requestId: "accept-call",
      callId: incoming.callId,
      accept: true,
    });

    current = snapshot(runtime, mayaEvents);
    expect(player(current, "user-maya").proximity).toBeUndefined();
    expect(player(current, "user-leo").proximity).toBeUndefined();
    runtime.stop();
  });

  it("preserves an existing ambient call when its members enter a public meeting area", () => {
    const runtime = new WorldRuntime(new DemoStore());
    placePlayers(runtime, {
      "user-maya": { x: 690, y: 760 },
      "user-leo": { x: 650, y: 760 },
    });
    const events: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", events);
    const leoPeer = connect(runtime, "user-leo", []);
    setMedia(runtime, mayaPeer, true, false);
    setMedia(runtime, leoPeer, true, false);
    const callId = player(snapshot(runtime, events), "user-maya").proximity?.callId;

    send(runtime, mayaPeer, {
      type: "movement.set_destination",
      requestId: "enter-huddle",
      floorId: "floor-studio",
      x: 800,
      y: 760,
    });
    for (let tick = 0; tick < 30; tick += 1) {
      runtime.runTickForTest();
    }

    const current = snapshot(runtime, events);
    expect(player(current, "user-maya").proximity?.callId).toBe(callId);
    expect(player(current, "user-leo").proximity?.callId).toBe(callId);
    expect(events.some((event) => event.type === "meeting.joined")).toBe(false);
    runtime.stop();
  });

  it("keeps ambient readiness unchanged inside a meeting room before it is opened", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const events: ServerEvent[] = [];
    const peer = connect(runtime, "user-amara", events);

    setMedia(runtime, peer, true, true);

    const current = snapshot(runtime, events);
    expect(events.some((event) => event.type === "meeting.joined")).toBe(false);
    expect(player(current, "user-amara").proximity).toEqual({
      microphone: true,
      camera: true,
    });
    runtime.stop();
  });

  it("keeps ambient readiness when crossing into a meeting room", () => {
    const runtime = new WorldRuntime(new DemoStore());
    placePlayers(runtime, { "user-amara": { x: 735, y: 500 } });
    const events: ServerEvent[] = [];
    const peer = connect(runtime, "user-amara", events);
    setMedia(runtime, peer, true, false);
    expect(player(snapshot(runtime, events), "user-amara").proximity).toEqual({
      microphone: true,
      camera: false,
    });

    send(runtime, peer, {
      type: "movement.set_destination",
      requestId: "enter-daily-room",
      floorId: "floor-studio",
      x: 735,
      y: 350,
    });
    for (let tick = 0; tick < 30; tick += 1) {
      runtime.runTickForTest();
    }

    const current = snapshot(runtime, events);
    expect(player(current, "user-amara").roomId).toBe("room-daily");
    expect(player(current, "user-amara").proximity).toEqual({
      microphone: true,
      camera: false,
    });
    expect(events.some((event) => event.type === "meeting.joined")).toBe(false);
    runtime.stop();
  });

  it("clears proximity readiness after the user explicitly opens a meeting", () => {
    const runtime = new WorldRuntime(new DemoStore());
    placePlayers(runtime, { "user-maya": { x: 100, y: 100 } });
    const events: ServerEvent[] = [];
    const peer = connect(runtime, "user-maya", events);
    setMedia(runtime, peer, true, false);
    expect(player(snapshot(runtime, events), "user-maya").proximity).toBeDefined();

    send(runtime, peer, {
      type: "meeting.join",
      requestId: "open-huddle",
      meetingId: "meeting-open-huddle",
    });

    expect(player(snapshot(runtime, events), "user-maya").proximity).toBeUndefined();
    expect(events.some((event) => event.type === "meeting.joined" && event.meeting.id === "meeting-open-huddle")).toBe(true);
    runtime.stop();
  });
});
