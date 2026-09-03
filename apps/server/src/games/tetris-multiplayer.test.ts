import { TETRIS_DEFINITION_ID } from "@workhard/shared";
import type { GameEventDelivery } from "./tetris-multiplayer.js";
import type { ServerEvent, WorldPlayer } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { TetrisMultiplayerRuntime } from "./tetris-multiplayer.js";

describe("TetrisMultiplayerRuntime", () => {
  it("forms one proximity lobby and starts every gathered player in the same round", () => {
    const store = new DemoStore();
    const runtime = new TetrisMultiplayerRuntime(store);
    const players = [nearbyPlayer("user-maya", 1_050, 620), nearbyPlayer("user-leo", 1_250, 620)];

    const lobbyEvents = runtime.syncLobbies(players, new Set(players.map((player) => player.userId)));
    const lobby = events(lobbyEvents).find((event) => event.type === "game.lobby_updated");
    expect(lobby?.type === "game.lobby_updated" && lobby.lobby.participantIds).toEqual(["user-maya", "user-leo"]);

    const started = runtime.start("user-maya", TETRIS_DEFINITION_ID);
    const startEvents = events(started.deliveries).filter((event) => event.type === "game.round_started");
    const boardEvents = events(started.deliveries).filter((event) => event.type === "game.state");

    expect(started.participantIds).toEqual(["user-maya", "user-leo"]);
    expect(startEvents).toHaveLength(1);
    expect(startEvents[0]?.type === "game.round_started" && startEvents[0].round.participants.map((player) => player.userId)).toEqual([
      "user-maya",
      "user-leo",
    ]);
    expect(new Set(boardEvents.flatMap((event) => event.type === "game.state" ? [event.roundId] : [])).size).toBe(1);
    expect(runtime.getSessionEvents("user-leo")).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "game.round_started" }),
      expect.objectContaining({ type: "game.state" }),
    ]));
    expect(() => runtime.command("user-maya", "pause")).toThrow("GAME_PAUSE_MULTIPLAYER");
  });

  it("records authoritative multiplayer scores and awards exactly one non-solo win", () => {
    const store = new DemoStore();
    const runtime = new TetrisMultiplayerRuntime(store);
    const players = [nearbyPlayer("user-maya", 1_050, 620), nearbyPlayer("user-leo", 1_250, 620)];
    const startingBalances = new Map(players.map((player) => [player.userId, store.getPlayerEconomy(player.userId).coinBalance]));
    runtime.syncLobbies(players, new Set(players.map((player) => player.userId)));
    const started = runtime.start("user-maya", TETRIS_DEFINITION_ID);
    const roundId = events(started.deliveries).find((event) => event.type === "game.round_started");

    runtime.command("user-maya", "drop");
    runtime.leave("user-leo");
    const completionDeliveries = runtime.leave("user-maya");
    const completed = events(completionDeliveries).find((event) => event.type === "game.round_completed");

    expect(roundId?.type === "game.round_started" && completed?.type === "game.round_completed" && completed.round.id).toBe(
      roundId?.type === "game.round_started" ? roundId.round.id : undefined,
    );
    expect(completed?.type === "game.round_completed" && completed.scores).toEqual([
      expect.objectContaining({ userId: "user-maya", mode: "multiplayer", placement: 1, won: true, playerCount: 2 }),
      expect.objectContaining({ userId: "user-leo", mode: "multiplayer", placement: 2, won: false, playerCount: 2 }),
    ]);
    expect(completed?.type === "game.round_completed" && completed.coinRewards).toEqual([
      { userId: "user-maya", amount: 60 },
      { userId: "user-leo", amount: 20 },
    ]);
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(startingBalances.get("user-maya")! + 60);
    expect(store.getPlayerEconomy("user-leo").coinBalance).toBe(startingBalances.get("user-leo")! + 20);
    expect(completionDeliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: "users",
        userIds: ["user-maya"],
        event: expect.objectContaining({ type: "economy.updated" }),
      }),
      expect.objectContaining({
        scope: "users",
        userIds: ["user-leo"],
        event: expect.objectContaining({ type: "economy.updated" }),
      }),
    ]));
    expect(store.getGameStatistics().find((statistics) => statistics.userId === "user-maya")).toMatchObject({
      gamesPlayed: 1,
      multiplayerGamesPlayed: 1,
      multiplayerWins: 1,
    });
    expect(store.getGameStatistics().find((statistics) => statistics.userId === "user-leo")).toMatchObject({
      gamesPlayed: 2,
      multiplayerGamesPlayed: 2,
      multiplayerWins: 0,
    });
  });

  it("keeps a solo high score without counting it as a multiplayer win", () => {
    const store = new DemoStore();
    const runtime = new TetrisMultiplayerRuntime(store);
    const maya = nearbyPlayer("user-maya", 1_050, 620);

    runtime.syncLobbies([maya], new Set([maya.userId]));
    runtime.start(maya.userId, TETRIS_DEFINITION_ID);
    runtime.command(maya.userId, "drop");
    runtime.leave(maya.userId);
    const firstScore = store.getScores().find((score) => score.userId === maya.userId)!;

    runtime.syncLobbies([maya], new Set([maya.userId]));
    runtime.start(maya.userId, TETRIS_DEFINITION_ID);
    runtime.leave(maya.userId);
    const statistics = store.getGameStatistics().find((candidate) => candidate.userId === maya.userId);

    expect(firstScore).toMatchObject({ mode: "solo", playerCount: 1, placement: 1, won: false });
    expect(statistics).toMatchObject({
      gamesPlayed: 2,
      multiplayerGamesPlayed: 0,
      multiplayerWins: 0,
      highestScore: firstScore.score,
    });
  });
});

function nearbyPlayer(userId: string, x: number, y: number): WorldPlayer {
  return {
    userId,
    floorId: "floor-studio",
    x,
    y,
    facing: "down",
    availability: "available",
    connected: true,
  };
}

function events(deliveries: GameEventDelivery[]): ServerEvent[] {
  return deliveries.map((delivery) => delivery.event);
}
