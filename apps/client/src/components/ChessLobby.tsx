import { CalendarClock, LockKeyhole, Play, Plus, Timer, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BotDifficulty, ChessLobbyState, ChessMatchSettings, ChessMatchSummary, Member } from "@workhard/shared";
import { GameOpponentPicker } from "./GameOpponentPicker";
import { Avatar } from "./Avatar";
import { ChessMark } from "./ChessMark";
import { GameStatisticsButton, GameStatisticsDialog } from "./GameStatisticsDialog";

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
  const [statisticsOpen, setStatisticsOpen] = useState(false);

  const ownMatches = lobby.matches.filter((match) => isParticipant(match, currentUserId));
  const currentMatches = ownMatches.filter((match) => match.status !== "completed");
  const pastMatches = ownMatches.filter((match) => match.status === "completed");
  const playerStatistics = lobby.statistics.find((entry) => entry.userId === currentUserId);
  const activeBotMatch = ownMatches.find((match) => match.settings.bot && match.status === "active");
  const waitingMatchIds = ownMatches.filter((match) => match.status === "waiting").map((match) => match.id).join("|");
  const knownWaitingMatchIds = useRef(new Set(waitingMatchIds ? waitingMatchIds.split("|") : []));
  useEffect(() => {
    const nextIds = waitingMatchIds ? waitingMatchIds.split("|") : [];
    const hasNewMatch = nextIds.some((id) => !knownWaitingMatchIds.current.has(id));
    knownWaitingMatchIds.current = new Set(nextIds);
    if (hasNewMatch) setCreating(false);
  }, [waitingMatchIds]);
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
        <h2>Chess</h2>
        <GameStatisticsButton onClick={() => setStatisticsOpen(true)} />
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
          {mode === "multiplayer" && <button className="chess-new-button" onClick={() => setCreating(true)}><Plus size={16} />New game</button>}
          {currentMatches.length > 0 && (
            <MatchList
              title="Your games"
              matches={currentMatches}
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
          {pastMatches.length > 0 && (
            <MatchList title="History" matches={pastMatches} members={members} currentUserId={currentUserId} onOpen={onOpen} onCancel={onCancel} />
          )}
        </div>
      )}
      {statisticsOpen && <GameStatisticsDialog game="Chess" onClose={() => setStatisticsOpen(false)} rankingLabel="Wins"
        metrics={[{ label: "Wins", value: String(playerStatistics?.wins ?? 0) }, { label: "Games", value: String(playerStatistics?.games ?? 0) }, { label: "Draws", value: String(playerStatistics?.draws ?? 0) }]}
        rankings={lobby.statistics.filter((entry) => entry.games > 0).map((entry) => ({ id: entry.userId, name: entry.userId === currentUserId ? "You" : members.find((member) => member.id === entry.userId)?.name ?? "Player", value: String(entry.wins) }))}
        history={pastMatches.map((match) => ({ id: match.id, title: match.settings.bot ? "Bot" : members.find((member) => member.id === opponentIdFor(match, currentUserId))?.name ?? "Player", detail: `${timeControlLabel(match.settings)} · ${new Date(match.updatedAt).toLocaleDateString()}`, value: match.outcome?.winnerUserId ? match.outcome.winnerUserId === currentUserId ? "Win" : "Loss" : "Draw" }))}
      />}
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
  const time = match.settings.timeControl === "daily" ? "24h" : timeControlLabel(match.settings);
  if (match.status === "waiting") {
    return `${time} · Waiting`;
  }
  if (match.status === "completed") {
    if (!match.outcome?.winnerUserId) {
      return `${time} · Draw`;
    }
    return `${time} · ${match.outcome.winnerUserId === currentUserId ? "You won" : "You lost"}`;
  }
  const currentColor = match.whiteUserId === currentUserId ? "white" : "black";
  return `${time} · ${match.turn === currentColor ? "Your turn" : "Their turn"}`;
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
