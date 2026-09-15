import type { FallingBlocksAttack, FallingBlocksAttackTarget, FallingBlocksClear } from "@workhard/shared";
import type { FallingBlocksGame } from "./falling-blocks.js";
import { FALLING_BLOCKS_ATTACK_DELAY_MS, FALLING_BLOCKS_WIDTH } from "./falling-blocks-rules.js";

interface PendingAttack extends Omit<FallingBlocksAttack, "remainingMs"> {
  dueAtMs: number;
  holeColumn: number;
}

export class FallingBlocksAttacks {
  private elapsedMs = 0;
  private sequence = 0;
  private pending: PendingAttack[] = [];

  constructor(
    private readonly games: ReadonlyMap<string, FallingBlocksGame>,
    private readonly targeting: FallingBlocksAttackTarget,
    private readonly random: () => number,
  ) {}

  enqueue(sourceUserId: string, clears: FallingBlocksClear[]): void {
    for (const clear of clears) {
      let rows = clear.attackRows;
      for (const attack of this.pending) {
        if (attack.targetUserId !== sourceUserId || rows === 0) continue;
        const cancelled = Math.min(rows, attack.rows);
        attack.rows -= cancelled;
        rows -= cancelled;
      }
      this.pending = this.pending.filter((attack) => attack.rows > 0);
      if (!rows) continue;
      let candidates = [...this.games].filter(([userId, game]) => userId !== sourceUserId && !game.completed);
      if (candidates.length === 0) continue;
      if (this.targeting === "fewest-stones") {
        const minimum = Math.min(...candidates.map(([, game]) => game.stoneCount));
        candidates = candidates.filter(([, game]) => game.stoneCount === minimum);
      }
      const [targetUserId] = candidates[Math.floor(this.random() * candidates.length)]!;
      this.pending.push({
        id: ++this.sequence,
        sourceUserId,
        targetUserId,
        rows,
        dueAtMs: this.elapsedMs + FALLING_BLOCKS_ATTACK_DELAY_MS,
        holeColumn: Math.floor(this.random() * FALLING_BLOCKS_WIDTH),
      });
    }
  }

  advance(deltaMs: number): boolean {
    this.elapsedMs += deltaMs;
    const changed = this.pending.length > 0;
    this.pending = this.pending.filter((attack) => {
      const target = this.games.get(attack.targetUserId)!;
      if (target.completed) return false;
      if (attack.dueAtMs > this.elapsedMs) return true;
      target.addGarbageRows(attack.rows, attack.holeColumn);
      return false;
    });
    return changed;
  }

  removeTarget(userId: string): void {
    this.pending = this.pending.filter((attack) => attack.targetUserId !== userId);
  }

  get state(): FallingBlocksAttack[] {
    return this.pending.map(({ dueAtMs, holeColumn: _holeColumn, ...attack }) => ({
      ...attack,
      remainingMs: dueAtMs - this.elapsedMs,
    }));
  }
}
