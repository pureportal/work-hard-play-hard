import {
  emptyFallingBlocksSpecialCounts,
  type FallingBlocksSpecialCounts,
  type FallingBlocksStatistics,
} from "@workhard/shared";

export function validFallingBlocksCounts(counts: FallingBlocksSpecialCounts): boolean {
  return Object.keys(emptyFallingBlocksSpecialCounts()).every((key) => {
    const value = counts[key as keyof FallingBlocksSpecialCounts];
    return Number.isSafeInteger(value) && value >= 0;
  });
}

export function addFallingBlocksStatistics(
  previous: FallingBlocksStatistics | undefined,
  counts: FallingBlocksSpecialCounts,
): FallingBlocksStatistics {
  const totals = emptyFallingBlocksSpecialCounts();
  for (const key of Object.keys(totals) as Array<keyof FallingBlocksSpecialCounts>) {
    totals[key] = (previous ? previous.totals[key] : 0) + counts[key];
  }
  const gamesPlayed = (previous?.gamesPlayed ?? 0) + 1;
  if (!Number.isSafeInteger(gamesPlayed) || !validFallingBlocksCounts(totals)) throw new Error("GAME_RESULT_INVALID");
  return { gamesPlayed, totals };
}
