import { randomUUID } from "node:crypto";
import { FALLING_BLOCKS_DEFINITION_ID, TIC_TAC_TOE_DEFINITION_ID, TIC_TAC_TOE_VARIANTS, type TicTacToeCommand } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { multiplayerFixture } from "./testing/realtime-clients.js";

describe("multiplayer over real WebSockets", () => {
  it("coalesces rapid Falling Blocks snapshots while acknowledging every input", async () => {
    const fixture = await multiplayerFixture({ x: 1248, y: 636 });
    try {
      const maya = await fixture.connect("maya");
      await maya.request({ type: "game.start", requestId: randomUUID(), definitionId: FALLING_BLOCKS_DEFINITION_ID,
        objectId: "object-falling-blocks", solo: true });
      const started = await maya.waitFor((event) => event.type === "game.round_started");
      if (started.type !== "game.round_started") throw new Error("Round not started");
      await maya.waitFor((event) => event.type === "game.state" && event.roundId === started.round.id);
      const before = maya.events.length;
      const inputSessionId = randomUUID();
      for (let sequence = 1; sequence <= 10; sequence += 1) {
        maya.socket.send(JSON.stringify({ type: "game.command", requestId: randomUUID(), roundId: started.round.id,
          command: sequence % 2 === 0 ? "right" : "left", sequence, inputSessionId }));
      }
      await maya.waitFor((event) => event.type === "game.state" && event.definitionId === FALLING_BLOCKS_DEFINITION_ID
        && event.acknowledgedSequences[inputSessionId] === 10, before);
      expect(maya.events.slice(before).filter((event) => event.type === "game.state").length).toBeLessThan(10);
    } finally {
      await fixture.close();
    }
  });

  it("replays Falling Blocks after a top-out without letting old-round commands or completion affect the replay", async () => {
    const fixture = await multiplayerFixture({ x: 1248, y: 636 });
    try {
      expect((await fixture.app.inject("/v1/health/live")).statusCode).toBe(200);
      expect((await fixture.app.inject("/v1/health/ready")).json()).toEqual({ status: "ready", database: true });
      const maya = await fixture.connect("maya");
      const start = { type: "game.start" as const, definitionId: FALLING_BLOCKS_DEFINITION_ID, objectId: "object-falling-blocks" };
      expect(await maya.request({ ...start, requestId: randomUUID() })).toMatchObject({ code: "GAME_PLAYERS_REQUIRED" });
      const leo = await fixture.connect("leo");
      expect(await maya.request({ ...start, requestId: randomUUID() })).toMatchObject({ type: "command.ack" });
      const first = await leo.waitFor((event) => event.type === "game.round_started");
      if (first.type !== "game.round_started") throw new Error("Round not started");
      const roundId = first.round.id;
      await maya.waitFor((event) => event.type === "game.state" && event.roundId === roundId);
      const secondMaya = await fixture.connect("maya");
      expect(secondMaya.events.find((event) => event.type === "game.state")).toMatchObject({
        roundId,
        grid: maya.events.findLast((event) => event.type === "game.state" && event.definitionId === FALLING_BLOCKS_DEFINITION_ID)?.grid,
      });
      maya.socket.terminate();
      expect(await leo.request({ ...start, requestId: randomUUID() })).toMatchObject({ type: "command.ack" });
      expect(leo.events.findLast((event) => event.type === "game.round_started")).toMatchObject({ round: { id: roundId } });
      for (let drop = 0; drop < 30; drop += 1) {
        const state = await secondMaya.drop(roundId);
        if (state.type === "game.state" && state.definitionId === FALLING_BLOCKS_DEFINITION_ID && !state.running) break;
      }
      expect(secondMaya.events.findLast((event) => event.type === "game.state")).toMatchObject({ running: false });
      await secondMaya.request({ type: "game.end", requestId: randomUUID(), roundId });
      await secondMaya.request({ ...start, requestId: randomUUID(), solo: true });
      const replay = secondMaya.events.findLast((event) => event.type === "game.round_started");
      if (replay?.type !== "game.round_started") throw new Error("Replay not started");
      expect(replay.round.id).not.toBe(roundId);
      expect(await secondMaya.request({ type: "game.end", requestId: randomUUID(), roundId })).toMatchObject({ code: "GAME_ROUND_CHANGED" });
      expect(await secondMaya.request({ type: "game.command", requestId: randomUUID(), roundId, command: "drop", sequence: 1, inputSessionId: randomUUID() })).toMatchObject({ code: "GAME_ROUND_CHANGED" });
      const leoClosed = new Promise<void>((resolve) => leo.socket.once("close", () => resolve()));
      leo.socket.terminate();
      await leoClosed;
      fixture.runtime.runTickForTest(15_000);
      await secondMaya.waitFor((event) => event.type === "game.round_completed" && event.round.id === roundId);
      expect(await secondMaya.drop(replay.round.id)).toMatchObject({ roundId: replay.round.id, running: true });
      expect(fixture.store.getScores().filter((score) => score.roundId === roundId)).toHaveLength(2);
    } finally {
      await fixture.close();
    }
  });

  it.each(TIC_TAC_TOE_VARIANTS)("synchronizes $name and forfeits only when the final connection leaves", async ({ id }) => {
    const fixture = await multiplayerFixture({ x: 1256, y: 636 });
    try {
      const maya = await fixture.connect("maya");
      const leo = await fixture.connect("leo");
      await maya.request({ type: "game.start", requestId: randomUUID(), definitionId: TIC_TAC_TOE_DEFINITION_ID, objectId: "object-tic-tac-toe", variantId: id });
      const round = await leo.waitFor((event) => event.type === "game.round_started");
      if (round.type !== "game.round_started") throw new Error("Round not started");
      const roundId = round.round.id;
      const command: TicTacToeCommand = id === "classic" ? { kind: "classic.place", cell: 4 }
        : id === "ultimate" ? { kind: "ultimate.place", board: 0, cell: 4 } : { kind: "stacking.place", cell: 4, size: "large" };
      expect(await leo.request({ type: "game.command", requestId: randomUUID(), roundId, command })).toMatchObject({ code: "GAME_NOT_YOUR_TURN" });
      await maya.request({ type: "game.command", requestId: randomUUID(), roundId, command });
      const moved = await leo.waitFor((event) => event.type === "game.state" && event.definitionId === TIC_TAC_TOE_DEFINITION_ID && event.moveNumber === 1);
      expect(moved).toEqual(maya.events.findLast((event) => event.type === "game.state"));
      const secondMaya = await fixture.connect("maya");
      expect(secondMaya.events.find((event) => event.type === "game.state")).toEqual(moved);
      maya.socket.terminate();
      await leo.request({ type: "game.start", requestId: randomUUID(), definitionId: TIC_TAC_TOE_DEFINITION_ID, objectId: "object-tic-tac-toe", variantId: id });
      expect(leo.events.some((event) => event.type === "game.round_completed")).toBe(false);
      secondMaya.socket.terminate();
      expect(await leo.waitFor((event) => event.type === "game.round_completed")).toMatchObject({ round: { id: roundId, winnerUserId: "user-leo" } });
      const reconnectedMaya = await fixture.connect("maya");
      await reconnectedMaya.request({ type: "game.start", requestId: randomUUID(), definitionId: TIC_TAC_TOE_DEFINITION_ID, objectId: "object-tic-tac-toe", variantId: id });
      const replay = reconnectedMaya.events.findLast((event) => event.type === "game.round_started");
      if (replay?.type !== "game.round_started") throw new Error("Replay not started");
      expect(replay.round.id).not.toBe(roundId);
      await reconnectedMaya.request({ type: "game.end", requestId: randomUUID(), roundId: replay.round.id });
      expect(fixture.store.getScores().filter((score) => score.roundId === roundId)).toHaveLength(2);
    } finally {
      await fixture.close();
    }
  });

  it("joins a locked chess match, restores another connection, completes checkmate and reopens the saved result", async () => {
    const fixture = await multiplayerFixture({ x: 1320, y: 720 });
    try {
      const maya = await fixture.connect("maya");
      const leo = await fixture.connect("leo");
      const priya = await fixture.connect("priya");
      await maya.request({ type: "chess.match_create", requestId: randomUUID(), settings: {
        timeControl: "standard", pauseWeekends: false, access: "locked", opponentUserId: "user-leo",
      } });
      const matchId = fixture.store.getChessMatches().find((match) => match.creatorUserId === "user-maya")!.id;
      expect(await priya.request({ type: "chess.match_join", requestId: randomUUID(), matchId })).toMatchObject({ code: "CHESS_MATCH_LOCKED" });
      await leo.request({ type: "chess.match_join", requestId: randomUUID(), matchId });
      await maya.request({ type: "chess.match_open", requestId: randomUUID(), matchId });
      const secondMaya = await fixture.connect("maya");
      expect(secondMaya.events.find((event) => event.type === "chess.match_state")).toMatchObject({ match: { id: matchId, turn: "white" } });
      await secondMaya.request({ type: "chess.match_close", requestId: randomUUID(), matchId });
      expect(await maya.waitFor((event) => event.type === "chess.match_closed")).toEqual({ type: "chess.match_closed", matchId });
      expect(secondMaya.events).toContainEqual({ type: "chess.match_closed", matchId });
      await maya.request({ type: "chess.match_open", requestId: randomUUID(), matchId });
      maya.socket.terminate();
      for (const [client, from, to] of [[secondMaya, "f2", "f3"], [leo, "e7", "e5"], [secondMaya, "g2", "g4"], [leo, "d8", "h4"]] as const) {
        expect(await client.request({ type: "chess.move", requestId: randomUUID(), matchId, move: { from, to } })).toMatchObject({ type: "command.ack" });
      }
      const completed = await secondMaya.waitFor((event) => event.type === "chess.match_state" && event.match.status === "completed");
      expect(completed).toMatchObject({ match: { outcome: { result: "checkmate", winnerUserId: "user-leo" } } });
      await secondMaya.request({ type: "chess.match_close", requestId: randomUUID(), matchId });
      secondMaya.socket.terminate();
      const reconnected = await fixture.connect("maya");
      await reconnected.request({ type: "chess.match_open", requestId: randomUUID(), matchId });
      expect(reconnected.events.findLast((event) => event.type === "chess.match_state")).toMatchObject({ match: { id: matchId, status: "completed", moves: expect.arrayContaining([expect.objectContaining({ san: "Qh4#" })]) } });
      await reconnected.request({ type: "chess.match_create", requestId: randomUUID(), settings: { timeControl: "standard", pauseWeekends: false, access: "open" } });
      const waiting = fixture.store.getChessMatches().find((match) => match.status === "waiting")!;
      await reconnected.request({ type: "chess.match_cancel", requestId: randomUUID(), matchId: waiting.id });
      expect(fixture.store.getChessMatches().some((match) => match.id === waiting.id)).toBe(false);
    } finally {
      await fixture.close();
    }
  });
});
