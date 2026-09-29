import { randomUUID } from "node:crypto";
import { ARCADE_GAMES, TEAM_ARCADE_GAME_IDS, compareArcadePlayers, type ArcadeCommand, type ArcadeGameId, type GameLobbyState, type GameRoundState, type ServerEvent, type WorldPlayer } from "@workhard/shared";
import { WorkspaceStore } from "../store.js";
import { nearbyGameParticipants } from "./game-lobby.js";
import type { GameEventDelivery } from "./game-event-delivery.js";
import { ArcadeEngine } from "./arcade-engine.js";

interface Round {
  id: string;
  objectId: string;
  floorId: string;
  startedAt: string;
  participantIds: string[];
  forfeitedUserIds: Set<string>;
  engine: ArcadeEngine;
}

export class ArcadeRuntime {
  private readonly lobbies = new Map<string, GameLobbyState>();
  private readonly rounds = new Map<string, Round>();
  private readonly roundIdByUser = new Map<string, string>();

  constructor(private readonly store: WorkspaceStore) {}

  syncLobbies(players: Iterable<WorldPlayer>, connectedUserIds: ReadonlySet<string>): GameEventDelivery[] {
    const deliveries: GameEventDelivery[] = [];
    const available = [...players].filter((player) => !this.isPlaying(player.userId));
    const objects = ARCADE_GAMES.flatMap((game) => this.store.getGameObjects(game.id));
    const objectIds = new Set(objects.map((object) => object.id));
    for (const [objectId, lobby] of this.lobbies) if (!objectIds.has(objectId)) {
      deliveries.push(this.lobbyDelivery({ ...lobby, participantIds: [] }));
      this.lobbies.delete(objectId);
    }
    for (const object of objects) {
      const definitionId = ARCADE_GAMES.find((game) => game.assetId === object.assetId)!.id;
      const previous = this.lobbies.get(object.id);
      const participantIds = nearbyGameParticipants(available, object, connectedUserIds, previous?.participantIds ?? [], 4);
      const lobby: GameLobbyState = { definitionId, objectId: object.id, floorId: object.floorId, participantIds, capacity: 4 };
      this.lobbies.set(object.id, lobby);
      if (!previous || previous.definitionId !== lobby.definitionId || previous.floorId !== lobby.floorId || previous.participantIds.join() !== participantIds.join()) deliveries.push(this.lobbyDelivery(lobby));
    }
    return deliveries;
  }

  start(userId: string, definitionId: ArcadeGameId, objectId: string, solo: boolean): { participantIds: string[]; deliveries: GameEventDelivery[] } {
    const active = this.getRound(userId);
    if (active) return { participantIds: active.participantIds, deliveries: this.sessionDeliveries(userId, active) };
    const definition = this.store.getMiniGame(definitionId);
    const object = this.store.getObject(objectId);
    if (!definition || !object || object.assetId !== definition.assetId) throw new Error("GAME_NOT_FOUND");
    const nearby = this.lobbies.get(objectId)?.participantIds ?? [];
    if (!nearby.includes(userId)) throw new Error("GAME_TOO_FAR");
    if (definitionId === "game-sketch-guess" && solo) throw new Error("GAME_PLAYERS_REQUIRED");
    const participantIds = solo ? [userId] : [...nearby];
    if (participantIds.length < (solo ? 1 : 2)) throw new Error("GAME_PLAYERS_REQUIRED");
    const id = randomUUID();
    const round: Round = { id, objectId, floorId: object.floorId, startedAt: new Date().toISOString(), participantIds, forfeitedUserIds: new Set(), engine: new ArcadeEngine(id, definitionId, participantIds) };
    this.rounds.set(id, round);
    participantIds.forEach((participantId) => this.roundIdByUser.set(participantId, id));
    const deliveries = this.removeFromLobbies(participantIds);
    deliveries.push({ scope: "users", userIds: participantIds, event: { type: "game.round_started", round: this.roundState(round) } });
    for (const participantId of participantIds) {
      deliveries.push({ scope: "users", userIds: [participantId], event: round.engine.stateFor(participantId) });
      deliveries.push({ scope: "all", event: { type: "presence.changed", member: this.store.updateMemberLocation(participantId, object.floorId, `Playing ${definition.name}`) } });
    }
    return { participantIds, deliveries };
  }

  command(userId: string, command: ArcadeCommand): GameEventDelivery[] {
    const round = this.getRound(userId);
    if (!round) throw new Error("GAME_NOT_STARTED");
    round.engine.command(userId, command);
    return this.publish(round);
  }

  update(deltaMs: number): GameEventDelivery[] {
    const deliveries: GameEventDelivery[] = [];
    for (const round of this.rounds.values()) if (round.engine.update(deltaMs)) deliveries.push(...this.publish(round));
    return deliveries;
  }

  leave(userId: string): GameEventDelivery[] {
    const round = this.getRound(userId);
    if (!round) return [];
    round.forfeitedUserIds.add(userId);
    round.engine.forfeit(userId);
    this.roundIdByUser.delete(userId);
    if (!TEAM_ARCADE_GAME_IDS.includes(round.engine.state.definitionId) && round.engine.state.players.filter((player) => !player.finished).length <= 1) round.engine.forceFinish();
    const deliveries = this.publish(round);
    deliveries.push({ scope: "all", event: { type: "presence.changed", member: this.store.updateMemberLocation(userId, round.floorId) } });
    return deliveries;
  }

  getRoundId(userId: string): string | undefined { return this.roundIdByUser.get(userId); }
  isPlaying(userId: string): boolean { return this.roundIdByUser.has(userId); }

  getSessionEvents(userId: string): ServerEvent[] {
    const events: ServerEvent[] = [];
    for (const lobby of this.lobbies.values()) if (lobby.participantIds.includes(userId)) events.push({ type: "game.lobby_updated", lobby });
    const round = this.getRound(userId);
    if (round) events.push({ type: "game.round_started", round: this.roundState(round) }, round.engine.stateFor(userId));
    return events;
  }

  removeFromLobbies(userIds: string[]): GameEventDelivery[] {
    const deliveries: GameEventDelivery[] = [];
    for (const [objectId, lobby] of this.lobbies) {
      const participantIds = lobby.participantIds.filter((userId) => !userIds.includes(userId));
      if (participantIds.length === lobby.participantIds.length) continue;
      const next = { ...lobby, participantIds };
      this.lobbies.set(objectId, next);
      deliveries.push(this.lobbyDelivery(next));
    }
    return deliveries;
  }

  private publish(round: Round): GameEventDelivery[] {
    const deliveries: GameEventDelivery[] = round.participantIds.map((userId) => ({ scope: "users", userIds: [userId], event: round.engine.stateFor(userId) }));
    if (!round.engine.completed) {
      deliveries.push({ scope: "users", userIds: round.participantIds, event: { type: "game.round_updated", round: this.roundState(round) } });
      return deliveries;
    }
    const gameId = round.engine.state.definitionId;
    const sorted = [...round.engine.state.players].sort((a, b) => compareArcadePlayers(b, a, gameId) || a.userId.localeCompare(b.userId));
    const teamGame = TEAM_ARCADE_GAME_IDS.includes(gameId);
    const winnerUserId = !teamGame && round.participantIds.length > 1 && compareArcadePlayers(sorted[0]!, sorted[1]!, gameId) > 0
      ? sorted[0]!.userId : undefined;
    const recorded = this.store.recordGameRound(round.id, round.engine.state.definitionId, sorted.map((player, order) => ({
      userId: player.userId, score: player.score, lines: 0, level: round.engine.state.stage,
      order, won: teamGame && round.participantIds.length > 1 ? round.engine.state.teamWon === true && !round.forfeitedUserIds.has(player.userId) : player.userId === winnerUserId,
    })));
    const placements = new Map(recorded.scores.map((score) => [score.userId, score.placement]));
    deliveries.push({ scope: "all", event: {
      type: "game.round_completed",
      round: this.roundState(round, { completedAt: new Date().toISOString(), placements, ...(winnerUserId ? { winnerUserId } : {}) }),
      scores: recorded.scores, statistics: recorded.statistics,
      coinRewards: recorded.economyRewards.map(({ userId, amount }) => ({ userId, amount })),
    } });
    for (const userId of round.participantIds) {
      if (this.roundIdByUser.get(userId) !== round.id) continue;
      deliveries.push({ scope: "all", event: { type: "presence.changed", member: this.store.updateMemberLocation(userId, round.floorId) } });
      this.roundIdByUser.delete(userId);
    }
    for (const reward of recorded.economyRewards) deliveries.push({ scope: "users", userIds: [reward.userId], event: { type: "economy.updated", economy: reward.economy } });
    this.rounds.delete(round.id);
    return deliveries;
  }

  private roundState(round: Round, completion?: { completedAt: string; placements: ReadonlyMap<string, number>; winnerUserId?: string }): GameRoundState {
    return {
      id: round.id, definitionId: round.engine.state.definitionId, objectId: round.objectId, floorId: round.floorId,
      startedAt: round.startedAt, status: completion ? "completed" : "playing",
      participants: round.engine.state.players.map((player) => ({
        userId: player.userId, score: player.score, lines: 0, level: round.engine.state.stage,
        status: completion || player.finished ? "finished" : "playing",
        ...(completion?.placements.get(player.userId) !== undefined ? { placement: completion.placements.get(player.userId)! } : {}),
      })),
      ...(completion ? { completedAt: completion.completedAt, ...(completion.winnerUserId ? { winnerUserId: completion.winnerUserId } : {}) } : {}),
    };
  }

  private getRound(userId: string): Round | undefined { const id = this.roundIdByUser.get(userId); return id ? this.rounds.get(id) : undefined; }
  private sessionDeliveries(userId: string, round: Round): GameEventDelivery[] {
    return [{ scope: "users", userIds: [userId], event: { type: "game.round_started", round: this.roundState(round) } }, { scope: "users", userIds: [userId], event: round.engine.stateFor(userId) }];
  }
  private lobbyDelivery(lobby: GameLobbyState): GameEventDelivery { return { scope: "floor", floorId: lobby.floorId, event: { type: "game.lobby_updated", lobby } }; }
}
