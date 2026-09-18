export const GAME_GUIDE_STATUSES = ["started", "skipped", "completed"] as const;

export type GameGuideStatus = typeof GAME_GUIDE_STATUSES[number];

export interface GameGuideState {
  status: GameGuideStatus | null;
}
