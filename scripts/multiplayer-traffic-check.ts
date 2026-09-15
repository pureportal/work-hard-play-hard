import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WorldPlayer } from "../packages/shared/src/index.js";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { FallingBlocksMultiplayerRuntime } from "../apps/server/src/games/falling-blocks-multiplayer.js";

const runtime = new FallingBlocksMultiplayerRuntime(new WorkspaceStore(createTestData()));
const players: WorldPlayer[] = ["user-maya", "user-leo"].map((userId, index) => ({
  userId, floorId: "floor-studio", x: 1050 + index * 190, y: 620,
  facing: "down", availability: "available", connected: true,
}));
runtime.syncLobbies(players, new Set(players.map((player) => player.userId)));
runtime.start("user-maya", "object-falling-blocks");
const counts: Record<string, { messages: number; bytes: number }> = {};
const startedAt = performance.now();
for (let input = 0; input < 120; input += 1) {
  for (const delivery of runtime.command("user-maya", input % 2 === 0 ? "left" : "right")) {
    const recipients = delivery.scope === "users" ? delivery.userIds.length : players.length;
    const counter = counts[delivery.event.type] ??= { messages: 0, bytes: 0 };
    counter.messages += recipients;
    counter.bytes += recipients * Buffer.byteLength(JSON.stringify(delivery.event));
  }
}
const result = { scenario: "Two players, 120 alternating lateral inputs, no simulated gravity", inputs: 120,
  elapsedMs: performance.now() - startedAt, counts,
  messages: Object.values(counts).reduce((sum, counter) => sum + counter.messages, 0),
  bytes: Object.values(counts).reduce((sum, counter) => sum + counter.bytes, 0) };
const directory = resolve("../../artifacts/multiplayer");
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, `traffic-${process.env.MULTIPLAYER_MEASUREMENT ?? "after"}.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
