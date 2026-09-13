import {
  TIC_TAC_TOE_DEFINITION_ID,
  type TicTacToeCommand,
  type TicTacToeGameState,
  type TicTacToeMark,
  type TicTacToePlayerState,
  type TicTacToeVariantId,
} from "@workhard/shared";
import { createTicTacToeVariant } from "./registry.js";

export class TicTacToeGame {
  private variant;
  private readonly players: [TicTacToePlayerState, TicTacToePlayerState];
  private turn: TicTacToeMark = "x";
  private moveNumber = 0;
  private forfeitureWinnerUserId: string | undefined;
  private changed = true;

  constructor(
    private readonly roundId: string,
    readonly variantId: TicTacToeVariantId,
    playerIds: readonly [string, string],
  ) {
    if (playerIds[0] === playerIds[1]) {
      throw new Error("GAME_PLAYERS_INVALID");
    }
    this.variant = createTicTacToeVariant(variantId);
    this.players = [
      { userId: playerIds[0], mark: "x" },
      { userId: playerIds[1], mark: "o" },
    ];
  }

  clone(): TicTacToeGame {
    const copy = new TicTacToeGame(this.roundId, this.variantId, [this.players[0].userId, this.players[1].userId]);
    copy.variant = this.variant.clone();
    copy.turn = this.turn;
    copy.moveNumber = this.moveNumber;
    copy.forfeitureWinnerUserId = this.forfeitureWinnerUserId;
    return copy;
  }

  command(userId: string, command: TicTacToeCommand): boolean {
    if (this.completed) {
      return false;
    }
    const player = this.players.find((candidate) => candidate.userId === userId);
    if (!player) {
      throw new Error("GAME_PLAYER_INVALID");
    }
    if (player.mark !== this.turn) {
      throw new Error("GAME_NOT_YOUR_TURN");
    }
    if (!this.variant.play(player.mark, command)) {
      return false;
    }

    this.moveNumber += 1;
    if (!this.variant.winnerMark && !this.variant.isDraw) {
      this.turn = this.turn === "x" ? "o" : "x";
    }
    this.changed = true;
    return true;
  }

  forfeit(userId: string): void {
    if (this.completed) {
      return;
    }
    const opponent = this.players.find((player) => player.userId !== userId);
    if (!opponent || !this.players.some((player) => player.userId === userId)) {
      throw new Error("GAME_PLAYER_INVALID");
    }
    this.forfeitureWinnerUserId = opponent.userId;
    this.changed = true;
  }

  get state(): TicTacToeGameState {
    const winnerUserId = this.winnerUserId;
    const draw = this.isDraw;
    return this.variant.createState({
      type: "game.state",
      roundId: this.roundId,
      definitionId: TIC_TAC_TOE_DEFINITION_ID,
      players: this.players.map((player) => ({ ...player })) as [TicTacToePlayerState, TicTacToePlayerState],
      status: winnerUserId ? "won" : draw ? "draw" : "playing",
      ...(!winnerUserId && !draw ? { turnUserId: this.playerForMark(this.turn).userId } : {}),
      ...(winnerUserId ? { winnerUserId } : {}),
      moveNumber: this.moveNumber,
    });
  }

  get completed(): boolean {
    return Boolean(this.winnerUserId || this.isDraw);
  }

  get winnerUserId(): string | undefined {
    return this.forfeitureWinnerUserId
      ?? (this.variant.winnerMark ? this.playerForMark(this.variant.winnerMark).userId : undefined);
  }

  get isDraw(): boolean {
    return !this.winnerUserId && this.variant.isDraw;
  }

  resultFor(userId: string): { score: number; lines: number; level: number; won: boolean } {
    if (!this.players.some((player) => player.userId === userId)) {
      throw new Error("GAME_PLAYER_INVALID");
    }
    const won = this.winnerUserId === userId;
    return { score: won ? 1 : 0, lines: 0, level: 0, won };
  }

  consumeChanged(): boolean {
    const wasChanged = this.changed;
    this.changed = false;
    return wasChanged;
  }

  private playerForMark(mark: TicTacToeMark): TicTacToePlayerState {
    return this.players[mark === "x" ? 0 : 1];
  }
}
