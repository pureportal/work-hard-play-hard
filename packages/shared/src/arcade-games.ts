export const ARCADE_GAMES = [
  { id: "game-minefield-relay", name: "Minefield Relay", assetId: "equipment-minefield-relay", accent: "#58c6a4" },
  { id: "game-memory-sprint", name: "Memory Sprint", assetId: "equipment-memory-sprint", accent: "#eead68" },
  { id: "game-territory-rush", name: "Territory Rush", assetId: "equipment-territory-rush", accent: "#8c99eb" },
  { id: "game-sketch-guess", name: "Sketch & Guess", assetId: "equipment-sketch-guess", accent: "#ee93b5" },
  { id: "game-bomb-arena", name: "Bomb Arena", assetId: "equipment-bomb-arena", accent: "#f49a6d" },
  { id: "game-snake-scramble", name: "Snake Scramble", assetId: "equipment-snake-scramble", accent: "#87cf75" },
  { id: "game-mini-golf", name: "Mini Golf", assetId: "equipment-mini-golf", accent: "#84c9a0" },
  { id: "game-space-defense", name: "Space Defense", assetId: "equipment-space-defense", accent: "#7fa7ee" },
] as const;

export type ArcadeGameId = (typeof ARCADE_GAMES)[number]["id"];
export const TEAM_ARCADE_GAME_IDS: readonly ArcadeGameId[] = ["game-minefield-relay", "game-space-defense"];
export type ArcadeDirection = "up" | "down" | "left" | "right";
export type ArcadeCommand =
  | { kind: "reveal" | "claim" | "memory"; cell: number }
  | { kind: "move" | "turn"; direction: ArcadeDirection }
  | { kind: "bomb" | "shoot" }
  | { kind: "stroke"; points: number[]; color: string }
  | { kind: "guess"; text: string }
  | { kind: "shot"; dx: number; dy: number; power: number };

export interface ArcadePlayerState {
  userId: string;
  score: number;
  lives: number;
  x: number;
  y: number;
  direction: ArcadeDirection;
  trail: number[];
  strokes: number;
  progress: number;
  finished: boolean;
}

export function compareArcadePlayers(first: ArcadePlayerState, second: ArcadePlayerState, gameId: ArcadeGameId): number {
  const activeDifference = Number(first.lives > 0) - Number(second.lives > 0);
  if (activeDifference) return activeDifference;
  if (gameId === "game-bomb-arena" || gameId === "game-snake-scramble") {
    return first.lives - second.lives || first.score - second.score;
  }
  return first.score - second.score || first.lives - second.lives;
}

export interface ArcadeEntity {
  id: number;
  x: number;
  y: number;
  kind: "bomb" | "blast" | "enemy" | "bullet" | "food" | "wall";
  ownerUserId?: string;
  timer?: number;
}

export interface ArcadeGameState {
  type: "game.state";
  definitionId: ArcadeGameId;
  roundId: string;
  width: number;
  height: number;
  board: number[];
  players: ArcadePlayerState[];
  entities: ArcadeEntity[];
  secondsLeft: number;
  stage: number;
  phase: "preview" | "play" | "result";
  turnUserId?: string;
  prompt?: string;
  hint?: string;
  sequence?: number[];
  sequenceLength?: number;
  previewCell?: number;
  stationHealth?: number;
  turnSecondsLeft?: number;
  teamWon?: boolean;
  guessedUserIds?: string[];
  strokes?: Array<{ points: number[]; color: string }>;
  currentPlayerId?: string;
  message?: string;
}
