export const TETROMINO_TYPES = ["I", "O", "T", "J", "L", "S", "Z"] as const;

export type TetrominoType = typeof TETROMINO_TYPES[number];

export type TetrominoShape = readonly (readonly number[])[];

export const TETROMINO_SHAPES: Record<TetrominoType, TetrominoShape> = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
};

export const TETROMINO_COLOR_IDS: Record<TetrominoType, number> = {
  I: 1,
  O: 2,
  T: 3,
  J: 4,
  L: 5,
  S: 6,
  Z: 7,
};

export const FALLING_BLOCKS_COMMANDS = ["left", "right", "rotate", "rotate-counterclockwise", "down", "drop", "hold", "pause"] as const;

export type FallingBlocksCommand = typeof FALLING_BLOCKS_COMMANDS[number];

export const FALLING_BLOCKS_MODES = ["classic", "speed-up", "sudden-death"] as const;
export type FallingBlocksMode = typeof FALLING_BLOCKS_MODES[number];

export const FALLING_BLOCKS_MODE_LABELS: Record<FallingBlocksMode, string> = {
  classic: "Classic",
  "speed-up": "Speed-up",
  "sudden-death": "Sudden death",
};

export const FALLING_BLOCKS_ATTACK_TARGETS = ["random", "fewest-stones"] as const;
export type FallingBlocksAttackTarget = typeof FALLING_BLOCKS_ATTACK_TARGETS[number];

export interface FallingBlocksSettings {
  mode: FallingBlocksMode;
  attackTarget: FallingBlocksAttackTarget;
}

export const DEFAULT_FALLING_BLOCKS_SETTINGS: Readonly<FallingBlocksSettings> = {
  mode: "classic",
  attackTarget: "random",
};

export const FALLING_BLOCKS_GARBAGE_CELL = 8;
export const FALLING_BLOCKS_HARD_CELL = 9;

export interface FallingBlocksAttack {
  id: number;
  sourceUserId: string;
  targetUserId: string;
  rows: number;
  remainingMs: number;
}

export interface FallingBlocksRoundState {
  settings: FallingBlocksSettings;
  attacks: FallingBlocksAttack[];
  crownUserId?: string;
}

export interface FallingBlocksCellPosition {
  column: number;
  row: number;
}

export type FallingBlocksSpin = "none" | "mini" | "full";
export type FallingBlocksLineCount = 0 | 1 | 2 | 3 | 4;

export interface FallingBlocksClear {
  id: number;
  lines: FallingBlocksLineCount;
  spin: FallingBlocksSpin;
  points: number;
  combo: number;
  backToBack: boolean;
  perfectClear: boolean;
  attackRows: number;
}

export const FALLING_BLOCKS_SPECIAL_LABELS = {
  singles: "Singles",
  doubles: "Doubles",
  triples: "Triples",
  quads: "Four-line clears",
  tSpins: "T-spins",
  tSpinSingles: "T-spin singles",
  tSpinDoubles: "T-spin doubles",
  tSpinTriples: "T-spin triples",
  tSpinMinis: "Mini T-spins",
  perfectClears: "Perfect clears",
  comboClears: "Combo clears",
  backToBackClears: "Back-to-back clears",
} as const;

export type FallingBlocksSpecialCounts = Record<keyof typeof FALLING_BLOCKS_SPECIAL_LABELS, number>;

export function emptyFallingBlocksSpecialCounts(): FallingBlocksSpecialCounts {
  return {
    singles: 0, doubles: 0, triples: 0, quads: 0,
    tSpins: 0, tSpinSingles: 0, tSpinDoubles: 0, tSpinTriples: 0, tSpinMinis: 0,
    perfectClears: 0, comboClears: 0, backToBackClears: 0,
  };
}

export interface FallingBlocksStatistics {
  gamesPlayed: number;
  totals: FallingBlocksSpecialCounts;
}

export function fallingBlocksAverages(statistics: FallingBlocksStatistics): FallingBlocksSpecialCounts {
  const averages = emptyFallingBlocksSpecialCounts();
  for (const key of Object.keys(averages) as Array<keyof FallingBlocksSpecialCounts>) {
    averages[key] = statistics.gamesPlayed > 0 ? statistics.totals[key] / statistics.gamesPlayed : 0;
  }
  return averages;
}
