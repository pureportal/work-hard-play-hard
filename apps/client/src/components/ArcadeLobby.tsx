import { useState } from "react";
import { ARCADE_GAMES, type GameLobbyState, type Member } from "@workhard/shared";
import "../arcade-new.css";

export function ArcadeLobby({ lobby, members, currentUserId, pending, onStart }: {
  lobby: GameLobbyState;
  members: Member[];
  currentUserId: string;
  pending: boolean;
  onStart: (solo: boolean) => void;
}) {
  const definition = ARCADE_GAMES.find((game) => game.id === lobby.definitionId)!;
  const [solo, setSolo] = useState(true);
  const multiplayerOnly = definition.id === "game-sketch-guess";
  const isSolo = !multiplayerOnly && solo;
  const ready = lobby.participantIds.includes(currentUserId) && (isSolo || lobby.participantIds.length >= 2);
  return <aside className="game-lobby arcade-new-lobby" aria-label={`${definition.name} lobby`} aria-busy={pending} style={{ "--arcade-accent": definition.accent } as React.CSSProperties}>
    <header><h2>{definition.name}</h2></header>
    {!multiplayerOnly && <div className="game-segments" role="group" aria-label="Mode">
      <button type="button" aria-pressed={isSolo} onClick={() => setSolo(true)}>Solo</button>
      <button type="button" aria-pressed={!isSolo} onClick={() => setSolo(false)}>Together</button>
    </div>}
    {!isSolo && <div className="arcade-lobby-players">{lobby.participantIds.map((userId) => <span key={userId}>{userId === currentUserId ? "You" : members.find((member) => member.id === userId)?.name ?? "Player"}</span>)}</div>}
    <button type="button" className="primary-button" disabled={pending || !ready} onClick={() => onStart(isSolo)}>{pending ? "Starting…" : ready ? "Play" : "Waiting for player"}</button>
  </aside>;
}
