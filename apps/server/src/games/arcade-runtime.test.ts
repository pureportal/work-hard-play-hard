import { describe, expect, it } from "vitest";
import { ARCADE_GAMES, getGameArea, type WorldPlayer } from "@workhard/shared";
import { createTestData } from "../testing/workspace-data.js";
import { WorkspaceStore } from "../store.js";
import { ArcadeRuntime } from "./arcade-runtime.js";

describe("arcade runtime", () => {
  it.each(ARCADE_GAMES)("starts, synchronizes and records $name", ({ id, assetId }) => {
    const data = createTestData();
    const object = data.layouts.flatMap((layout) => layout.objects).find((entry) => entry.id === "object-chess")!;
    object.assetId = assetId;
    const store = new WorkspaceStore(data);
    const runtime = new ArcadeRuntime(store);
    const area = getGameArea(object);
    const userIds = id === "game-sketch-guess" ? ["user-maya", "user-leo"] : ["user-maya"];
    const players: WorldPlayer[] = userIds.map((userId) => ({
      userId, floorId: object.floorId, connected: true, availability: "available", facing: "down", x: area.x, y: area.y,
    }));
    const lobbies = runtime.syncLobbies(players, new Set(userIds));
    expect(lobbies.some((delivery) => delivery.event.type === "game.lobby_updated" && delivery.event.lobby.definitionId === id)).toBe(true);
    const started = runtime.start("user-maya", id, object.id, id !== "game-sketch-guess");
    expect(started.participantIds).toEqual(expect.arrayContaining(userIds));
    expect(started.participantIds).toHaveLength(userIds.length);
    expect(runtime.getSessionEvents("user-maya").some((event) => event.type === "game.state" && event.definitionId === id)).toBe(true);
    const completed = runtime.leave("user-maya");
    expect(completed.some((delivery) => delivery.event.type === "game.round_completed")).toBe(true);
    expect(store.getBootstrap("user-maya").scores.some((score) => score.definitionId === id)).toBe(true);
  });

  it("records a tied territory round without declaring a winner", () => {
    const data = createTestData();
    const object = data.layouts.flatMap((layout) => layout.objects).find((entry) => entry.id === "object-chess")!;
    object.assetId = "equipment-territory-rush";
    const store = new WorkspaceStore(data);
    const runtime = new ArcadeRuntime(store);
    const area = getGameArea(object);
    const userIds = ["user-maya", "user-leo"];
    runtime.syncLobbies(userIds.map((userId) => ({ userId, floorId: object.floorId, connected: true, availability: "available", facing: "down", x: area.x, y: area.y })), new Set(userIds));
    runtime.start(userIds[0]!, "game-territory-rush", object.id, false);
    let completion: ReturnType<typeof runtime.update>[number] | undefined;
    for (let tick = 0; tick < 300; tick++) completion ??= runtime.update(250).find((delivery) => delivery.event.type === "game.round_completed");
    expect(completion?.event).toMatchObject({ type: "game.round_completed", round: { status: "completed" } });
    if (completion?.event.type !== "game.round_completed") return;
    expect(completion.event.round.winnerUserId).toBeUndefined();
    expect(completion.event.scores.every((score) => !score.won)).toBe(true);
  });

  it("awards a competitive round to the remaining player after a high scorer forfeits", () => {
    const data = createTestData();
    const object = data.layouts.flatMap((layout) => layout.objects).find((entry) => entry.id === "object-chess")!;
    object.assetId = "equipment-territory-rush";
    const store = new WorkspaceStore(data);
    const runtime = new ArcadeRuntime(store);
    const area = getGameArea(object);
    const userIds = ["user-maya", "user-leo"];
    runtime.syncLobbies(userIds.map((userId) => ({ userId, floorId: object.floorId, connected: true, availability: "available", facing: "down", x: area.x, y: area.y })), new Set(userIds));
    runtime.start(userIds[0]!, "game-territory-rush", object.id, false);
    const state = runtime.getSessionEvents(userIds[0]!).find((event) => event.type === "game.state");
    if (state?.type !== "game.state" || state.definitionId !== "game-territory-rush") throw new Error("Missing territory state");
    const player = state.players.find((entry) => entry.userId === userIds[0])!;
    runtime.command(userIds[0]!, { kind: "claim", cell: player.y * state.width + player.x + (player.x < state.width / 2 ? 1 : -1) });
    runtime.update(200);
    const completion = runtime.leave(userIds[0]!).find((delivery) => delivery.event.type === "game.round_completed");
    expect(completion?.event).toMatchObject({ type: "game.round_completed", round: { winnerUserId: userIds[1] } });
  });

  it("records shared multiplayer wins for cooperative games", () => {
    const store = new WorkspaceStore(createTestData());
    const results = ["user-maya", "user-leo"].map((userId, order) => ({ userId, score: 100 - order * 10, lines: 0, level: 1, order, won: true }));
    const recorded = store.recordGameRound("team-win", "game-space-defense", results);
    expect(recorded.scores.every((score) => score.won)).toBe(true);
    expect(recorded.statistics.every((entry) => entry.multiplayerWins === 1)).toBe(true);
    expect(() => store.recordGameRound("competitive-double-win", "game-bomb-arena", results)).toThrow("GAME_RESULT_INVALID");
  });

  it("lets the remaining defender continue after a teammate leaves", () => {
    const data = createTestData();
    const object = data.layouts.flatMap((layout) => layout.objects).find((entry) => entry.id === "object-chess")!;
    object.assetId = "equipment-space-defense";
    const store = new WorkspaceStore(data);
    const runtime = new ArcadeRuntime(store);
    const area = getGameArea(object);
    const userIds = ["user-maya", "user-leo"];
    runtime.syncLobbies(userIds.map((userId) => ({ userId, floorId: object.floorId, connected: true, availability: "available", facing: "down", x: area.x, y: area.y })), new Set(userIds));
    runtime.start(userIds[0]!, "game-space-defense", object.id, false);
    expect(runtime.leave(userIds[0]!).some((delivery) => delivery.event.type === "game.round_completed")).toBe(false);
    expect(runtime.getRoundId(userIds[1]!)).toBeDefined();
    expect(runtime.command(userIds[1]!, { kind: "shoot" }).some((delivery) => delivery.event.type === "game.state")).toBe(true);
  });

  it("refreshes a lobby when its table changes game", () => {
    const data = createTestData();
    const object = data.layouts.flatMap((layout) => layout.objects).find((entry) => entry.id === "object-chess")!;
    object.assetId = "equipment-minefield-relay";
    const store = new WorkspaceStore(data);
    const runtime = new ArcadeRuntime(store);
    const area = getGameArea(object);
    const players: WorldPlayer[] = [{ userId: "user-maya", floorId: object.floorId, connected: true, availability: "available", facing: "down", x: area.x, y: area.y }];
    runtime.syncLobbies(players, new Set(["user-maya"]));
    store.getObject(object.id)!.assetId = "equipment-memory-sprint";
    const deliveries = runtime.syncLobbies(players, new Set(["user-maya"]));
    expect(deliveries).toContainEqual(expect.objectContaining({ event: expect.objectContaining({ type: "game.lobby_updated", lobby: expect.objectContaining({ objectId: object.id, definitionId: "game-memory-sprint" }) }) }));
  });
});
