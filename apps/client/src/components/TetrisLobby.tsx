import { Play, Trophy } from "lucide-react";
import type {
  GameLobbyState,
  GameScore,
  Member,
  PlayerGameStatistics,
} from "@workhard/shared";
import { Avatar } from "./Avatar";
import { TetrisMark } from "./TetrisMark";

interface TetrisLobbyProps {
  lobby: GameLobbyState;
  members: Member[];
  scores: GameScore[];
  statistics: PlayerGameStatistics[];
  currentUserId: string;
  onStart: () => void;
}

export function TetrisLobby({
  lobby,
  members,
  scores,
  statistics,
  currentUserId,
  onStart,
}: TetrisLobbyProps) {
  const participants = lobby.participantIds.flatMap((userId) => {
    const member = members.find((candidate) => candidate.id === userId);
    return member ? [member] : [];
  });
  const playerStatistics = statistics.find(
    (candidate) => candidate.definitionId === lobby.definitionId && candidate.userId === currentUserId,
  );
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
    <aside className="tetris-lobby" aria-label="Tetris lobby">
      <header>
        <TetrisMark />
        <div>
          <h2>Tetris</h2>
          <span>{participants.length}/{lobby.capacity} players</span>
        </div>
      </header>

      <section className="tetris-lobby-players">
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
      </section>

      <button className="primary-button tetris-start-button" onClick={onStart}>
        <Play size={16} fill="currentColor" />
        {participants.length > 1 ? "Start round" : "Start solo"}
      </button>

      <dl className="tetris-player-stats" aria-label="Your Tetris statistics">
        <div><dt>Best</dt><dd>{(playerStatistics?.highestScore ?? 0).toLocaleString()}</dd></div>
        <div><dt>Wins</dt><dd>{playerStatistics?.multiplayerWins ?? 0}</dd></div>
        <div><dt>Games</dt><dd>{playerStatistics?.gamesPlayed ?? 0}</dd></div>
        <div><dt>Lines</dt><dd>{playerStatistics?.totalLines ?? 0}</dd></div>
      </dl>

      {highScores.length > 0 && (
        <section className="tetris-high-scores">
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
