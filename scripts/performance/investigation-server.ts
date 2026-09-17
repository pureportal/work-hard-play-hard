import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Session } from "node:inspector/promises";
import { cpus } from "node:os";
import { CHARACTER_WALK_SPEED, type ServerEvent, type WorldPlayer } from "../../packages/shared/src/index.js";
import { createTestData } from "../../apps/server/src/testing/workspace-data.js";
import { WorkspaceStore } from "../../apps/server/src/store.js";
import { WorldRuntime } from "../../apps/server/src/world/world-runtime.js";
import { findPath } from "../../apps/server/src/world/pathfinding.js";
import { FallingBlocksMultiplayerRuntime } from "../../apps/server/src/games/falling-blocks-multiplayer.js";

const output = resolve(process.argv[2] ?? "artifacts/performance-investigation-2026-09-17");
await mkdir(output, { recursive: true });

function summarize(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  return { count: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)], max: sorted.at(-1) };
}

const profiler = new Session();
profiler.connect();
await profiler.post("Profiler.enable");
await profiler.post("Profiler.start");
const world = [];
for (const population of [13, 50, 100]) {
  const data = createTestData();
  while (data.members.length < population) {
    const index = data.members.length;
    data.members.push({ ...structuredClone(data.members[0]!), id: `probe-${index}`, name: `Probe ${index}`, email: `probe-${index}@example.test` });
  }
  data.members = data.members.slice(0, population);
  for (const [index, member] of data.members.entries()) {
    member.online = true;
    member.floorId = "floor-studio";
    member.position = { x: 100 + (index % 10) * 25, y: 130 + Math.floor(index / 10) * 25 };
  }
  const store = new WorkspaceStore(data);
  const runtime = new WorldRuntime(store);
  const serialized = new WeakMap<ServerEvent, string>();
  let messages = 0, bytes = 0, serializations = 0;
  let measuring = false;
  const received = (event: ServerEvent) => {
    let payload = serialized.get(event);
    if (payload === undefined) {
      payload = JSON.stringify(event);
      serialized.set(event, payload);
      if (measuring) serializations++;
    }
    if (measuring) { messages++; bytes += Buffer.byteLength(payload); }
  };
  const peers = data.members.map(member => runtime.connect(member.id, "floor-studio", received));
  const scenarios = [];
  let sequence = 0;
  try {
    for (const moving of [0, 1, population]) {
      const durations: number[] = [];
      if (moving === 0) {
        sequence++;
        for (const peer of peers) runtime.handleCommand(peer, { type: "movement.input", sequence, dx: 0, dy: 0 });
      }
      for (let tick = -100; tick < 1000; tick++) {
        if (moving > 0 && tick % 8 === 0) {
          sequence++;
          for (const [index, peer] of peers.entries()) runtime.handleCommand(peer, {
            type: "movement.input", sequence, dx: index < moving ? (tick % 16 === 0 ? 1 : -1) : 0, dy: 0,
          });
        }
        if (tick === 0) { messages = 0; bytes = 0; serializations = 0; measuring = true; }
        const start = performance.now();
        runtime.runTickForTest();
        if (tick >= 0) durations.push(performance.now() - start);
      }
      measuring = false;
      scenarios.push({ moving, tickMs: summarize(durations), simulatedSeconds: 50, messages, bytes, serializations });
    }
    world.push({ population, scenarios });
  } finally { runtime.stop(); }
}

const store = new WorkspaceStore(createTestData());
const runtime = new WorldRuntime(store);
const startupEvents: { type: string; bytes: number }[] = [];
runtime.connect("user-maya", "floor-studio", event => startupEvents.push({ type: event.type, bytes: Buffer.byteLength(JSON.stringify(event)) }));
const bootstrap = store.getBootstrap("user-maya");
const bootstrapBytes = Buffer.byteLength(JSON.stringify(bootstrap));
const layout = store.getLayout("floor-studio")!;
const floor = store.getFloor("floor-studio")!;
const paths = [];
for (const destination of [{ x: 450, y: 650 }, { x: 1250, y: 700 }, { x: 735, y: 350 }, { x: 50, y: 50 }]) {
  const durations = [];
  let points = 0;
  for (let index = -5; index < 40; index++) {
    const start = performance.now();
    const path = findPath(layout, floor, "user-maya", { x: 410, y: 650 }, destination);
    const duration = performance.now() - start;
    points = path.length;
    if (index >= 0) durations.push(duration);
  }
  paths.push({ destination, points, milliseconds: summarize(durations) });
}
runtime.stop();

const game = new FallingBlocksMultiplayerRuntime(store);
const players: WorldPlayer[] = ["user-maya", "user-leo"].map((userId, index) => ({ userId, floorId: "floor-studio", x: 1050 + index * 190, y: 620,
  facing: "down", availability: "available", connected: true }));
game.syncLobbies(players, new Set(players.map(player => player.userId)));
game.start("user-maya", "object-falling-blocks");
const gameDurations: number[] = [];
const gameEvents: Record<string, { messages: number; bytes: number }> = {};
for (let index = -100; index < 1000; index++) {
  const start = performance.now();
  const events = game.command("user-maya", index % 2 === 0 ? "left" : "right");
  if (index >= 0) {
    gameDurations.push(performance.now() - start);
    for (const delivery of events) {
      const recipients = delivery.scope === "users" ? delivery.userIds.length : players.length;
      const totals = gameEvents[delivery.event.type] ??= { messages: 0, bytes: 0 };
      totals.messages += recipients;
      totals.bytes += Buffer.byteLength(JSON.stringify(delivery.event)) * recipients;
    }
  }
}
const { profile } = await profiler.post("Profiler.stop");
profiler.disconnect();
const result = { collectedAt: new Date().toISOString(), node: process.version, cpu: cpus()[0]?.model,
  intendedMovementSpeed: 260, sourceMovementSpeed: CHARACTER_WALK_SPEED,
  methodology: "In-process fixture microbenchmarks, 100 warm-up + 1000 measured world ticks; no socket, timer scheduling, database, or WAN costs. Cached JSON serialization included in world ticks. Path tests: 5 warm-up + 40 samples. Game: 100 warm-up + 1000 inputs, no gravity; serialization excluded from input time.",
  world, paths, bootstrap: { bytes: bootstrapBytes, floors: bootstrap.floors.length, layouts: bootstrap.layouts.length, members: bootstrap.members.length, startupEvents },
  fallingBlocks: { inputMs: summarize(gameDurations), events: gameEvents } };
await writeFile(resolve(output, "server.json"), JSON.stringify(result, null, 2) + "\n");
await writeFile(resolve(output, "server.cpuprofile"), JSON.stringify(profile));
console.log(JSON.stringify(result, null, 2));
