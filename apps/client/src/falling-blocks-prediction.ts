import { FallingBlocksGame, type FallingBlocksCommand, type FallingBlocksGameState, type FallingBlocksMode, type FallingBlocksSimulationState } from "@workhard/shared";

interface PendingCommand {
  sequence: number;
  command: FallingBlocksCommand;
  at: number;
}

const MAX_PENDING_INPUTS = 256;

export class FallingBlocksPrediction {
  private readonly game: FallingBlocksGame;
  private readonly inputSessionId = crypto.randomUUID();
  private readonly pending: PendingCommand[] = [];
  private nextSequence: number;
  private acknowledgedSequence: number;
  private simulatedAt: number;
  private serverClockOffset: number | undefined;
  private oneWayMs = 0;

  constructor(state: FallingBlocksGameState, mode: FallingBlocksMode, now = performance.now()) {
    this.game = new FallingBlocksGame(state.roundId, mode);
    this.game.restore(state.simulation);
    this.nextSequence = 1;
    this.acknowledgedSequence = 0;
    this.simulatedAt = now;
    this.observeServerTime(state, now);
  }

  get state(): FallingBlocksGameState {
    return this.game.state;
  }

  tick(now = performance.now()): FallingBlocksGameState | undefined {
    const changed = this.advance(now);
    return changed ? this.game.state : undefined;
  }

  command(command: FallingBlocksCommand, send: (command: FallingBlocksCommand, sequence: number, inputSessionId: string) => boolean | void, now = performance.now()): FallingBlocksGameState | undefined {
    if (this.pending.length >= MAX_PENDING_INPUTS) return undefined;
    this.advance(now);
    if (!this.game.command(command)) return undefined;
    const sequence = this.nextSequence++;
    this.pending.push({ sequence, command, at: now });
    send(command, sequence, this.inputSessionId);
    return this.game.state;
  }

  resendPending(send: (command: FallingBlocksCommand, sequence: number, inputSessionId: string) => boolean | void): void {
    for (const input of this.pending) {
      if (send(input.command, input.sequence, this.inputSessionId) === false) break;
    }
  }

  reconcile(state: FallingBlocksGameState, now = performance.now()): FallingBlocksGameState | undefined {
    const acknowledgedSequence = state.acknowledgedSequences[this.inputSessionId] ?? this.acknowledgedSequence;
    if (acknowledgedSequence < this.acknowledgedSequence) return undefined;
    this.advance(now);
    const previous = this.game.snapshot;
    const acknowledged = this.pending.find((input) => input.sequence === acknowledgedSequence);
    if (acknowledged) this.oneWayMs = Math.min(1_000, Math.max(0, (now - acknowledged.at) / 2));
    this.acknowledgedSequence = acknowledgedSequence;
    this.nextSequence = Math.max(this.nextSequence, acknowledgedSequence + 1);
    if (!state.running) this.pending.length = 0;
    const firstPending = this.pending.findIndex((input) => input.sequence > acknowledgedSequence);
    this.pending.splice(0, firstPending === -1 ? this.pending.length : firstPending);
    const snapshotAt = this.observeServerTime(state, now);
    this.game.restore(state.simulation);
    this.simulatedAt = snapshotAt;
    for (const input of this.pending) {
      this.advance(Math.max(this.simulatedAt, input.at));
      this.game.command(input.command);
    }
    this.advance(now);
    const reconciled = this.game.snapshot;
    if (samePositionApartFromGravity(previous, reconciled)) {
      this.game.restore(previous);
      this.simulatedAt = now;
      return undefined;
    }
    return this.game.state;
  }

  private observeServerTime(state: FallingBlocksGameState, now: number): number {
    const observedOffset = Date.now() - state.serverTime;
    this.serverClockOffset = Math.min(this.serverClockOffset ?? Infinity, observedOffset - this.oneWayMs);
    const age = Math.max(0, observedOffset - this.serverClockOffset);
    return now - age;
  }

  private advance(now: number): boolean {
    if (now <= this.simulatedAt) return false;
    const changed = this.game.update(now - this.simulatedAt);
    this.simulatedAt = now;
    return changed;
  }
}

function samePositionApartFromGravity(left: FallingBlocksSimulationState, right: FallingBlocksSimulationState): boolean {
  const leftPiece = left.piece;
  const rightPiece = right.piece;
  return left.running === right.running
    && left.paused === right.paused
    && left.score === right.score
    && left.lines === right.lines
    && left.heldPiece === right.heldPiece
    && left.holdAvailable === right.holdAvailable
    && left.randomState === right.randomState
    && JSON.stringify(left.scoring) === JSON.stringify(right.scoring)
    && JSON.stringify(left.board) === JSON.stringify(right.board)
    && JSON.stringify(left.pieceQueue) === JSON.stringify(right.pieceQueue)
    && leftPiece?.type === rightPiece?.type
    && leftPiece?.x === rightPiece?.x
    && leftPiece?.rotation === rightPiece?.rotation
    && (leftPiece && rightPiece ? leftPiece.y >= rightPiece.y && leftPiece.y - rightPiece.y <= 1 : leftPiece === rightPiece);
}
