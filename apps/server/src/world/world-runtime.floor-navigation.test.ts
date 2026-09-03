import type { BootstrapData, ClientCommand, Floor, FloorLayout, ServerEvent, WorldObject } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { createSeedData } from "../seed.js";
import { DemoStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

const start = { x: 64, y: 448 };
const destination = { x: 256, y: 448 };

describe("WorldRuntime floor navigation", () => {
  it("keeps same-floor click-to-move on the active floor", () => {
    const { runtime, peerId, events } = createRuntime();

    send(runtime, peerId, {
      type: "movement.set_destination",
      requestId: "same-floor",
      floorId: "floor-1",
      ...destination,
    });
    runUntil(runtime, () => isAt(runtime, "floor-1", destination));

    expect(events.filter((event) => event.type === "session.ready")).toHaveLength(1);
    expect(currentPlayer(runtime)).toMatchObject({ floorId: "floor-1", ...destination });
    runtime.stop();
  });

  it("uses the closest reachable position for a blocked same-floor click", () => {
    const { runtime, peerId, events, store } = createRuntime();
    const layout = store.getLayout("floor-1")!;
    layout.walls = [{ id: "wall", start: { x: 256, y: 192 }, end: { x: 256, y: 320 } }];
    layout.revision += 1;
    const blockedDestination = { x: 256, y: 256 };

    send(runtime, peerId, {
      type: "movement.set_destination",
      requestId: "blocked-floor-position",
      floorId: "floor-1",
      ...blockedDestination,
    });
    for (let tick = 0; tick < 120; tick += 1) {
      runtime.runTickForTest();
    }

    const player = currentPlayer(runtime)!;
    expect(events.find((event) => event.type === "command.error" && event.requestId === "blocked-floor-position")).toBeUndefined();
    expect(player).not.toMatchObject(blockedDestination);
    expect(Math.hypot(player.x - blockedDestination.x, player.y - blockedDestination.y)).toBeLessThan(
      Math.hypot(start.x - blockedDestination.x, start.y - blockedDestination.y),
    );
    runtime.stop();
  });

  it("walks to a stair before continuing from the reverse stair on an adjacent floor", () => {
    const { runtime, peerId, events } = createRuntime();

    send(runtime, peerId, {
      type: "movement.set_destination",
      requestId: "adjacent-floor",
      floorId: "floor-2",
      ...destination,
    });
    expect(currentPlayer(runtime)).toMatchObject({ floorId: "floor-1", ...start });
    runUntil(runtime, () => isAt(runtime, "floor-2", destination));

    expect(readyFloors(events)).toEqual(["floor-1", "floor-2"]);
    expect(events.some((event) => (
      event.type === "world.snapshot"
      && event.floorId === "floor-1"
      && (event.players[0]?.y ?? start.y) < start.y
      && (event.players[0]?.y ?? 0) > 64
    ))).toBe(true);
    expect(firstPlayerSnapshot(events, "floor-2")).toMatchObject({ floorId: "floor-2", x: 64, y: 64 });
    expect(currentPlayer(runtime)).toMatchObject({ floorId: "floor-2", ...destination });
    runtime.stop();
  });

  it("walks between stairs on intermediate floors before reaching a multi-floor destination", () => {
    const { runtime, peerId, events } = createRuntime();

    send(runtime, peerId, {
      type: "movement.set_destination",
      requestId: "multi-floor",
      floorId: "floor-3",
      ...destination,
    });
    runUntil(runtime, () => isAt(runtime, "floor-3", destination));

    expect(readyFloors(events)).toEqual(["floor-1", "floor-2", "floor-3"]);
    expect(firstPlayerSnapshot(events, "floor-2")).toMatchObject({ floorId: "floor-2", x: 64, y: 64 });
    expect(events.some((event) => (
      event.type === "world.snapshot"
      && event.floorId === "floor-2"
      && (event.players[0]?.x ?? 0) > 64
      && (event.players[0]?.x ?? 0) < 384
    ))).toBe(true);
    expect(firstPlayerSnapshot(events, "floor-3")).toMatchObject({ floorId: "floor-3", x: 384, y: 64 });
    expect(currentPlayer(runtime)).toMatchObject({ floorId: "floor-3", ...destination });
    runtime.stop();
  });
});

function createRuntime(): { runtime: WorldRuntime; peerId: string; events: ServerEvent[]; store: DemoStore } {
  const data = navigationData();
  const store = new DemoStore(data);
  const runtime = new WorldRuntime(store);
  const events: ServerEvent[] = [];
  const peerId = runtime.connect(data.currentUserId, "floor-1", (event) => events.push(event));
  return { runtime, peerId, events, store };
}

function navigationData(): BootstrapData {
  const data = createSeedData();
  const officeId = data.office.id;
  data.floors = [1, 2, 3].map((level): Floor => ({
    id: `floor-${level}`,
    officeId,
    name: `Floor ${level}`,
    level,
    width: 512,
    height: 512,
    spawn: start,
    background: "#ffffff",
  }));
  data.layouts = [
    layout(1, portal("one-up", 1, 32, 32, 2)),
    layout(2, portal("two-down", 2, 32, 32, 1), portal("two-up", 2, 352, 32, 3)),
    layout(3, portal("three-down", 3, 352, 32, 2)),
  ];
  const member = data.members.find((candidate) => candidate.id === data.currentUserId)!;
  data.members = [{ ...member, online: true, floorId: "floor-1", position: start }];
  data.conversations = [];
  data.messages = [];
  data.meetings = [];
  data.invitations = [];
  data.miniGames = [];
  data.scores = [];
  data.gameStatistics = [];
  return data;
}

function layout(level: number, ...objects: WorldObject[]): FloorLayout {
  return {
    floorId: `floor-${level}`,
    revision: 1,
    walls: [],
    openings: [],
    tiles: [],
    rooms: [],
    objects,
  };
}

function portal(id: string, floor: number, x: number, y: number, destinationLevel: number): WorldObject {
  return {
    id,
    floorId: `floor-${floor}`,
    assetId: "infrastructure-portal",
    x,
    y,
    rotation: 0,
    variantId: "violet",
    label: String(destinationLevel),
  };
}

function send(runtime: WorldRuntime, peerId: string, command: ClientCommand): void {
  runtime.handleCommand(peerId, command);
}

function runUntil(runtime: WorldRuntime, predicate: () => boolean): void {
  for (let tick = 0; tick < 1_000; tick += 1) {
    runtime.runTickForTest();
    if (predicate()) {
      return;
    }
  }
  throw new Error("Movement did not complete");
}

function isAt(runtime: WorldRuntime, floorId: string, position: { x: number; y: number }): boolean {
  const player = currentPlayer(runtime);
  return player?.floorId === floorId
    && Math.hypot(player.x - position.x, player.y - position.y) < 0.01;
}

function currentPlayer(runtime: WorldRuntime) {
  return runtime.serializePlayers()[0];
}

function readyFloors(events: ServerEvent[]): string[] {
  return events.flatMap((event) => event.type === "session.ready" ? [event.floorId] : []);
}

function firstPlayerSnapshot(events: ServerEvent[], floorId: string) {
  for (const event of events) {
    if (event.type === "world.snapshot" && event.floorId === floorId) {
      return event.players[0];
    }
  }
  return undefined;
}
