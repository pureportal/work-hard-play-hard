import { createTestData } from "../testing/workspace-data.js";
import { FALLING_BLOCKS_DEFINITION_ID, FALLING_BLOCKS_GARBAGE_CELL, FALLING_BLOCKS_HARD_CELL, type FallingBlocksSettings, type ServerEvent } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import type { FallingBlocksGame } from "../games/falling-blocks.js";
import { prepareLineClear } from "../games/testing/falling-blocks.js";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

describe("WorldRuntime Falling Blocks modes and attacks", () => {
  it.each<FallingBlocksSettings>([
    { mode: "speed-up", attackTarget: "random" },
    { mode: "sudden-death", attackTarget: "fewest-stones" },
  ])("synchronizes $mode and $attackTarget across peers and session restoration", (settings) => {
    const runtime = new WorldRuntime(new WorkspaceStore(createTestData()));
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const maya = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
    const leo = runtime.connect("user-leo", "floor-studio", (event) => leoEvents.push(event));
    try {
      for (const [peerId, x] of [[maya, 1_050], [leo, 1_250]] as const) {
        runtime.handleCommand(peerId, { type: "movement.set_destination", requestId: `gather-${peerId}`, floorId: "floor-studio", x, y: 620 });
      }
      for (let tick = 0; tick < 500; tick += 1) runtime.runTickForTest();
      runtime.handleCommand(maya, { type: "game.start", requestId: "start-mode", definitionId: FALLING_BLOCKS_DEFINITION_ID, objectId: "object-falling-blocks", settings });
      expect(latestRound(mayaEvents)).toEqual(latestRound(leoEvents));
      expect(latestRound(mayaEvents)?.fallingBlocks?.settings).toEqual(settings);
      runtime.runTickForTest(30_000);
      expect(latestState(mayaEvents)).toEqual(latestState(leoEvents));
      if (settings.mode === "speed-up") expect(latestState(leoEvents)).toMatchObject({ fallIntervalMs: 610, level: 2 });
      else expect(latestState(leoEvents)?.grid[19]).toEqual(Array(10).fill(FALLING_BLOCKS_HARD_CELL));

      const gamesRuntime = Reflect.get(runtime, "gameRuntime");
      const fallingBlocks = Reflect.get(gamesRuntime, "fallingBlocks");
      const rounds = Reflect.get(fallingBlocks, "rounds") as Map<string, { games: Map<string, FallingBlocksGame> }>;
      const games = [...rounds.values()][0]!.games;
      prepareLineClear(games.get("user-maya")!, 4, settings.mode === "sudden-death" ? 1 : 0);
      runtime.handleCommand(maya, { type: "game.command", roundId: latestRound(mayaEvents)!.id, requestId: "attack", command: "drop" });
      expect(latestRound(mayaEvents)).toEqual(latestRound(leoEvents));
      expect(latestRound(leoEvents)?.fallingBlocks?.attacks[0]).toMatchObject({ sourceUserId: "user-maya", targetUserId: "user-leo", rows: 4, remainingMs: 3_000 });
      runtime.runTickForTest(2_999);
      expect(latestState(leoEvents)?.grid.flat()).not.toContain(FALLING_BLOCKS_GARBAGE_CELL);
      const restoredEvents: ServerEvent[] = [];
      const restoredPeer = runtime.connect("user-leo", "floor-studio", (event) => restoredEvents.push(event));
      expect(latestRound(restoredEvents)).toEqual(latestRound(mayaEvents));
      expect(latestState(restoredEvents)).toEqual(latestState(leoEvents));
      runtime.disconnect(leo);
      runtime.runTickForTest(1);
      expect(latestState(restoredEvents)?.grid.flat().filter((cell) => cell === FALLING_BLOCKS_GARBAGE_CELL)).toHaveLength(36);
      expect(latestRound(mayaEvents)?.fallingBlocks?.attacks).toEqual([]);
      expect(latestRound(mayaEvents)).toEqual(latestRound(restoredEvents));
      prepareLineClear(games.get("user-maya")!, 4, settings.mode === "sudden-death" ? 1 : 0);
      runtime.handleCommand(maya, { type: "game.command", roundId: latestRound(mayaEvents)!.id, requestId: "second-attack", command: "drop" });
      runtime.disconnect(restoredPeer);
      expect(latestRound(mayaEvents)?.fallingBlocks?.attacks).toEqual([]);
      expect(latestRound(mayaEvents)?.participants.find((player) => player.userId === "user-leo")?.status).toBe("finished");
    } finally {
      runtime.stop();
    }
  });
});

function latestRound(events: ServerEvent[]) {
  const event = events.findLast((candidate) => candidate.type === "game.round_started" || candidate.type === "game.round_updated");
  return event?.round;
}

function latestState(events: ServerEvent[]) {
  return events.findLast((event) => event.type === "game.state" && event.definitionId === FALLING_BLOCKS_DEFINITION_ID);
}
