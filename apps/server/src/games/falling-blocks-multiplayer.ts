import { nearbyGameParticipants } from "./game-lobby.js";
import { randomUUID } from "node:crypto";
import {
  FALLING_BLOCKS_DEFINITION_ID,
  type GameLobbyState,
  type GameRoundState,
  type ServerEvent,
  type WorldObject,
  type WorldPlayer,
} from "@workhard/shared";
import { DemoStore } from "../store.js";
import { FallingBlocksGame } from "./falling-blocks.js";
import type { GameEventDelivery } from "./game-event-delivery.js";

export type { GameEventDelivery } from "./game-event-delivery.js";

const LOBBY_CAPACITY = 8;

type GameCommand = Parameters<FallingBlocksGame["command"]>[0];

interface PlayerCompletion {
  score: number;
  lines: number;
  level: number;
  order: number;
}

interface ActiveRound {
  id: string;
  definitionId: typeof FALLING_BLOCKS_DEFINITION_ID;
  objectId: string;
  floorId: string;
  startedAt: string;
  participantIds: string[];
  games: Map<string, FallingBlocksGame>;
  completions: Map<string, PlayerCompletion>;
  completionCount: number;
}

interface StartResult {
  participantIds: string[];
  deliveries: GameEventDelivery[];
}

export class FallingBlocksMultiplayerRuntime {
  private readonly lobbies = new Map<string, GameLobbyState>();
  private readonly rounds = new Map<string, ActiveRound>();
  private readonly roundIdByUser = new Map<string, string>();

  constructor(private readonly store: DemoStore) {}

  syncLobbies(
    players: Iterable<WorldPlayer>,
    connectedUserIds: ReadonlySet<string>,
  ): GameEventDelivery[] {
    const deliveries: GameEventDelivery[] = [];
    const playerList = [...players];

    const objects = this.store.getGameObjects(FALLING_BLOCKS_DEFINITION_ID);
    const objectIds = new Set(objects.map((object) => object.id));
    for (const [objectId, lobby] of this.lobbies) {
      if (objectIds.has(objectId)) continue;
      deliveries.push(this.lobbyDelivery({ ...lobby, participantIds: [] }));
      this.lobbies.delete(objectId);
    }
    for (const object of objects) {
      const previous = this.lobbies.get(object.id);
      const next = nearbyGameParticipants(playerList.filter((player) => !this.isPlaying(player.userId)), object, connectedUserIds, previous?.participantIds ?? [], LOBBY_CAPACITY);
      const lobby = this.lobbyState(object, next);
      this.lobbies.set(object.id, lobby);
      if (!previous || previous.floorId !== lobby.floorId || !sameMembers(previous.participantIds, next)) {
        deliveries.push(this.lobbyDelivery(lobby));
      }
    }

    return deliveries;
  }

  start(userId: string, objectId: string, solo = false): StartResult {
    const existingRound = this.getRoundForUser(userId);
    if (existingRound) {
      return {
        participantIds: [...existingRound.participantIds],
        deliveries: this.sessionDeliveries(userId, existingRound),
      };
    }
    const definition = this.store.getMiniGame(FALLING_BLOCKS_DEFINITION_ID);
    const object = this.store.getObject(objectId);
    if (!definition || !object || object.assetId !== definition.assetId) {
      throw new Error("GAME_NOT_FOUND");
    }
    const nearbyUserIds = this.lobbies.get(objectId)?.participantIds ?? [];
    if (!nearbyUserIds.includes(userId)) {
      throw new Error("GAME_TOO_FAR");
    }
    const participantIds = solo ? [userId] : [...nearbyUserIds];

    const round: ActiveRound = {
      id: randomUUID(),
      definitionId: FALLING_BLOCKS_DEFINITION_ID,
      objectId,
      floorId: object.floorId,
      startedAt: new Date().toISOString(),
      participantIds,
      games: new Map(),
      completions: new Map(),
      completionCount: 0,
    };
    for (const participantId of participantIds) {
      const game = new FallingBlocksGame(round.id);
      game.consumeChanged();
      round.games.set(participantId, game);
      this.roundIdByUser.set(participantId, round.id);
    }
    this.rounds.set(round.id, round);
    const deliveries: GameEventDelivery[] = [];
    for (const [lobbyObjectId, lobby] of this.lobbies) {
      const remaining = lobby.participantIds.filter((participantId) => !participantIds.includes(participantId));
      if (remaining.length === lobby.participantIds.length) continue;
      const updated = { ...lobby, participantIds: remaining };
      this.lobbies.set(lobbyObjectId, updated);
      deliveries.push(this.lobbyDelivery(updated));
    }
    deliveries.push(
      {
        scope: "users",
        userIds: participantIds,
        event: { type: "game.round_started", round: this.roundState(round) },
      },
    );
    for (const participantId of participantIds) {
      const game = round.games.get(participantId)!;
      deliveries.push({ scope: "users", userIds: [participantId], event: game.state });
      deliveries.push({
        scope: "all",
        event: {
          type: "presence.changed",
          member: this.store.updateMemberLocation(participantId, round.floorId, "Playing Falling Blocks"),
        },
      });
    }
    return { participantIds, deliveries };
  }

  command(userId: string, command: GameCommand): GameEventDelivery[] {
    const round = this.requireRoundForUser(userId);
    if (round.completions.has(userId)) {
      throw new Error("GAME_ALREADY_FINISHED");
    }
    if (command === "pause" && round.participantIds.length > 1) {
      throw new Error("GAME_PAUSE_MULTIPLAYER");
    }
    const game = round.games.get(userId)!;
    game.command(command);
    const deliveries: GameEventDelivery[] = [];
    if (game.consumeChanged()) {
      deliveries.push({ scope: "users", userIds: [userId], event: game.state });
    }
    if (game.completed) {
      this.finishPlayer(round, userId, deliveries);
    }
    this.appendRoundUpdate(round, deliveries);
    return deliveries;
  }

  update(deltaMs: number): GameEventDelivery[] {
    const deliveries: GameEventDelivery[] = [];
    for (const round of this.rounds.values()) {
      let changed = false;
      for (const participantId of round.participantIds) {
        if (round.completions.has(participantId)) {
          continue;
        }
        const game = round.games.get(participantId)!;
        game.update(deltaMs);
        if (game.consumeChanged()) {
          deliveries.push({ scope: "users", userIds: [participantId], event: game.state });
          changed = true;
        }
        if (game.completed) {
          this.finishPlayer(round, participantId, deliveries);
          changed = true;
        }
      }
      if (changed) {
        this.appendRoundUpdate(round, deliveries);
      }
    }
    return deliveries;
  }

  leave(userId: string): GameEventDelivery[] {
    const round = this.getRoundForUser(userId);
    if (!round || round.completions.has(userId)) {
      return [];
    }
    const game = round.games.get(userId)!;
    game.end();
    const deliveries: GameEventDelivery[] = [];
    if (game.consumeChanged()) {
      deliveries.push({ scope: "users", userIds: [userId], event: game.state });
    }
    this.finishPlayer(round, userId, deliveries);
    this.appendRoundUpdate(round, deliveries);
    return deliveries;
  }

  isPlaying(userId: string): boolean {
    const round = this.getRoundForUser(userId);
    return Boolean(round && !round.completions.has(userId));
  }

  getSessionEvents(userId: string): ServerEvent[] {
    const events: ServerEvent[] = [];
    for (const lobby of this.lobbies.values()) {
      if (lobby.participantIds.includes(userId)) events.push({ type: "game.lobby_updated", lobby });
    }
    const round = this.getRoundForUser(userId);
    if (round) {
      events.push({ type: "game.round_started", round: this.roundState(round) });
      const game = round.games.get(userId);
      if (game) {
        events.push(game.state);
      }
    }
    return events;
  }

  private lobbyDelivery(lobby: GameLobbyState): GameEventDelivery {
    return {
      scope: "floor",
      floorId: lobby.floorId,
      event: { type: "game.lobby_updated", lobby },
    };
  }

  private lobbyState(object: WorldObject, participantIds: string[]): GameLobbyState {
    return {
      definitionId: FALLING_BLOCKS_DEFINITION_ID,
      objectId: object.id,
      floorId: object.floorId,
      participantIds: [...participantIds],
      capacity: LOBBY_CAPACITY,
    };
  }

  private sessionDeliveries(userId: string, round: ActiveRound): GameEventDelivery[] {
    const deliveries: GameEventDelivery[] = [{
      scope: "users",
      userIds: [userId],
      event: { type: "game.round_started", round: this.roundState(round) },
    }];
    const game = round.games.get(userId);
    if (game) {
      deliveries.push({ scope: "users", userIds: [userId], event: game.state });
    }
    return deliveries;
  }

  private requireRoundForUser(userId: string): ActiveRound {
    const round = this.getRoundForUser(userId);
    if (!round) {
      throw new Error("GAME_NOT_STARTED");
    }
    return round;
  }

  private getRoundForUser(userId: string): ActiveRound | undefined {
    const roundId = this.roundIdByUser.get(userId);
    return roundId ? this.rounds.get(roundId) : undefined;
  }

  private finishPlayer(
    round: ActiveRound,
    userId: string,
    deliveries: GameEventDelivery[],
  ): void {
    if (round.completions.has(userId)) {
      return;
    }
    round.completionCount += 1;
    round.completions.set(userId, {
      ...round.games.get(userId)!.result,
      order: round.completionCount,
    });
    deliveries.push({
      scope: "all",
      event: {
        type: "presence.changed",
        member: this.store.updateMemberLocation(userId, round.floorId),
      },
    });
  }

  private appendRoundUpdate(round: ActiveRound, deliveries: GameEventDelivery[]): void {
    if (round.completions.size === round.participantIds.length) {
      this.completeRound(round, deliveries);
      return;
    }
    deliveries.push({
      scope: "users",
      userIds: round.participantIds,
      event: { type: "game.round_updated", round: this.roundState(round) },
    });
  }

  private completeRound(round: ActiveRound, deliveries: GameEventDelivery[]): void {
    const completedAt = new Date().toISOString();
    const results = round.participantIds.map((userId) => ({ userId, ...round.completions.get(userId)! }));
    const winnerUserId = results.length > 1
      ? [...results].sort((left, right) =>
        right.score - left.score
        || right.lines - left.lines
        || right.level - left.level
        || left.order - right.order
        || left.userId.localeCompare(right.userId),
      )[0]!.userId
      : undefined;
    const recorded = this.store.recordGameRound(
      round.id,
      round.definitionId,
      results.map((result) => ({ ...result, won: result.userId === winnerUserId })),
      completedAt,
    );
    const placements = new Map(recorded.scores.map((score) => [score.userId, score.placement]));
    const completedRound = this.roundState(round, {
      completedAt,
      placements,
      ...(winnerUserId ? { winnerUserId } : {}),
    });
    deliveries.push({
      scope: "all",
      event: {
        type: "game.round_completed",
        round: completedRound,
        scores: recorded.scores,
        statistics: recorded.statistics,
        coinRewards: recorded.economyRewards.map(({ userId, amount }) => ({ userId, amount })),
      },
    });
    for (const reward of recorded.economyRewards) {
      deliveries.push({
        scope: "users",
        userIds: [reward.userId],
        event: { type: "economy.updated", economy: reward.economy },
      });
    }
    this.rounds.delete(round.id);
    for (const participantId of round.participantIds) {
      this.roundIdByUser.delete(participantId);
    }
  }

  private roundState(
    round: ActiveRound,
    completion?: {
      completedAt: string;
      placements: ReadonlyMap<string, number>;
      winnerUserId?: string;
    },
  ): GameRoundState {
    return {
      id: round.id,
      definitionId: round.definitionId,
      objectId: round.objectId,
      floorId: round.floorId,
      startedAt: round.startedAt,
      status: completion ? "completed" : "playing",
      participants: round.participantIds.map((userId) => {
        const placement = completion?.placements.get(userId);
        return {
          userId,
          ...round.games.get(userId)!.result,
          status: round.completions.has(userId) ? "finished" as const : "playing" as const,
          ...(placement === undefined ? {} : { placement }),
        };
      }),
      ...(completion ? {
        completedAt: completion.completedAt,
        ...(completion.winnerUserId ? { winnerUserId: completion.winnerUserId } : {}),
      } : {}),
    };
  }
}


function sameMembers(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((userId, index) => userId === right[index]);
}
