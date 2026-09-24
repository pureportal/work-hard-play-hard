import { Play } from "lucide-react";
import { useState } from "react";
import {
  TIC_TAC_TOE_VARIANTS,
  type BotDifficulty,
  type GameBot,
  type GameLobbyState,
  type GameScore,
  type Member,
  type PlayerGameStatistics,
  type TicTacToeVariantId,
} from "@workhard/shared";
import { GameOpponentPicker } from "./GameOpponentPicker";
import { Avatar } from "./Avatar";
import { TicTacToeMark } from "./TicTacToeMark";
import { GameStatisticsButton, GameStatisticsDialog } from "./GameStatisticsDialog";

interface TicTacToeLobbyProps {
  lobby: GameLobbyState;
  members: Member[];
  statistics: PlayerGameStatistics[];
  scores: GameScore[];
  currentUserId: string;
  pending?: boolean;
  initialMode?: "solo" | "multiplayer" | undefined;
  initialVariant?: TicTacToeVariantId | undefined;
  initialDifficulty?: BotDifficulty | undefined;
  onStart: (variantId: TicTacToeVariantId, bot?: GameBot) => void;
}

export function TicTacToeLobby({
  lobby,
  members,
  statistics,
  scores,
  currentUserId,
  pending = false,
  initialMode = "solo",
  initialVariant = "classic",
  initialDifficulty = "medium",
  onStart,
}: TicTacToeLobbyProps) {
  const [mode, setMode] = useState(initialMode);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [variantId, setVariantId] = useState(initialVariant);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const participants = lobby.participantIds.flatMap((userId) => {
    const member = members.find((candidate) => candidate.id === userId);
    return member ? [member] : [];
  });
  const playerStatistics = statistics.find(
    (candidate) => candidate.definitionId === lobby.definitionId && candidate.userId === currentUserId,
  );
  const ready = lobby.participantIds.includes(currentUserId) && (mode === "solo" || participants.length >= lobby.capacity);

  return (
    <aside className="game-lobby tic-tac-toe-lobby" aria-label="Tic-Tac-Toe lobby" aria-busy={pending}>
      <header>
        <TicTacToeMark />
        <h2>Tic-Tac-Toe</h2>
        <GameStatisticsButton onClick={() => setStatisticsOpen(true)} />
      </header>

      <GameOpponentPicker mode={mode} onModeChange={setMode} difficulty={difficulty} onDifficultyChange={setDifficulty} />

      <div className="game-segments tic-tac-toe-variant-picker" role="group" aria-label="Variant">
        {TIC_TAC_TOE_VARIANTS.map((variant) => (
          <button
            key={variant.id}
            type="button"
            aria-pressed={variant.id === variantId}
            onClick={() => setVariantId(variant.id)}
          >
            {variant.name}
          </button>
        ))}
      </div>

      {mode === "multiplayer" && <section className="game-lobby-roster" aria-label="Players">
        <div className="game-lobby-roster-heading"><h3>Players</h3><span>Wins</span></div>
        <ul>
          {participants.map((member) => (
            <li key={member.id}>
              <Avatar member={member} className="score-avatar" />
              <span>{member.id === currentUserId ? "You" : member.name}</span>
              <strong>{statistics.find((candidate) =>
                candidate.definitionId === lobby.definitionId && candidate.userId === member.id,
              )?.multiplayerWins ?? 0}</strong>
            </li>
          ))}
        </ul>
      </section>}

      <button
        className="primary-button tic-tac-toe-start-button"
        disabled={pending || !ready}
        onClick={() => onStart(variantId, mode === "solo" ? { difficulty } : undefined)}
      >
        <Play size={16} fill="currentColor" />
        {pending ? "Starting…" : ready ? "Play" : "Waiting for player"}
      </button>

      {statisticsOpen && <GameStatisticsDialog game="Tic-Tac-Toe" onClose={() => setStatisticsOpen(false)} rankingLabel="Wins"
        metrics={[{ label: "Wins vs players", value: String(playerStatistics?.multiplayerWins ?? 0) }, { label: "Games vs players", value: String(playerStatistics?.gamesPlayed ?? 0) }]}
        rankings={statistics.filter((entry) => entry.definitionId === lobby.definitionId && entry.gamesPlayed > 0)
          .sort((left, right) => right.multiplayerWins - left.multiplayerWins || right.gamesPlayed - left.gamesPlayed)
          .map((entry) => ({ id: entry.userId, name: entry.userId === currentUserId ? "You" : members.find((member) => member.id === entry.userId)?.name ?? "Player", value: String(entry.multiplayerWins) }))}
        history={scores.filter((score) => score.definitionId === lobby.definitionId && score.userId === currentUserId)
          .sort((left, right) => right.playedAt.localeCompare(left.playedAt)).slice(0, 30)
          .map((score) => ({ id: score.id, title: score.won ? "Win" : scores.some((entry) => entry.roundId === score.roundId && entry.won) ? "Loss" : "Draw", detail: new Date(score.playedAt).toLocaleDateString() }))}
      />}
    </aside>
  );
}
