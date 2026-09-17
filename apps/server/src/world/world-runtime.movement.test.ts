import { createTestData } from "../testing/workspace-data.js";
import type { Position, ServerEvent } from "@workhard/shared";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

const runtimes: WorldRuntime[] = [];
const start = { x: 128, y: 128 };
const directions = [
  { direction: "down", dx: 0, dy: 1 },
  { direction: "up", dx: 0, dy: -1 },
  { direction: "right", dx: 1, dy: 0 },
  { direction: "left", dx: -1, dy: 0 },
] as const;

afterEach(() => runtimes.splice(0).forEach((runtime) => runtime.stop()));

describe("WorldRuntime movement", () => {
  it.each(directions)("keeps facing $direction during auto-move and after stopping", ({ direction, dx, dy }) => {
    for (const distance of [3, 11, 59, 64, 69]) {
      const { runtime, peerId } = createOpenRuntime();
      const destination = { x: start.x + dx * distance, y: start.y + dy * distance };
      walkTo(runtime, peerId, destination);

      for (let tick = 0; tick < 20; tick += 1) {
        runtime.runTickForTest(10);
        expect(currentPlayer(runtime).facing).toBe(direction);
      }

      expect(currentPlayer(runtime)).toMatchObject({ ...destination, facing: direction });
      runtime.runTickForTest();
      expect(currentPlayer(runtime)).toMatchObject({ ...destination, facing: direction });
    }
  });

  it.each(directions)("preserves $direction facing when movement is interrupted", ({ direction, dx, dy }) => {
    for (const kind of ["direction", "destination"]) {
      const { runtime, peerId } = createOpenRuntime();
      if (kind === "direction") {
        runtime.handleCommand(peerId, { type: "movement.input", sequence: 1, dx, dy });
      } else {
        walkTo(runtime, peerId, { x: start.x + dx * 100, y: start.y + dy * 100 });
      }
      runtime.runTickForTest();
      const previous = currentPlayer(runtime);
      expect(previous.facing).toBe(direction);

      runtime.handleCommand(peerId, kind === "direction"
        ? { type: "movement.input", sequence: 2, dx: 0, dy: 0 }
        : { type: "movement.stop", requestId: "stop" });
      runtime.runTickForTest();
      runtime.runTickForTest();

      expect(currentPlayer(runtime)).toMatchObject(previous);
    }
  });

  it.each(["direction", "destination"])("preserves %s movement when another connection opens and closes", (kind) => {
    const runtime = new WorldRuntime(new WorkspaceStore(createTestData()));
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya"
      ? { ...player, floorId: "floor-studio", x: 770, y: 890 } : player));
    const peer = runtime.connect("user-maya", "floor-studio", () => undefined);
    runtime.handleCommand(peer, kind === "direction"
      ? { type: "movement.input", sequence: 1, dx: 1, dy: 0 }
      : { type: "movement.set_destination", requestId: "walk", floorId: "floor-studio", x: 900, y: 890 });
    const secondPeer = runtime.connect("user-maya", "floor-studio", () => undefined);
    runtime.disconnect(secondPeer);
    runtime.runTickForTest(100);
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")!.x).toBeGreaterThan(770);
    runtime.disconnect(peer);
    const stoppedX = runtime.serializePlayers().find((player) => player.userId === "user-maya")!.x;
    runtime.runTickForTest(100);
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")!.x).toBe(stoppedX);
    runtime.stop();
  });

  it("moves directional input at the player movement speed", () => {
    const runtime = new WorldRuntime(new WorkspaceStore(createTestData()));
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya"
      ? { ...player, floorId: "floor-studio", x: 770, y: 890 }
      : player));
    const peerId = runtime.connect("user-maya", "floor-studio", () => undefined);

    runtime.handleCommand(peerId, { type: "movement.input", sequence: 1, dx: 1, dy: 0 });
    runtime.runTickForTest(100);

    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")).toMatchObject({
      x: 805,
      y: 890,
    });
    runtime.stop();
  });
});

describe("WorldRuntime fast movement", () => {
  it.each([{ dx: 1, dy: 0 }, { dx: 1, dy: 1 }])("keeps directional speed consistent for $dx, $dy input", (direction) => {
    const { runtime, peerId } = createOpenRuntime();

    runtime.handleCommand(peerId, { type: "movement.input", sequence: 1, ...direction });
    runtime.runTickForTest(100);

    const player = currentPlayer(runtime);
    expect(Math.hypot(player.x - start.x, player.y - start.y)).toBeCloseTo(35);
  });

  it("crosses multiple waypoints per tick and increases speed with route distance up to a cap", () => {
    const displacements = [128, 640, 1_280, 1_536].map((distance) => {
      const { runtime, peerId } = createOpenRuntime();
      walkTo(runtime, peerId, { x: start.x + distance, y: start.y });

      runtime.runTickForTest();

      return currentPlayer(runtime).x - start.x;
    });

    expect(displacements[0]).toBeGreaterThan(17.5);
    expect(displacements[1]).toBeGreaterThan(displacements[0]!);
    expect(displacements[2]).toBeGreaterThan(displacements[1]!);
    expect(displacements[2]).toBeCloseTo(37.5);
    expect(displacements[3]).toBeCloseTo(37.5);
  });

  it("eases the distance boost near the destination and stops without overshooting", () => {
    const { runtime, peerId } = createOpenRuntime();
    const destination = { x: start.x + 1_280, y: start.y };
    walkTo(runtime, peerId, destination);
    const displacements: number[] = [];

    for (let tick = 0; tick < 100; tick += 1) {
      const previousX = currentPlayer(runtime).x;
      runtime.runTickForTest();
      const x = currentPlayer(runtime).x;
      expect(x).toBeGreaterThanOrEqual(previousX);
      expect(x).toBeLessThanOrEqual(destination.x);
      if (destination.x - previousX > 60) {
        displacements.push(x - previousX);
      }
    }

    expect(displacements[0]).toBeCloseTo(37.5);
    expect(displacements.at(-1)).toBeLessThan(20);
    expect(currentPlayer(runtime)).toMatchObject(destination);
  });

  it("arrives precisely when a boosted route is replaced by a nearby destination", () => {
    const { runtime, peerId } = createOpenRuntime();
    walkTo(runtime, peerId, { x: 1_600, y: start.y });
    runtime.runTickForTest();
    const destination = { x: currentPlayer(runtime).x + 3, y: start.y };

    walkTo(runtime, peerId, destination);
    runtime.runTickForTest();
    runtime.runTickForTest();

    expect(currentPlayer(runtime)).toMatchObject(destination);
  });

  it("returns to directional speed when keyboard input replaces a boosted route", () => {
    const { runtime, peerId } = createOpenRuntime();
    walkTo(runtime, peerId, { x: 1_600, y: start.y });
    runtime.runTickForTest();
    const previous = currentPlayer(runtime);

    runtime.handleCommand(peerId, { type: "movement.input", sequence: 1, dx: 0, dy: 1 });
    runtime.runTickForTest();

    expect(currentPlayer(runtime)).toMatchObject({ x: previous.x, y: previous.y + 17.5 });
  });

  it("stops a boosted route immediately", () => {
    const { runtime, peerId } = createOpenRuntime();
    walkTo(runtime, peerId, { x: 1_600, y: start.y });
    runtime.runTickForTest();
    const previous = currentPlayer(runtime);

    runtime.handleCommand(peerId, { type: "movement.stop", requestId: "stop" });
    runtime.runTickForTest();
    runtime.runTickForTest();

    expect(currentPlayer(runtime)).toMatchObject(previous);
  });

  it.each(["direction", "destination"])("does not cross a wall with fast %s movement during a long tick", (kind) => {
    const { runtime, peerId, layout, events } = createOpenRuntime();
    if (kind === "direction") {
      runtime.handleCommand(peerId, { type: "movement.input", sequence: 1, dx: 1, dy: 0 });
    } else {
      walkTo(runtime, peerId, { x: 1_600, y: start.y });
    }
    layout.walls = [{ id: "wall", start: { x: 160, y: 0 }, end: { x: 160, y: 400 } }];
    layout.revision += 1;

    runtime.runTickForTest(1_000);

    expect(currentPlayer(runtime).x).toBeGreaterThan(start.x);
    expect(currentPlayer(runtime).x).toBeLessThan(160 - 13);
    if (kind === "destination") {
      expect(events).toContainEqual(expect.objectContaining({
        type: "command.error", requestId: "walk", code: "DESTINATION_BLOCKED",
      }));
    }
  });

  it.each(["restricted", "full"])("does not skip over a %s room during a long tick", (kind) => {
    const { runtime, peerId, layout } = createOpenRuntime();
    const bounds = { x: 160, y: 0, width: 16, height: 400 };
    layout.rooms = [{
      id: "room", floorId: layout.floorId, name: "Room", color: "#ffffff",
      bounds, footprint: [bounds], boundary: [], doorIds: [], windowIds: [],
      capacity: kind === "full" ? 1 : 8, privateEligible: true,
      access: kind === "restricted"
        ? { mode: "assigned", assignedPersonIds: ["user-leo"], knockable: false }
        : { mode: "open", assignedPersonIds: [], knockable: false },
    }];
    layout.revision += 1;
    if (kind === "full") {
      runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-leo"
        ? { ...player, floorId: layout.floorId, x: 168, y: start.y }
        : player));
      runtime.connect("user-leo", layout.floorId, () => undefined);
    }

    runtime.handleCommand(peerId, { type: "movement.input", sequence: 1, dx: 1, dy: 0 });
    runtime.runTickForTest(1_000);

    expect(currentPlayer(runtime).x).toBeGreaterThan(start.x);
    expect(currentPlayer(runtime).x).toBeLessThan(160 - 13);
    expect(currentPlayer(runtime).roomId).toBeUndefined();
  });

  it("follows a route around a wall at boosted speed", () => {
    const { runtime, peerId, layout, events } = createOpenRuntime();
    layout.walls = [{ id: "wall", start: { x: 256, y: 32 }, end: { x: 256, y: 256 } }];
    layout.revision += 1;
    const destination = { x: 448, y: start.y };
    walkTo(runtime, peerId, destination);
    let wentAroundWall = false;

    for (let tick = 0; tick < 100; tick += 1) {
      runtime.runTickForTest();
      const player = currentPlayer(runtime);
      wentAroundWall ||= player.y > 256 + 13 || player.y < 32 - 13;
    }

    expect(wentAroundWall).toBe(true);
    expect(currentPlayer(runtime)).toMatchObject(destination);
    expect(events.filter((event) => event.type === "command.error")).toEqual([]);
  });
});

function createOpenRuntime() {
  const store = new WorkspaceStore(createTestData());
  const layout = store.getLayout("floor-studio")!;
  layout.walls = [];
  layout.openings = [];
  layout.objects = [];
  layout.rooms = [];
  layout.revision += 1;
  const runtime = new WorldRuntime(store);
  runtimes.push(runtime);
  runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya"
    ? { ...player, floorId: layout.floorId, ...start }
    : player));
  const events: ServerEvent[] = [];
  const peerId = runtime.connect("user-maya", layout.floorId, (event) => events.push(event));
  return { runtime, peerId, layout, events };
}

function currentPlayer(runtime: WorldRuntime) {
  return runtime.serializePlayers().find((player) => player.userId === "user-maya")!;
}

function walkTo(runtime: WorldRuntime, peerId: string, destination: Position): void {
  runtime.handleCommand(peerId, {
    type: "movement.set_destination", requestId: "walk", floorId: "floor-studio", ...destination,
  });
}
