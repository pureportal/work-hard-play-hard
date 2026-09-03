import { TETRIS_DEFINITION_ID } from "@workhard/shared";
import type { ClientCommand, ServerEvent } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

describe("WorldRuntime Tetris multiplayer", () => {
  it("gathers players through movement, starts one round, and records its winner", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
    const leoPeer = runtime.connect("user-leo", "floor-studio", (event) => leoEvents.push(event));

    send(runtime, mayaPeer, {
      type: "movement.set_destination",
      requestId: "gather-maya",
      floorId: "floor-studio",
      x: 1_050,
      y: 620,
    });
    send(runtime, leoPeer, {
      type: "movement.set_destination",
      requestId: "gather-leo",
      floorId: "floor-studio",
      x: 1_250,
      y: 620,
    });
    for (let tick = 0; tick < 500; tick += 1) {
      runtime.runTickForTest();
    }

    expect(latestLobby(mayaEvents)?.participantIds).toEqual(["user-maya", "user-leo"]);
    expect(latestLobby(leoEvents)?.participantIds).toEqual(["user-maya", "user-leo"]);

    send(runtime, mayaPeer, {
      type: "game.start",
      requestId: "start-together",
      definitionId: TETRIS_DEFINITION_ID,
    });

    const mayaRound = latestRound(mayaEvents);
    const leoRound = latestRound(leoEvents);
    expect(mayaRound?.id).toBe(leoRound?.id);
    expect(mayaRound?.participants.map((participant) => participant.userId)).toEqual(["user-maya", "user-leo"]);

    send(runtime, mayaPeer, { type: "game.command", requestId: "maya-drop", command: "drop" });
    send(runtime, leoPeer, { type: "game.end", requestId: "leo-finish" });
    send(runtime, mayaPeer, { type: "game.end", requestId: "maya-finish" });

    const completion = mayaEvents.findLast((event) => event.type === "game.round_completed");
    expect(completion?.type === "game.round_completed" && completion.round.id).toBe(mayaRound?.id);
    expect(completion?.type === "game.round_completed" && completion.scores).toEqual([
      expect.objectContaining({ userId: "user-maya", mode: "multiplayer", placement: 1, won: true }),
      expect.objectContaining({ userId: "user-leo", mode: "multiplayer", placement: 2, won: false }),
    ]);
    expect(store.getGameStatistics().find((statistics) => statistics.userId === "user-maya")).toMatchObject({
      multiplayerGamesPlayed: 1,
      multiplayerWins: 1,
    });
    expect(store.getGameStatistics().find((statistics) => statistics.userId === "user-leo")).toMatchObject({
      multiplayerGamesPlayed: 2,
      multiplayerWins: 0,
    });

    runtime.stop();
  });
});

function send(runtime: WorldRuntime, peerId: string, command: ClientCommand): void {
  runtime.handleCommand(peerId, command);
}

function latestLobby(events: ServerEvent[]) {
  const event = events.findLast((candidate) => candidate.type === "game.lobby_updated");
  return event?.type === "game.lobby_updated" ? event.lobby : undefined;
}

function latestRound(events: ServerEvent[]) {
  const event = events.findLast((candidate) => candidate.type === "game.round_started");
  return event?.type === "game.round_started" ? event.round : undefined;
}
