import { CalendarClock, LockKeyhole, Play, Plus, Timer, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BotDifficulty, ChessLobbyState, ChessMatchSettings, ChessMatchSummary, Member } from "@workhard/shared";
import { GameOpponentPicker } from "./GameOpponentPicker";
import { Avatar } from "./Avatar";
import { ChessMark } from "./ChessMark";

interface ChessLobbyProps {
  lobby: ChessLobbyState;
  members: Member[];
  currentUserId: string;
  pending?: boolean;
  onCreate: (settings: ChessMatchSettings) => void;
  onJoin: (matchId: string) => void;
  onOpen: (matchId: string) => void;
  onCancel: (matchId: string) => void;
}

export function ChessLobby({
  lobby,
  members,
  currentUserId,
  pending = false,
  onCreate,
  onJoin,
  onOpen,
  onCancel,
}: ChessLobbyProps) {
  const opponents = useMemo(
    () => members.filter((member) => member.id !== currentUserId).sort((left, right) => left.name.localeCompare(right.name)),
    [currentUserId, members],
  );
  const [mode, setMode] = useState<"solo" | "multiplayer">("solo");
  const [difficulty, setDifficulty] = useState<BotDifficulty>("medium");
  const [creating, setCreating] = useState(false);
  const [timeControl, setTimeControl] = useState<ChessMatchSettings["timeControl"]>("standard");
  const [access, setAccess] = useState<ChessMatchSettings["access"]>("open");
  const [opponentUserId, setOpponentUserId] = useState(opponents[0]?.id ?? "");
  const [pauseWeekends, setPauseWeekends] = useState(false);

  const ownMatches = lobby.matches.filter((match) => isParticipant(match, currentUserId));
  const activeBotMatch = ownMatches.find((match) => match.settings.bot && match.status === "active");
  const hasWaitingMatch = ownMatches.some((match) => match.status === "waiting");
  useEffect(() => {
    if (hasWaitingMatch) setCreating(false);
  }, [hasWaitingMatch]);
  const invitations = lobby.matches.filter((match) => (
    match.status === "waiting"
    && match.reservedBlackUserId === currentUserId
    && !isParticipant(match, currentUserId)
  ));
  const openMatches = lobby.matches.filter((match) => (
    match.status === "waiting"
    && match.settings.access === "open"
    && match.whiteUserId !== currentUserId
  ));

  const createMatch = () => {
    onCreate({
      timeControl: mode === "solo" ? "standard" : timeControl,
      pauseWeekends: mode === "multiplayer" && timeControl === "daily" && pauseWeekends,
      access: mode === "solo" ? "locked" : access,
      ...(mode === "solo" ? { bot: { difficulty } } : access === "locked" ? { opponentUserId } : {}),
    });
  };

  return (
    <aside className="game-lobby chess-lobby" aria-label="Chess lobby" aria-busy={pending}>
      <header>
        <ChessMark />
        <div>
          <h2>Chess</h2>
        </div>
        {mode === "multiplayer" && !creating && !ownMatches.some((match) => match.status === "waiting") && (
          <button className="chess-new-button" onClick={() => setCreating(true)}>
            <Plus size={16} />New game
          </button>
        )}
      </header>

      <GameOpponentPicker mode={mode} onModeChange={setMode} difficulty={difficulty} onDifficultyChange={setDifficulty} />

      {mode === "solo" && (
        <button className="primary-button game-play-button" disabled={pending} onClick={() => activeBotMatch ? onOpen(activeBotMatch.id) : createMatch()}>
          <Play size={16} />{pending ? "Opening…" : activeBotMatch ? "Resume" : "Play"}
        </button>
      )}

      {mode === "multiplayer" && creating ? (
        <section className="chess-setup" aria-label="New chess game">
          <div className="chess-setup-heading">
            <h3>New game</h3>
            <button aria-label="Close setup" onClick={() => setCreating(false)}><X size={16} /></button>
          </div>

          <fieldset className="chess-control-options">
            <legend>Time</legend>
            <label className={timeControl === "standard" ? "is-selected" : ""}>
              <input type="radio" name="chess-time" value="standard" checked={timeControl === "standard"} onChange={() => setTimeControl("standard")} />
              <Play size={17} /><span><strong>Standard</strong><small>No clock</small></span>
            </label>
            <label className={timeControl === "rapid" ? "is-selected" : ""}>
              <input type="radio" name="chess-time" value="rapid" checked={timeControl === "rapid"} onChange={() => setTimeControl("rapid")} />
              <Timer size={17} /><span><strong>Rapid</strong><small>10 min</small></span>
            </label>
            <label className={timeControl === "daily" ? "is-selected" : ""}>
              <input type="radio" name="chess-time" value="daily" checked={timeControl === "daily"} onChange={() => setTimeControl("daily")} />
              <CalendarClock size={17} /><span><strong>24 hours</strong><small>Per move</small></span>
            </label>
          </fieldset>

          {timeControl === "daily" && (
            <label className="chess-weekend-toggle">
              <input type="checkbox" checked={pauseWeekends} onChange={(event) => setPauseWeekends(event.target.checked)} />
              <span>Pause weekends (UTC)</span>
            </label>
          )}

          <fieldset className="chess-access-options">
            <legend>Access</legend>
            <label className={access === "open" ? "is-selected" : ""}>
              <input type="radio" name="chess-access" value="open" checked={access === "open"} onChange={() => setAccess("open")} />
              <Users size={16} />Open
            </label>
            <label className={access === "locked" ? "is-selected" : ""}>
              <input type="radio" name="chess-access" value="locked" checked={access === "locked"} onChange={() => setAccess("locked")} />
              <LockKeyhole size={16} />Locked
            </label>
          </fieldset>

          {access === "locked" && (
            <label className="chess-opponent-field">
              <span>Opponent</span>
              <select value={opponentUserId} onChange={(event) => setOpponentUserId(event.target.value)}>
                {opponents.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </label>
          )}

          <button className="primary-button chess-create-button" disabled={pending || (access === "locked" && !opponentUserId)} onClick={createMatch}>
            {pending ? "Creating…" : "Create game"}
          </button>
        </section>
      ) : (
        <div className="chess-lobby-lists" inert={pending}>
          {ownMatches.length > 0 && (
            <MatchList
              title="Your games"
              matches={ownMatches}
              members={members}
              currentUserId={currentUserId}
              onOpen={onOpen}
              onCancel={onCancel}
            />
          )}
          {invitations.length > 0 && (
            <JoinList title="Invitations" matches={invitations} members={members} onJoin={onJoin} />
          )}
          {openMatches.length > 0 && (
            <JoinList title="Open games" matches={openMatches} members={members} onJoin={onJoin} />
          )}
          {mode === "multiplayer" && ownMatches.length === 0 && invitations.length === 0 && openMatches.length === 0 && (
            <button className="chess-empty-state" onClick={() => setCreating(true)}>
              <ChessMark />
              <span>Start a game</span>
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function MatchList({
  title,
  matches,
  members,
  currentUserId,
  onOpen,
  onCancel,
}: {
  title: string;
  matches: ChessMatchSummary[];
  members: Member[];
  currentUserId: string;
  onOpen: (matchId: string) => void;
  onCancel: (matchId: string) => void;
}) {
  return (
    <section className="chess-match-list">
      <h3>{title}</h3>
      <ul>
        {matches.map((match) => {
          const opponentId = opponentIdFor(match, currentUserId);
          const opponent = members.find((member) => member.id === opponentId);
          const waiting = match.status === "waiting";
          return (
            <li key={match.id} data-match-id={match.id}>
              {opponent ? <Avatar member={opponent} className="score-avatar" /> : <ChessMark />}
              <button className="chess-match-main" disabled={waiting} onClick={() => onOpen(match.id)}>
                <strong>{(match.settings.bot ? "Bot" : opponent?.name) ?? (match.settings.access === "open" ? "Open game" : "Waiting")}</strong>
                <span>{matchStatus(match, currentUserId)}</span>
              </button>
              {waiting ? (
                <button className="chess-cancel-button" aria-label="Cancel game" onClick={() => onCancel(match.id)}><Trash2 size={15} /></button>
              ) : (
                <button className="chess-play-button" aria-label={match.status === "completed" ? "Review game" : "Play game"} onClick={() => onOpen(match.id)}><Play size={15} /></button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function JoinList({ title, matches, members, onJoin }: {
  title: string;
  matches: ChessMatchSummary[];
  members: Member[];
  onJoin: (matchId: string) => void;
}) {
  return (
    <section className="chess-match-list">
      <h3>{title}</h3>
      <ul>
        {matches.map((match) => {
          const creator = members.find((member) => member.id === match.whiteUserId);
          return (
            <li key={match.id} data-match-id={match.id}>
              {creator ? <Avatar member={creator} className="score-avatar" /> : <ChessMark />}
              <div className="chess-match-main">
                <strong>{creator?.name ?? "Player"}</strong>
                <span>{timeControlLabel(match.settings)}</span>
              </div>
              <button className="chess-join-button" onClick={() => onJoin(match.id)}>Join</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function isParticipant(match: ChessMatchSummary, userId: string): boolean {
  return match.whiteUserId === userId || match.blackUserId === userId;
}

function opponentIdFor(match: ChessMatchSummary, userId: string): string | undefined {
  if (match.whiteUserId === userId) {
    return match.blackUserId ?? match.reservedBlackUserId;
  }
  return match.whiteUserId;
}

function matchStatus(match: ChessMatchSummary, currentUserId: string): string {
  if (match.status === "waiting") {
    return `${timeControlLabel(match.settings)} · Waiting`;
  }
  if (match.status === "completed") {
    if (!match.outcome?.winnerUserId) {
      return `${timeControlLabel(match.settings)} · Draw`;
    }
    return `${timeControlLabel(match.settings)} · ${match.outcome.winnerUserId === currentUserId ? "You won" : "You lost"}`;
  }
  const currentColor = match.whiteUserId === currentUserId ? "white" : "black";
  return `${timeControlLabel(match.settings)} · ${match.turn === currentColor ? "Your turn" : "Their turn"}`;
}

function timeControlLabel(settings: ChessMatchSettings): string {
  if (settings.timeControl === "rapid") {
    return "Rapid";
  }
  if (settings.timeControl === "daily") {
    return settings.pauseWeekends ? "24 hours · Weekends paused" : "24 hours";
  }
  return "Standard";
}
