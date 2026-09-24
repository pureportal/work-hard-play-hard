import {
  emptyFallingBlocksSpecialCounts,
  type FallingBlocksClear,
  type FallingBlocksLineCount,
  type FallingBlocksSpin,
  type FallingBlocksSimulationState,
} from "./falling-blocks.js";

const LINE_POINTS = [0, 100, 300, 500, 800] as const;
const SPIN_POINTS = { mini: [100, 200, 400, 0, 0], full: [400, 800, 1200, 1600, 0] } as const;
const PERFECT_CLEAR_POINTS = [0, 800, 1200, 1800, 2000] as const;
const ATTACK_ROWS = { none: [0, 0, 1, 2, 4], mini: [0, 0, 1, 0, 0], full: [0, 2, 4, 6, 0] } as const;
const COMBO_ATTACK_ROWS = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5] as const;

export class FallingBlocksScoring {
  readonly specials = emptyFallingBlocksSpecialCounts();
  lastClear: FallingBlocksClear | null = null;
  private combo = -1;
  private backToBack = false;
  private sequence = 0;

  get snapshot() {
    return {
      specials: { ...this.specials },
      lastClear: this.lastClear ? { ...this.lastClear } : null,
      combo: this.combo,
      backToBack: this.backToBack,
      sequence: this.sequence,
    };
  }

  restore(snapshot: FallingBlocksSimulationState["scoring"]): void {
    Object.assign(this.specials, snapshot.specials);
    this.lastClear = snapshot.lastClear ? { ...snapshot.lastClear } : null;
    this.combo = snapshot.combo;
    this.backToBack = snapshot.backToBack;
    this.sequence = snapshot.sequence;
  }

  lock(lines: FallingBlocksLineCount, spin: FallingBlocksSpin, perfectClear: boolean, level: number): FallingBlocksClear {
    this.combo = lines > 0 ? this.combo + 1 : -1;
    const difficult = lines > 0 && (lines === 4 || spin !== "none");
    const backToBackBonus = difficult && this.backToBack;
    if (lines > 0) this.backToBack = difficult;
    const basePoints = spin === "none" ? LINE_POINTS[lines] : SPIN_POINTS[spin][lines];
    const perfectClearPoints = perfectClear
      ? lines === 4 && backToBackBonus ? 3200 : PERFECT_CLEAR_POINTS[lines]
      : 0;
    const points = (basePoints * (backToBackBonus ? 1.5 : 1) + Math.max(0, this.combo) * 50 + perfectClearPoints) * level;
    const comboAttack = COMBO_ATTACK_ROWS[Math.min(Math.max(0, this.combo), COMBO_ATTACK_ROWS.length - 1)]!;
    const attackRows = perfectClear ? 10 : ATTACK_ROWS[spin][lines] + (backToBackBonus ? 1 : 0) + comboAttack;
    const clear: FallingBlocksClear = {
      id: ++this.sequence, lines, spin, points, combo: this.combo,
      backToBack: backToBackBonus, perfectClear, attackRows,
    };
    if (spin === "full") {
      this.specials.tSpins += 1;
      if (lines === 1) this.specials.tSpinSingles += 1;
      if (lines === 2) this.specials.tSpinDoubles += 1;
      if (lines === 3) this.specials.tSpinTriples += 1;
    } else if (spin === "mini") {
      this.specials.tSpinMinis += 1;
    } else {
      if (lines === 1) this.specials.singles += 1;
      if (lines === 2) this.specials.doubles += 1;
      if (lines === 3) this.specials.triples += 1;
      if (lines === 4) this.specials.quads += 1;
    }
    if (perfectClear) this.specials.perfectClears += 1;
    if (this.combo > 0) this.specials.comboClears += 1;
    if (backToBackBonus) this.specials.backToBackClears += 1;
    if (lines > 0 || spin !== "none") this.lastClear = clear;
    return clear;
  }
}
