export const BOT_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type BotDifficulty = typeof BOT_DIFFICULTIES[number];
export const GAME_BOT_USER_ID = "game-bot";

export interface GameBot {
  difficulty: BotDifficulty;
}
