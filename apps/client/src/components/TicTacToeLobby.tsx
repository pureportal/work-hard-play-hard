import { Play } from "lucide-react";
import { useState } from "react";
import {
  TIC_TAC_TOE_VARIANTS,
  type BotDifficulty,
  type GameBot,
  type GameLobbyState,
  type Member,
  type PlayerGameStatistics,
  type TicTacToeVariantId,
} from "@workhard/shared";
import { GameOpponentPicker } from "./GameOpponentPicker";
import { Avatar } from "./Avatar";
import { TicTacToeMark } from "./TicTacToeMark";

interface TicTacToeLobbyProps {
  lobby: GameLobbyState;
  members: Member[];
  statistics: PlayerGameStatistics[];
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
        <div>
          <h2>Tic-Tac-Toe</h2>
        </div>
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

      {mode === "multiplayer" && <ul className="tic-tac-toe-lobby-players" aria-label="Players">
        {participants.map((member) => (
          <li key={member.id}>
            <Avatar member={member} className="score-avatar" />
            <span>{member.id === currentUserId ? "You" : member.name}</span>
            <strong>{statistics.find((candidate) =>
              candidate.definitionId === lobby.definitionId && candidate.userId === member.id,
            )?.multiplayerWins ?? 0}</strong>
          </li>
        ))}
      </ul>}

      <button
        className="primary-button tic-tac-toe-start-button"
        disabled={pending || !ready}
        onClick={() => onStart(variantId, mode === "solo" ? { difficulty } : undefined)}
      >
        <Play size={16} fill="currentColor" />
        {pending ? "Starting…" : ready ? "Play" : "Waiting for player"}
      </button>

      {mode === "multiplayer" && <dl className="tic-tac-toe-player-stats" aria-label="Your Tic-Tac-Toe statistics">
        <div><dt>Wins</dt><dd>{playerStatistics?.multiplayerWins ?? 0}</dd></div>
        <div><dt>Games</dt><dd>{playerStatistics?.gamesPlayed ?? 0}</dd></div>
      </dl>}
    </aside>
  );
}
