import { useState } from "react";
import { GameOpponentPicker } from "./GameOpponentPicker";
import { Crown, Play } from "lucide-react";
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
import { GameStatisticsButton, GameStatisticsDialog } from "./GameStatisticsDialog";

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
  const [statisticsOpen, setStatisticsOpen] = useState(false);
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
  const highScores = [...bestScoresByUser.values()].sort((left, right) => right.score - left.score);
  const gameScores = scores.filter((score) => score.definitionId === lobby.definitionId).sort((left, right) => right.playedAt.localeCompare(left.playedAt));

  return (
    <aside className="game-lobby falling-blocks-lobby" aria-label="Falling Blocks lobby" aria-busy={pending}>
      <header>
        <FallingBlocksMark />
        <h2>Falling Blocks</h2>
        <GameStatisticsButton onClick={() => setStatisticsOpen(true)} />
      </header>

      <GameOpponentPicker mode={mode} onModeChange={setMode} soloLabel="Solo" />

      <div className="falling-blocks-settings">
        <div className="game-setting-group">
          <span>Rules</span>
          <div className="game-segments" role="group" aria-label="Rules">
            {FALLING_BLOCKS_MODES.map((gameMode) => <button key={gameMode} type="button" aria-pressed={settings.mode === gameMode} onClick={() => setSettings({ ...settings, mode: gameMode as FallingBlocksMode })}>{FALLING_BLOCKS_MODE_LABELS[gameMode]}</button>)}
          </div>
        </div>
        {mode === "multiplayer" && <label>
          Attack target
          <select value={settings.attackTarget} onChange={(event) => setSettings({ ...settings, attackTarget: event.target.value as FallingBlocksAttackTarget })}>
            <option value="random">Random</option>
            <option value="fewest-stones">Fewest stones</option>
          </select>
        </label>}
      </div>

      {mode === "multiplayer" && <section className="game-lobby-roster" aria-label="Players">
        <div className="game-lobby-roster-heading"><h3>Players</h3><span>Best</span></div>
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

      {statisticsOpen && <GameStatisticsDialog game="Falling Blocks" onClose={() => setStatisticsOpen(false)} rankingLabel="Best score"
        metrics={[
          { label: "Best score", value: (playerStatistics?.highestScore ?? 0).toLocaleString() },
          { label: "Wins", value: String(playerStatistics?.multiplayerWins ?? 0) },
          { label: "Games", value: String(playerStatistics?.gamesPlayed ?? 0) },
          { label: "Lines", value: (playerStatistics?.totalLines ?? 0).toLocaleString() },
        ]}
        rankings={highScores.map((score) => ({ id: score.userId, name: score.userId === currentUserId ? "You" : members.find((member) => member.id === score.userId)?.name ?? "Player", value: score.score.toLocaleString() }))}
        history={gameScores.filter((score) => score.userId === currentUserId).slice(0, 30).map((score) => ({ id: score.id, title: score.mode === "solo" ? "Solo" : "Players", detail: new Date(score.playedAt).toLocaleDateString(), value: score.score.toLocaleString() }))}
      >
        {crownMember && <p className="falling-blocks-crown" aria-label="Crown holder"><Crown size={17} />Crown: {crownMember.id === currentUserId ? "You" : crownMember.name}</p>}
        <FallingBlocksSpecialStatistics members={members} statistics={statistics} currentUserId={currentUserId} />
      </GameStatisticsDialog>}
    </aside>
  );
}
