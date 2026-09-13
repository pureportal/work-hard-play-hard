import { nearbyGameParticipants } from "./game-lobby.js";
import { randomUUID } from "node:crypto";
import {
  TIC_TAC_TOE_DEFINITION_ID,
  GAME_BOT_USER_ID,
  type GameBot,
  TIC_TAC_TOE_VARIANTS,
  type GameLobbyState,
  type GameRoundState,
  type ServerEvent,
  type TicTacToeCommand,
  type TicTacToeVariantId,
  type WorldObject,
  type WorldPlayer,
} from "@workhard/shared";
import { DemoStore } from "../store.js";
import type { GameEventDelivery } from "./game-event-delivery.js";
import { chooseTicTacToeMove } from "./tic-tac-toe/bot.js";
import { TicTacToeGame } from "./tic-tac-toe/game.js";

const LOBBY_CAPACITY = 2;

interface ActiveRound {
  id: string;
  objectId: string;
  floorId: string;
  startedAt: string;
  participantIds: [string, string];
  game: TicTacToeGame;
  bot?: GameBot;
  botDelayMs: number;
}

interface GameStartResult {
  participantIds: string[];
  deliveries: GameEventDelivery[];
}

export class TicTacToeMultiplayerRuntime {
  readonly definitionId = TIC_TAC_TOE_DEFINITION_ID;
  private lobbyParticipants: string[] = [];
  private readonly rounds = new Map<string, ActiveRound>();
  private readonly roundIdByUser = new Map<string, string>();

  constructor(private readonly store: DemoStore) {}

  syncLobbies(
    players: Iterable<WorldPlayer>,
    connectedUserIds: ReadonlySet<string>,
  ): GameEventDelivery[] {
    const definition = this.store.getMiniGame(this.definitionId);
    const object = definition ? this.store.getGameObjects(definition.id)[0] : undefined;
    if (!definition || !object) {
      return [];
    }

    const previous = this.lobbyParticipants;
    const next = nearbyGameParticipants([...players].filter((player) => !this.isPlaying(player.userId)), object, connectedUserIds, previous);

    this.lobbyParticipants = next;
    return sameMembers(previous, next) ? [] : [this.lobbyDelivery(object, next)];
  }

  start(userId: string, variantId: TicTacToeVariantId, bot?: GameBot): GameStartResult {
    const existingRound = this.getRoundForUser(userId);
    if (existingRound) {
      return {
        participantIds: humanParticipants(existingRound),
        deliveries: this.sessionDeliveries(userId, existingRound),
      };
    }
    if (!TIC_TAC_TOE_VARIANTS.some((variant) => variant.id === variantId)) {
      throw new Error("GAME_VARIANT_INVALID");
    }
    const definition = this.store.getMiniGame(this.definitionId);
    const object = definition ? this.store.getGameObjects(definition.id)[0] : undefined;
    if (!definition || !object) {
      throw new Error("GAME_NOT_FOUND");
    }
    if (!this.lobbyParticipants.includes(userId)) {
      throw new Error("GAME_TOO_FAR");
    }
    if (!bot && this.lobbyParticipants.length < LOBBY_CAPACITY) {
      throw new Error("GAME_PLAYERS_REQUIRED");
    }

    const opponentUserId = bot ? GAME_BOT_USER_ID : this.lobbyParticipants.find((participantId) => participantId !== userId)!;
    const participantIds: [string, string] = [userId, opponentUserId];
    const id = randomUUID();
    const round: ActiveRound = {
      id,
      objectId: object.id,
      floorId: object.floorId,
      startedAt: new Date().toISOString(),
      participantIds,
      game: new TicTacToeGame(id, variantId, participantIds),
      ...(bot ? { bot } : {}),
      botDelayMs: 350,
    };
    round.game.consumeChanged();
    this.rounds.set(id, round);
    humanParticipants(round).forEach((participantId) => this.roundIdByUser.set(participantId, id));
    this.lobbyParticipants = this.lobbyParticipants.filter((participantId) => !participantIds.includes(participantId));

    const deliveries: GameEventDelivery[] = [
      this.lobbyDelivery(object, this.lobbyParticipants),
      {
        scope: "users",
        userIds: humanParticipants(round),
        event: { type: "game.round_started", round: this.roundState(round) },
      },
      { scope: "users", userIds: humanParticipants(round), event: this.gameState(round) },
    ];
    for (const participantId of humanParticipants(round)) {
      deliveries.push({
        scope: "all",
        event: {
          type: "presence.changed",
          member: this.store.updateMemberLocation(participantId, round.floorId, "Playing Tic-Tac-Toe"),
        },
      });
    }
    return { participantIds: humanParticipants(round), deliveries };
  }

  command(userId: string, command: TicTacToeCommand): GameEventDelivery[] {
    return this.playCommand(this.requireRoundForUser(userId), userId, command);
  }

  private playCommand(round: ActiveRound, userId: string, command: TicTacToeCommand): GameEventDelivery[] {
    if (!round.game.command(userId, command)) {
      throw new Error("GAME_MOVE_INVALID");
    }

    round.botDelayMs = 350;
    const deliveries: GameEventDelivery[] = [];
    if (round.game.consumeChanged()) {
      deliveries.push({ scope: "users", userIds: humanParticipants(round), event: this.gameState(round) });
    }
    if (round.game.completed) {
      this.completeRound(round, deliveries);
    } else {
      deliveries.push({
        scope: "users",
        userIds: humanParticipants(round),
        event: { type: "game.round_updated", round: this.roundState(round) },
      });
    }
    return deliveries;
  }

  update(deltaMs: number): GameEventDelivery[] {
    const deliveries: GameEventDelivery[] = [];
    for (const round of this.rounds.values()) {
      if (!round.bot || round.game.completed || round.game.state.turnUserId !== GAME_BOT_USER_ID) continue;
      round.botDelayMs -= deltaMs;
      if (round.botDelayMs > 0) continue;
      deliveries.push(...this.playCommand(round, GAME_BOT_USER_ID, chooseTicTacToeMove(round.game, round.bot.difficulty)));
    }
    return deliveries;
  }

  private gameState(round: ActiveRound) {
    return { ...round.game.state, ...(round.bot ? { bot: round.bot } : {}) };
  }

  leave(userId: string): GameEventDelivery[] {
    const round = this.getRoundForUser(userId);
    if (!round) {
      return [];
    }
    round.game.forfeit(userId);
    const deliveries: GameEventDelivery[] = [];
    if (round.game.consumeChanged()) {
      deliveries.push({ scope: "users", userIds: humanParticipants(round), event: this.gameState(round) });
    }
    this.completeRound(round, deliveries);
    return deliveries;
  }

  isPlaying(userId: string): boolean {
    return this.roundIdByUser.has(userId);
  }

  getSessionEvents(userId: string): ServerEvent[] {
    const events: ServerEvent[] = [];
    if (this.lobbyParticipants.includes(userId)) {
      const definition = this.store.getMiniGame(this.definitionId);
      const object = definition ? this.store.getGameObjects(definition.id)[0] : undefined;
      if (object) {
        events.push(this.lobbyDelivery(object, this.lobbyParticipants).event);
      }
    }
    const round = this.getRoundForUser(userId);
    if (round) {
      events.push({ type: "game.round_started", round: this.roundState(round) }, this.gameState(round));
    }
    return events;
  }

  private lobbyDelivery(object: WorldObject, participantIds: string[]): GameEventDelivery & { scope: "floor" } {
    return {
      scope: "floor",
      floorId: object.floorId,
      event: {
        type: "game.lobby_updated",
        lobby: this.lobbyState(object, participantIds),
      },
    };
  }

  private lobbyState(object: WorldObject, participantIds: string[]): GameLobbyState {
    return {
      definitionId: this.definitionId,
      objectId: object.id,
      floorId: object.floorId,
      participantIds: [...participantIds],
      capacity: LOBBY_CAPACITY,
    };
  }

  private sessionDeliveries(userId: string, round: ActiveRound): GameEventDelivery[] {
    return [
      {
        scope: "users",
        userIds: [userId],
        event: { type: "game.round_started", round: this.roundState(round) },
      },
      { scope: "users", userIds: [userId], event: this.gameState(round) },
    ];
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

  private completeRound(round: ActiveRound, deliveries: GameEventDelivery[]): void {
    const completedAt = new Date().toISOString();
    const winnerUserId = round.game.winnerUserId;
    const recorded = round.bot ? { scores: [], statistics: [], economyRewards: [] } : this.store.recordGameRound(
      round.id,
      this.definitionId,
      round.participantIds.map((userId) => ({
        userId,
        ...round.game.resultFor(userId),
        order: winnerUserId ? (userId === winnerUserId ? 0 : 1) : 0,
      })),
      completedAt,
    );
    const placements = new Map(recorded.scores.map((score) => [score.userId, score.placement]));
    deliveries.push({
      scope: "all",
      event: {
        type: "game.round_completed",
        round: this.roundState(round, { completedAt, placements, ...(winnerUserId ? { winnerUserId } : {}) }),
        scores: recorded.scores,
        statistics: recorded.statistics,
        coinRewards: recorded.economyRewards.map(({ userId, amount }) => ({ userId, amount })),
      },
    });
    for (const participantId of humanParticipants(round)) {
      deliveries.push({
        scope: "all",
        event: {
          type: "presence.changed",
          member: this.store.updateMemberLocation(participantId, round.floorId),
        },
      });
    }
    for (const reward of recorded.economyRewards) {
      deliveries.push({
        scope: "users",
        userIds: [reward.userId],
        event: { type: "economy.updated", economy: reward.economy },
      });
    }
    this.rounds.delete(round.id);
    round.participantIds.forEach((participantId) => this.roundIdByUser.delete(participantId));
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
      objectId: round.objectId,
      definitionId: this.definitionId,
      floorId: round.floorId,
      startedAt: round.startedAt,
      status: completion ? "completed" : "playing",
      participants: round.participantIds.map((userId) => {
        const { score, lines, level } = round.game.resultFor(userId);
        const placement = completion?.placements.get(userId);
        return {
          userId,
          score,
          lines,
          level,
          status: completion ? "finished" : "playing",
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

function humanParticipants(round: ActiveRound): string[] {
  return round.participantIds.filter((userId) => userId !== GAME_BOT_USER_ID);
}
