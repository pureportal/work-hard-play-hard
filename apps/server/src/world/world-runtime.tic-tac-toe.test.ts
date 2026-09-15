import { createTestData } from "../testing/workspace-data.js";
import {
  TIC_TAC_TOE_DEFINITION_ID,
  TIC_TAC_TOE_VARIANTS,
  type ClientCommand,
  type ServerEvent,
  type TicTacToeCommand,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

describe("WorldRuntime Tic-Tac-Toe multiplayer", () => {
  it.each(TIC_TAC_TOE_VARIANTS)("restores a $name session on another connection and forfeits only after the last disconnect", ({ id }) => {
    const store = new WorkspaceStore(createTestData());
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
    const leoPeer = runtime.connect("user-leo", "floor-studio", (event) => leoEvents.push(event));
    for (const [peerId, x] of [[mayaPeer, 1_300], [leoPeer, 1_350]] as const) {
      send(runtime, peerId, { type: "movement.set_destination", requestId: `gather-${peerId}`, floorId: "floor-studio", x, y: 540 });
    }
    for (let tick = 0; tick < 500; tick += 1) {
      runtime.runTickForTest();
    }
    send(runtime, mayaPeer, { type: "game.start", requestId: "start", definitionId: TIC_TAC_TOE_DEFINITION_ID, objectId: "object-tic-tac-toe", variantId: id });
    const command: TicTacToeCommand = id === "classic"
      ? { kind: "classic.place", cell: 4 }
      : id === "ultimate"
        ? { kind: "ultimate.place", board: 0, cell: 4 }
        : { kind: "stacking.place", cell: 4, size: "large" };
    send(runtime, leoPeer, { type: "game.command", roundId: latestState(mayaEvents)!.roundId, requestId: "wrong-turn", command });
    expect(leoEvents.findLast((event) => event.type === "command.error")).toMatchObject({ code: "GAME_NOT_YOUR_TURN" });
    send(runtime, mayaPeer, { type: "game.command", roundId: latestState(mayaEvents)!.roundId, requestId: "move", command });
    expect(latestState(mayaEvents)).toMatchObject({ variantId: id, moveNumber: 1, turnUserId: "user-leo" });
    expect(latestState(leoEvents)).toEqual(latestState(mayaEvents));

    const reconnectEvents: ServerEvent[] = [];
    const secondMayaPeer = runtime.connect("user-maya", "floor-studio", (event) => reconnectEvents.push(event));
    expect(latestState(reconnectEvents)).toEqual(latestState(mayaEvents));
    runtime.disconnect(mayaPeer);
    expect(leoEvents.some((event) => event.type === "game.round_completed")).toBe(false);
    runtime.disconnect(secondMayaPeer);
    expect(latestState(leoEvents)).toMatchObject({ status: "won", winnerUserId: "user-leo" });
    expect(leoEvents.filter((event) => event.type === "game.round_completed")).toHaveLength(1);
    runtime.disconnect(secondMayaPeer);
    expect(leoEvents.filter((event) => event.type === "game.round_completed")).toHaveLength(1);
    runtime.stop();
  });

  it("gathers two players, synchronizes turns, and completes the round", () => {
    const store = new WorkspaceStore(createTestData());
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
    const leoPeer = runtime.connect("user-leo", "floor-studio", (event) => leoEvents.push(event));

    send(runtime, mayaPeer, {
      type: "movement.set_destination",
      requestId: "gather-maya",
      floorId: "floor-studio",
      x: 1_300,
      y: 540,
    });
    send(runtime, leoPeer, {
      type: "movement.set_destination",
      requestId: "gather-leo",
      floorId: "floor-studio",
      x: 1_350,
      y: 540,
    });
    for (let tick = 0; tick < 500; tick += 1) {
      runtime.runTickForTest();
    }

    expect(latestLobby(mayaEvents)?.participantIds).toEqual(["user-maya", "user-leo"]);

    send(runtime, mayaPeer, {
      type: "game.start",
      requestId: "start-classic",
      definitionId: TIC_TAC_TOE_DEFINITION_ID, objectId: "object-tic-tac-toe",
      variantId: "classic",
    });
    expect(latestState(mayaEvents)).toMatchObject({
      definitionId: TIC_TAC_TOE_DEFINITION_ID,
      variantId: "classic",
      turnUserId: "user-maya",
    });
    expect(latestState(leoEvents)?.roundId).toBe(latestState(mayaEvents)?.roundId);

    for (const [peerId, cell] of [
      [mayaPeer, 0],
      [leoPeer, 3],
      [mayaPeer, 1],
      [leoPeer, 4],
      [mayaPeer, 2],
    ] as const) {
      send(runtime, peerId, {
        type: "game.command", roundId: latestState(mayaEvents)!.roundId,
        requestId: `move-${cell}`,
        command: { kind: "classic.place", cell },
      });
    }

    const completion = mayaEvents.findLast((event) =>
      event.type === "game.round_completed" && event.round.definitionId === TIC_TAC_TOE_DEFINITION_ID,
    );
    expect(completion?.type === "game.round_completed" && completion.round.winnerUserId).toBe("user-maya");
    expect(completion?.type === "game.round_completed" && completion.scores).toEqual([
      expect.objectContaining({ userId: "user-maya", won: true }),
      expect.objectContaining({ userId: "user-leo", won: false }),
    ]);

    runtime.stop();
  });
});

function send(runtime: WorldRuntime, peerId: string, command: ClientCommand): void {
  runtime.handleCommand(peerId, command);
}

function latestLobby(events: ServerEvent[]) {
  const event = events.findLast((candidate) =>
    candidate.type === "game.lobby_updated" && candidate.lobby.definitionId === TIC_TAC_TOE_DEFINITION_ID,
  );
  return event?.type === "game.lobby_updated" ? event.lobby : undefined;
}

function latestState(events: ServerEvent[]) {
  const event = events.findLast((candidate) =>
    candidate.type === "game.state" && candidate.definitionId === TIC_TAC_TOE_DEFINITION_ID,
  );
  return event?.type === "game.state" && event.definitionId === TIC_TAC_TOE_DEFINITION_ID ? event : undefined;
}
