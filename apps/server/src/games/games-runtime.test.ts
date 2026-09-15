import { createTestData } from "../testing/workspace-data.js";
import {
  FALLING_BLOCKS_DEFINITION_ID,
  TIC_TAC_TOE_DEFINITION_ID,
  type WorldPlayer,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "../store.js";
import { GamesRuntime } from "./games-runtime.js";

describe("GamesRuntime", () => {
  it("replays an existing game start but blocks starting a different game", () => {
    const runtime = new GamesRuntime(new WorkspaceStore(createTestData()));
    const players = [player("user-maya", 1_300), player("user-leo", 1_350)];
    runtime.syncLobbies(players, new Set(players.map(({ userId }) => userId)));

    const started = runtime.start("user-maya", TIC_TAC_TOE_DEFINITION_ID, "classic", { objectId: "object-tic-tac-toe" });
    const replayed = runtime.start("user-maya", TIC_TAC_TOE_DEFINITION_ID, "classic", { objectId: "object-tic-tac-toe" });

    expect(replayed.participantIds).toEqual(started.participantIds);
    expect(replayed.deliveries.map(({ event }) => event.type)).toEqual([
      "game.round_started",
      "game.state",
    ]);
    expect(() => runtime.start("user-maya", FALLING_BLOCKS_DEFINITION_ID)).toThrow("GAME_IN_PROGRESS");
  });
});

function player(userId: string, x: number): WorldPlayer {
  return {
    userId,
    floorId: "floor-studio",
    x,
    y: 540,
    facing: "down",
    availability: "available",
    connected: true,
  };
}
