import { describe, expect, it } from "vitest";
import type { FallingBlocksLineCount, FallingBlocksSpin } from "@workhard/shared";
import { FallingBlocksScoring } from "./falling-blocks-scoring.js";

describe("Falling Blocks scoring", () => {
  it.each<[FallingBlocksSpin, FallingBlocksLineCount, number, number]>([
    ["none", 0, 0, 0], ["none", 1, 100, 0], ["none", 2, 300, 1], ["none", 3, 500, 2], ["none", 4, 800, 4],
    ["mini", 0, 100, 0], ["mini", 1, 200, 0], ["mini", 2, 400, 1],
    ["full", 0, 400, 0], ["full", 1, 800, 2], ["full", 2, 1200, 4], ["full", 3, 1600, 6],
  ])("scores %s spin with %i lines at the locking level", (spin, lines, points, attackRows) => {
    const scoring = new FallingBlocksScoring();
    expect(scoring.lock(lines, spin, false, 3)).toMatchObject({ points: points * 3, attackRows, backToBack: false });
  });

  it("combines back-to-back and combo bonuses without multiplying the combo bonus", () => {
    const scoring = new FallingBlocksScoring();
    expect(scoring.lock(4, "none", false, 2).points).toBe(1600);
    expect(scoring.lock(2, "full", false, 2)).toMatchObject({ points: 3700, combo: 1, attackRows: 5, backToBack: true });
    expect(scoring.lock(1, "mini", false, 2)).toMatchObject({ points: 800, combo: 2, attackRows: 2, backToBack: true });
    expect(scoring.specials).toMatchObject({ quads: 1, tSpins: 1, tSpinDoubles: 1, tSpinMinis: 1, comboClears: 2, backToBackClears: 2 });
  });

  it("keeps back-to-back through non-clears, resets combos, and breaks back-to-back on ordinary clears", () => {
    const scoring = new FallingBlocksScoring();
    scoring.lock(4, "none", false, 1);
    scoring.lock(0, "none", false, 1);
    expect(scoring.lock(0, "full", false, 1)).toMatchObject({ points: 400, combo: -1, backToBack: false, attackRows: 0 });
    expect(scoring.lock(4, "none", false, 1)).toMatchObject({ points: 1200, combo: 0, backToBack: true });
    scoring.lock(1, "none", false, 1);
    expect(scoring.lock(4, "none", false, 1)).toMatchObject({ points: 900, combo: 2, backToBack: false });
  });

  it.each<[FallingBlocksLineCount, number]>([[1, 900], [2, 1500], [3, 2300], [4, 2800]])("adds the %i-line perfect-clear bonus", (lines, points) => {
    const scoring = new FallingBlocksScoring();
    expect(scoring.lock(lines, "none", true, 2)).toMatchObject({ points: points * 2, perfectClear: true, attackRows: 10 });
    expect(scoring.specials.perfectClears).toBe(1);
  });

  it("uses the back-to-back four-line perfect-clear bonus", () => {
    const scoring = new FallingBlocksScoring();
    scoring.lock(4, "none", false, 1);
    expect(scoring.lock(4, "none", true, 1)).toMatchObject({ points: 4450, attackRows: 10, backToBack: true });
  });

  it("counts full spins, minis, ordinary clears, and bonus clears without double-counting", () => {
    const scoring = new FallingBlocksScoring();
    for (const lines of [0, 1, 2, 3] as const) scoring.lock(lines, "full", false, 1);
    for (const lines of [0, 1, 2] as const) scoring.lock(lines, "mini", false, 1);
    for (const lines of [1, 2, 3, 4] as const) scoring.lock(lines, "none", false, 1);
    expect(scoring.specials).toMatchObject({ singles: 1, doubles: 1, triples: 1, quads: 1, tSpins: 4, tSpinSingles: 1, tSpinDoubles: 1, tSpinTriples: 1, tSpinMinis: 3 });
  });
});
