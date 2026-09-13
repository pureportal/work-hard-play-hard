import { BOT_DIFFICULTIES, type BotDifficulty } from "@workhard/shared";

export function GameOpponentPicker({ mode, onModeChange, soloLabel = "Bot", difficulty, onDifficultyChange }: {
  mode: "solo" | "multiplayer";
  onModeChange: (mode: "solo" | "multiplayer") => void;
  soloLabel?: string;
  difficulty?: BotDifficulty;
  onDifficultyChange?: (difficulty: BotDifficulty) => void;
}) {
  return (
    <div className="game-opponent-picker">
      <div className="game-segments" role="group" aria-label="Opponent">
        <button type="button" aria-pressed={mode === "solo"} onClick={() => onModeChange("solo")}>{soloLabel}</button>
        <button type="button" aria-pressed={mode === "multiplayer"} onClick={() => onModeChange("multiplayer")}>Players</button>
      </div>
      {mode === "solo" && difficulty && onDifficultyChange && (
        <div className="game-segments" role="group" aria-label="Difficulty">
          {BOT_DIFFICULTIES.map((level) => (
            <button key={level} type="button" aria-pressed={difficulty === level} onClick={() => onDifficultyChange(level)}>
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
