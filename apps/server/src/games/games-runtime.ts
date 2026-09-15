import {
  FALLING_BLOCKS_COMMANDS,
  FALLING_BLOCKS_DEFINITION_ID,
  TIC_TAC_TOE_DEFINITION_ID,
  TIC_TAC_TOE_VARIANTS,
  type FallingBlocksCommand,
  type FallingBlocksSettings,
  type GameCommand,
  type GameBot,
  type ServerEvent,
  type TicTacToeCommand,
  type TicTacToeVariantId,
  type WorldPlayer,
} from "@workhard/shared";
import { WorkspaceStore } from "../store.js";
import { FallingBlocksMultiplayerRuntime } from "./falling-blocks-multiplayer.js";
import type { GameEventDelivery } from "./game-event-delivery.js";
import { TicTacToeMultiplayerRuntime } from "./tic-tac-toe-multiplayer.js";

export class GamesRuntime {
  private readonly fallingBlocks: FallingBlocksMultiplayerRuntime;
  private readonly ticTacToe: TicTacToeMultiplayerRuntime;

  constructor(store: WorkspaceStore) {
    this.fallingBlocks = new FallingBlocksMultiplayerRuntime(store);
    this.ticTacToe = new TicTacToeMultiplayerRuntime(store);
  }

  syncLobbies(players: Iterable<WorldPlayer>, connectedUserIds: ReadonlySet<string>): GameEventDelivery[] {
    const availablePlayers = [...players].filter((player) =>
      !this.getRoundId(player.userId),
    );
    return [
      ...this.fallingBlocks.syncLobbies(availablePlayers, connectedUserIds),
      ...this.ticTacToe.syncLobbies(availablePlayers, connectedUserIds),
    ];
  }

  start(
    userId: string,
    definitionId: string,
    variantId?: TicTacToeVariantId,
    options: { bot?: GameBot; solo?: boolean; objectId?: string; settings?: FallingBlocksSettings } = {},
  ): { participantIds: string[]; deliveries: GameEventDelivery[] } {
    if (definitionId === FALLING_BLOCKS_DEFINITION_ID) {
      if (variantId !== undefined) {
        throw new Error("GAME_VARIANT_INVALID");
      }
      if (this.ticTacToe.getRoundId(userId)) {
        throw new Error("GAME_IN_PROGRESS");
      }
      if (!options.objectId) throw new Error("GAME_NOT_FOUND");
      const started = this.fallingBlocks.start(userId, options.objectId, options.solo, options.settings);
      started.deliveries.push(...this.ticTacToe.removeFromLobbies(started.participantIds));
      return started;
    }
    if (definitionId === TIC_TAC_TOE_DEFINITION_ID) {
      if (!variantId || !isTicTacToeVariantId(variantId)) {
        throw new Error("GAME_VARIANT_INVALID");
      }
      if (this.fallingBlocks.getRoundId(userId)) {
        throw new Error("GAME_IN_PROGRESS");
      }
      if (!options.objectId) throw new Error("GAME_NOT_FOUND");
      const started = this.ticTacToe.start(userId, options.objectId, variantId, options.bot);
      started.deliveries.push(...this.fallingBlocks.removeFromLobbies(started.participantIds));
      return started;
    }
    throw new Error("GAME_NOT_FOUND");
  }

  command(userId: string, roundId: string, command: GameCommand): GameEventDelivery[] {
    const currentRoundId = this.getRoundId(userId);
    if (!currentRoundId) throw new Error("GAME_NOT_STARTED");
    if (currentRoundId !== roundId) throw new Error("GAME_ROUND_CHANGED");
    if (this.fallingBlocks.isPlaying(userId)) {
      if (!isFallingBlocksCommand(command)) {
        throw new Error("GAME_COMMAND_INVALID");
      }
      return this.fallingBlocks.command(userId, command);
    }
    if (this.ticTacToe.isPlaying(userId)) {
      if (!isTicTacToeCommand(command)) {
        throw new Error("GAME_COMMAND_INVALID");
      }
      return this.ticTacToe.command(userId, command);
    }
    throw new Error("GAME_NOT_STARTED");
  }

  update(deltaMs: number): GameEventDelivery[] {
    return [...this.fallingBlocks.update(deltaMs), ...this.ticTacToe.update(deltaMs)];
  }

  leave(userId: string): GameEventDelivery[] {
    return [...this.fallingBlocks.leave(userId), ...this.ticTacToe.leave(userId)];
  }

  end(userId: string, roundId: string): GameEventDelivery[] {
    const currentRoundId = this.getRoundId(userId);
    if (!currentRoundId) return [];
    if (currentRoundId !== roundId) throw new Error("GAME_ROUND_CHANGED");
    return this.leave(userId);
  }

  getRoundId(userId: string): string | undefined {
    return this.fallingBlocks.getRoundId(userId) ?? this.ticTacToe.getRoundId(userId);
  }

  isPlaying(userId: string): boolean {
    return this.fallingBlocks.isPlaying(userId) || this.ticTacToe.isPlaying(userId);
  }

  getSessionEvents(userId: string): ServerEvent[] {
    return [
      ...this.fallingBlocks.getSessionEvents(userId),
      ...this.ticTacToe.getSessionEvents(userId),
    ];
  }
}

function isFallingBlocksCommand(command: GameCommand): command is FallingBlocksCommand {
  return typeof command === "string" && FALLING_BLOCKS_COMMANDS.includes(command as FallingBlocksCommand);
}

function isTicTacToeCommand(command: GameCommand): command is TicTacToeCommand {
  return typeof command === "object" && command !== null && "kind" in command;
}

function isTicTacToeVariantId(variantId: string): variantId is TicTacToeVariantId {
  return TIC_TAC_TOE_VARIANTS.some((variant) => variant.id === variantId);
}
