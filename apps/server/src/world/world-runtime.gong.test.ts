import { GONG_COOLDOWN_MS, type ClientCommand, type ServerEvent } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("WorldRuntime celebration gong", () => {
  it("shares a ring and celebration reaction only with the current floor", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00.000Z"));
    const runtime = createRuntimeWithPositions({
      "user-maya": { x: 430, y: 152 },
      "user-leo": { x: 432, y: 152 },
    });
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const noahEvents: ServerEvent[] = [];
    const mayaPeer = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
    const leoPeer = runtime.connect("user-leo", "floor-studio", (event) => leoEvents.push(event));
    runtime.connect("user-noah", "floor-rooftop", (event) => noahEvents.push(event));
    mayaEvents.length = 0;
    leoEvents.length = 0;
    noahEvents.length = 0;

    const cooldownUntil = Date.now() + GONG_COOLDOWN_MS;
    ring(runtime, mayaPeer, "first-ring");

    expect(mayaEvents).toContainEqual(expect.objectContaining({
      type: "interaction.gong_rang",
      ring: expect.objectContaining({
        objectId: "object-commons-gong",
        userId: "user-maya",
        floorId: "floor-studio",
        cooldownUntil,
      }),
    }));
    expect(leoEvents).toContainEqual(expect.objectContaining({ type: "interaction.gong_rang" }));
    expect(leoEvents).toContainEqual(expect.objectContaining({
      type: "interaction.reaction",
      userId: "user-maya",
      reaction: "celebrate",
      scope: { type: "floor", floorId: "floor-studio" },
    }));
    expect(noahEvents.some((event) => event.type === "interaction.gong_rang")).toBe(false);

    runtime.handleCommand(leoPeer, {
      type: "interaction.react",
      requestId: "leo-celebrates",
      reaction: "clap",
    });
    expect(mayaEvents).toContainEqual(expect.objectContaining({
      type: "interaction.reaction",
      userId: "user-leo",
      reaction: "clap",
    }));

    vi.advanceTimersByTime(500);
    runtime.handleCommand(leoPeer, {
      type: "interaction.react",
      requestId: "leo-high-five",
      reaction: "wave",
    });
    runtime.handleCommand(mayaPeer, {
      type: "interaction.react",
      requestId: "maya-high-five",
      reaction: "wave",
    });
    expect(mayaEvents).toContainEqual(expect.objectContaining({
      type: "interaction.high_five",
      userIds: ["user-leo", "user-maya"],
      floorId: "floor-studio",
    }));

    ring(runtime, mayaPeer, "cooling-down");
    expect(mayaEvents.at(-1)).toMatchObject({
      type: "command.error",
      requestId: "cooling-down",
      code: "GONG_COOLDOWN",
    });

    runtime.disconnect(leoPeer);
    const reconnectedEvents: ServerEvent[] = [];
    runtime.connect("user-leo", "floor-studio", (event) => reconnectedEvents.push(event));
    expect(reconnectedEvents).toContainEqual({
      type: "interaction.gong_cooldown",
      objectId: "object-commons-gong",
      floorId: "floor-studio",
      cooldownUntil,
    });
    expect(reconnectedEvents.some((event) => event.type === "interaction.gong_rang")).toBe(false);
    runtime.stop();
  });

  it("requires the ringer to move within range", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));
    events.length = 0;

    ring(runtime, peer, "too-far");

    expect(events.at(-1)).toMatchObject({
      type: "command.error",
      requestId: "too-far",
      code: "GONG_TOO_FAR",
    });
    expect(events.some((event) => event.type === "interaction.gong_rang")).toBe(false);
    runtime.stop();
  });

  it("does not interrupt coworkers who are in a meeting", () => {
    const runtime = createRuntimeWithPositions({
      "user-maya": { x: 430, y: 152 },
      "user-leo": { x: 735, y: 350 },
    });
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
    const leoPeer = runtime.connect("user-leo", "floor-studio", (event) => leoEvents.push(event));
    runtime.handleCommand(leoPeer, {
      type: "meeting.join",
      requestId: "join-meeting",
      meetingId: "meeting-product-crit",
    });
    mayaEvents.length = 0;
    leoEvents.length = 0;

    ring(runtime, mayaPeer, "ring-nearby");

    expect(mayaEvents.some((event) => event.type === "interaction.gong_rang")).toBe(true);
    expect(leoEvents.some((event) => event.type === "interaction.gong_rang")).toBe(false);
    expect(leoEvents.some((event) => event.type === "interaction.reaction")).toBe(false);
    expect(leoEvents).toContainEqual(expect.objectContaining({ type: "interaction.gong_cooldown" }));
    runtime.stop();
  });
});

function ring(runtime: WorldRuntime, peerId: string, requestId: string): void {
  const command: ClientCommand = {
    type: "interaction.ring_gong",
    requestId,
    objectId: "object-commons-gong",
  };
  runtime.handleCommand(peerId, command);
}

function createRuntimeWithPositions(positions: Record<string, { x: number; y: number }>): WorldRuntime {
  const runtime = new WorldRuntime(new DemoStore());
  runtime.restorePlayers(runtime.serializePlayers().map((player) => ({
    ...player,
    ...positions[player.userId],
  })));
  return runtime;
}
