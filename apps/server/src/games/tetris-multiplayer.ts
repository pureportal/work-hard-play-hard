import { randomUUID } from "node:crypto";
import {
  getPlacedAssetBounds,
  TETRIS_DEFINITION_ID,
  type GameLobbyState,
  type GameRoundState,
  type ServerEvent,
  type WorldObject,
  type WorldPlayer,
} from "@workhard/shared";
import { DemoStore } from "../store.js";
import { FallingBlocksGame } from "./falling-blocks.js";

const LOBBY_CAPACITY = 8;
const LOBBY_JOIN_DISTANCE = 76;
const LOBBY_LEAVE_DISTANCE = 116;

type GameCommand = Parameters<FallingBlocksGame["command"]>[0];

export type GameEventDelivery =
  | { scope: "all"; event: ServerEvent }
  | { scope: "floor"; floorId: string; event: ServerEvent }
  | { scope: "users"; userIds: string[]; event: ServerEvent };

interface PlayerCompletion {
  score: number;
  lines: number;
  level: number;
  order: number;
}

interface ActiveRound {
  id: string;
  definitionId: typeof TETRIS_DEFINITION_ID;
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

export class TetrisMultiplayerRuntime {
  private readonly lobbyParticipants = new Map<string, string[]>();
  private readonly rounds = new Map<string, ActiveRound>();
  private readonly roundIdByUser = new Map<string, string>();

  constructor(private readonly store: DemoStore) {}

  syncLobbies(
    players: Iterable<WorldPlayer>,
    connectedUserIds: ReadonlySet<string>,
  ): GameEventDelivery[] {
    const deliveries: GameEventDelivery[] = [];
    const playerList = [...players];

    for (const definition of this.store.getMiniGames()) {
      const object = this.store.getObject(definition.objectId);
      if (!object) {
        continue;
      }
      const previous = this.lobbyParticipants.get(definition.id) ?? [];
      const candidates = playerList
        .filter((player) => this.canJoinLobby(player, object, connectedUserIds))
        .map((player) => ({
          userId: player.userId,
          distance: distanceFromObject(player, object),
        }));
      const candidateDistances = new Map(candidates.map((candidate) => [candidate.userId, candidate.distance]));
      const next = previous.filter((userId) => (candidateDistances.get(userId) ?? Infinity) <= LOBBY_LEAVE_DISTANCE);
      for (const candidate of candidates.sort((left, right) => left.distance - right.distance || left.userId.localeCompare(right.userId))) {
        if (next.length >= LOBBY_CAPACITY) {
          break;
        }
        if (candidate.distance <= LOBBY_JOIN_DISTANCE && !next.includes(candidate.userId)) {
          next.push(candidate.userId);
        }
      }

      this.lobbyParticipants.set(definition.id, next);
      if (!sameMembers(previous, next)) {
        deliveries.push(this.lobbyDelivery(definition.id, object, next));
      }
    }

    return deliveries;
  }

  start(userId: string, definitionId: string): StartResult {
    const existingRound = this.getRoundForUser(userId);
    if (existingRound) {
      return {
        participantIds: [...existingRound.participantIds],
        deliveries: this.sessionDeliveries(userId, existingRound),
      };
    }
    if (definitionId !== TETRIS_DEFINITION_ID) {
      throw new Error("GAME_NOT_FOUND");
    }
    const definition = this.store.getMiniGame(definitionId);
    const object = definition ? this.store.getObject(definition.objectId) : undefined;
    if (!definition || !object) {
      throw new Error("GAME_NOT_FOUND");
    }
    const participantIds = [...(this.lobbyParticipants.get(definitionId) ?? [])];
    if (!participantIds.includes(userId)) {
      throw new Error("GAME_TOO_FAR");
    }

    const round: ActiveRound = {
      id: randomUUID(),
      definitionId: TETRIS_DEFINITION_ID,
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
    this.lobbyParticipants.set(definitionId, []);

    const deliveries: GameEventDelivery[] = [
      this.lobbyDelivery(definitionId, object, []),
      {
        scope: "users",
        userIds: participantIds,
        event: { type: "game.round_started", round: this.roundState(round) },
      },
    ];
    for (const participantId of participantIds) {
      const game = round.games.get(participantId)!;
      deliveries.push({ scope: "users", userIds: [participantId], event: game.state });
      deliveries.push({
        scope: "all",
        event: {
          type: "presence.changed",
          member: this.store.updateMemberLocation(participantId, round.floorId, "Playing Tetris"),
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
    for (const definition of this.store.getMiniGames()) {
      const participantIds = this.lobbyParticipants.get(definition.id) ?? [];
      if (!participantIds.includes(userId)) {
        continue;
      }
      const object = this.store.getObject(definition.objectId);
      if (object) {
        events.push({ type: "game.lobby_updated", lobby: this.lobbyState(definition.id, object, participantIds) });
      }
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

  private canJoinLobby(
    player: WorldPlayer,
    object: WorldObject,
    connectedUserIds: ReadonlySet<string>,
  ): boolean {
    return player.connected
      && connectedUserIds.has(player.userId)
      && player.floorId === object.floorId
      && !this.roundIdByUser.has(player.userId);
  }

  private lobbyDelivery(definitionId: string, object: WorldObject, participantIds: string[]): GameEventDelivery {
    return {
      scope: "floor",
      floorId: object.floorId,
      event: { type: "game.lobby_updated", lobby: this.lobbyState(definitionId, object, participantIds) },
    };
  }

  private lobbyState(definitionId: string, object: WorldObject, participantIds: string[]): GameLobbyState {
    return {
      definitionId,
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
    const recorded = this.store.recordGameRound(
      round.id,
      round.definitionId,
      round.participantIds.map((userId) => ({ userId, ...round.completions.get(userId)! })),
      completedAt,
    );
    const placements = new Map(recorded.scores.map((score) => [score.userId, score.placement]));
    const winnerUserId = recorded.scores.find((score) => score.won)?.userId;
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

function distanceFromObject(player: WorldPlayer, object: WorldObject): number {
  const bounds = getPlacedAssetBounds(object);
  const deltaX = Math.max(bounds.x - player.x, 0, player.x - bounds.x - bounds.width);
  const deltaY = Math.max(bounds.y - player.y, 0, player.y - bounds.y - bounds.height);
  return Math.hypot(deltaX, deltaY);
}

function sameMembers(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((userId, index) => userId === right[index]);
}
