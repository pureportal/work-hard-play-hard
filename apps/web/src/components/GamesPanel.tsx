import { Gamepad2, Play, Trophy, X } from "lucide-react";
import type { GameScore, Member, MiniGameDefinition } from "@workhard/shared";
import { IconButton } from "./IconButton";

interface GamesPanelProps {
  definitions: MiniGameDefinition[];
  scores: GameScore[];
  members: Member[];
  onPlay: (definitionId: string) => void;
  onClose: () => void;
}

export function GamesPanel({ definitions, scores, members, onPlay, onClose }: GamesPanelProps) {
  const definition = definitions[0];
  if (!definition) {
    return null;
  }
  const leaderboard = scores.filter((score) => score.definitionId === definition.id).sort((left, right) => right.score - left.score).slice(0, 5);
  return (
    <aside className="side-panel games-panel" aria-label="Games">
      <div className="panel-header">
        <div>
          <h2>Arcade</h2>
          <span>{definition.name}</span>
        </div>
        <IconButton label="Close games" icon={X} onClick={onClose} />
      </div>
      <div className="panel-scroll games-panel-scroll">
        <div className="game-hero">
          <span className="game-art"><Gamepad2 size={34} /></span>
          <div><h3>{definition.name}</h3><span>Solo · 10 × 20</span></div>
          <button className="primary-button" onClick={() => onPlay(definition.id)}><Play size={16} fill="currentColor" />Play</button>
        </div>
        <section className="leaderboard">
          <h3><Trophy size={16} />High scores</h3>
          <ol>
            {leaderboard.map((score, index) => {
              const member = members.find((item) => item.id === score.userId);
              return (
                <li key={score.id}>
                  <span className="rank">{index + 1}</span>
                  <span className="score-avatar" style={{ background: member?.color }}>{member?.initials}</span>
                  <span>{member?.name}</span>
                  <strong>{score.score.toLocaleString()}</strong>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </aside>
  );
}
