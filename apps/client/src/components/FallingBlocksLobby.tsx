import { useState } from "react";
import { GameOpponentPicker } from "./GameOpponentPicker";
import { Crown, Play, Trophy } from "lucide-react";
import { DEFAULT_FALLING_BLOCKS_SETTINGS, FALLING_BLOCKS_MODES, FALLING_BLOCKS_MODE_LABELS } from "@workhard/shared";
import type {
  FallingBlocksSettings,
  FallingBlocksMode,
  FallingBlocksAttackTarget,
  GameLobbyState,
  GameScore,
  Member,
  PlayerGameStatistics,
} from "@workhard/shared";
import { Avatar } from "./Avatar";
import { FallingBlocksMark } from "./FallingBlocksMark";
import { FallingBlocksSpecialStatistics } from "./FallingBlocksSpecialStatistics";

interface FallingBlocksLobbyProps {
  lobby: GameLobbyState;
  members: Member[];
  scores: GameScore[];
  statistics: PlayerGameStatistics[];
  currentUserId: string;
  pending?: boolean;
  initialMode?: "solo" | "multiplayer" | undefined;
  initialSettings?: FallingBlocksSettings | undefined;
  onStart: (solo: boolean, settings: FallingBlocksSettings) => void;
}

export function FallingBlocksLobby({
  lobby,
  members,
  scores,
  statistics,
  currentUserId,
  pending = false,
  initialMode = "solo",
  initialSettings = DEFAULT_FALLING_BLOCKS_SETTINGS,
  onStart,
}: FallingBlocksLobbyProps) {
  const [mode, setMode] = useState(initialMode);
  const [settings, setSettings] = useState(initialSettings);
  const participants = lobby.participantIds.flatMap((userId) => {
    const member = members.find((candidate) => candidate.id === userId);
    return member ? [member] : [];
  });
  const playerStatistics = statistics.find(
    (candidate) => candidate.definitionId === lobby.definitionId && candidate.userId === currentUserId,
  );
  const crown = statistics.find((entry) => entry.definitionId === lobby.definitionId && entry.holdsCrown);
  const crownMember = members.find((member) => member.id === crown?.userId);
  const bestScoresByUser = new Map<string, GameScore>();
  for (const score of scores.filter((candidate) => candidate.definitionId === lobby.definitionId)) {
    const best = bestScoresByUser.get(score.userId);
    if (!best || score.score > best.score) {
      bestScoresByUser.set(score.userId, score);
    }
  }
  const highScores = [...bestScoresByUser.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  return (
    <aside className="game-lobby falling-blocks-lobby" aria-label="Falling Blocks lobby" aria-busy={pending}>
      <header>
        <FallingBlocksMark />
        <div>
          <h2>Falling Blocks</h2>

        </div>
      </header>

      {crownMember && <p className="falling-blocks-crown" aria-label="Crown holder"><Crown size={17} />{crownMember.id === currentUserId ? "You" : crownMember.name}</p>}

      <GameOpponentPicker mode={mode} onModeChange={setMode} soloLabel="Solo" />

      <div className="falling-blocks-settings">
        <label>
          Mode
          <select value={settings.mode} onChange={(event) => setSettings({ ...settings, mode: event.target.value as FallingBlocksMode })}>
            {FALLING_BLOCKS_MODES.map((gameMode) => <option key={gameMode} value={gameMode}>{FALLING_BLOCKS_MODE_LABELS[gameMode]}</option>)}
          </select>
        </label>
        {mode === "multiplayer" && <label>
          Attack target
          <select value={settings.attackTarget} onChange={(event) => setSettings({ ...settings, attackTarget: event.target.value as FallingBlocksAttackTarget })}>
            <option value="random">Random</option>
            <option value="fewest-stones">Fewest stones</option>
          </select>
        </label>}
      </div>

      {mode === "multiplayer" && <section className="falling-blocks-lobby-players">
        <h3>Lobby</h3>
        <ul>
          {participants.map((member) => (
            <li key={member.id}>
              <Avatar member={member} className="score-avatar" />
              <span>{member.id === currentUserId ? "You" : member.name}</span>
              <strong>{statistics.find((candidate) => candidate.definitionId === lobby.definitionId && candidate.userId === member.id)?.highestScore.toLocaleString() ?? "0"}</strong>
            </li>
          ))}
        </ul>
      </section>}

      <button className="primary-button falling-blocks-start-button" disabled={pending || !lobby.participantIds.includes(currentUserId) || (mode === "multiplayer" && participants.length < 2)} onClick={() => onStart(mode === "solo", settings)}>
        <Play size={16} fill="currentColor" />
        {pending ? "Starting…" : mode === "multiplayer" && participants.length < 2 ? "Waiting for player" : "Play"}
      </button>

      <dl className="falling-blocks-player-stats" aria-label="Your Falling Blocks statistics">
        <div><dt>Best</dt><dd>{(playerStatistics?.highestScore ?? 0).toLocaleString()}</dd></div>
        <div><dt>Wins</dt><dd>{playerStatistics?.multiplayerWins ?? 0}</dd></div>
        <div><dt>Games</dt><dd>{playerStatistics?.gamesPlayed ?? 0}</dd></div>
        <div><dt>Lines</dt><dd>{playerStatistics?.totalLines ?? 0}</dd></div>
      </dl>

      <FallingBlocksSpecialStatistics members={members} statistics={statistics} currentUserId={currentUserId} />

      {highScores.length > 0 && (
        <section className="falling-blocks-high-scores">
          <h3><Trophy size={15} />High scores</h3>
          <ol>
            {highScores.map((score, index) => {
              const member = members.find((candidate) => candidate.id === score.userId);
              return (
                <li key={score.id}>
                  <span>{index + 1}</span>
                  <span>{member?.name ?? "Player"}</span>
                  <strong>{score.score.toLocaleString()}</strong>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </aside>
  );
}
