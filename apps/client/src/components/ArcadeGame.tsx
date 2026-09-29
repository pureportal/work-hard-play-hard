import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react";
import { ARCADE_GAMES, compareArcadePlayers, type ArcadeCommand, type ArcadeDirection, type ArcadeGameState, type Member } from "@workhard/shared";
import { X } from "lucide-react";
import { GameExitPrompt } from "./GameExitPrompt";
import { GameResultActions } from "./GameResultActions";
import { IconButton } from "./IconButton";
import { useModalFocus } from "../hooks/useModalFocus";
import "../arcade-new.css";

const colors = ["#343547", "#e36975", "#e6aa57", "#69ad81", "#5c99d1", "#a37bca"];
const playerColors = ["#65c4be", "#f0a2a0", "#e8c478", "#b6a2e2"];
const directions: ArcadeDirection[] = ["up", "left", "down", "right"];

export function ArcadeGame({ state, members, currentUserId, onCommand, onClose, onPlayAgain }: {
  state: ArcadeGameState;
  members: Member[];
  currentUserId: string;
  onCommand: (command: ArcadeCommand) => void;
  onClose: () => void;
  onPlayAgain?: (() => void) | undefined;
}) {
  const game = ARCADE_GAMES.find((entry) => entry.id === state.definitionId)!;
  const [confirmingExit, setConfirmingExit] = useState(false);
  const active = state.phase !== "result";
  const close = () => active ? setConfirmingExit(true) : onClose();
  const dialogRef = useModalFocus<HTMLElement>(close);
  const player = state.players.find((entry) => entry.userId === currentUserId);
  const interactive = active && !player?.finished && !confirmingExit;
  const stageLabel = state.definitionId === "game-mini-golf" ? "Hole" : state.definitionId === "game-space-defense" ? "Wave" : "Round";
  const showsStage = ["game-memory-sprint", "game-sketch-guess", "game-mini-golf", "game-space-defense"].includes(state.definitionId);
  const ranked = [...state.players].sort((a, b) => compareArcadePlayers(b, a, state.definitionId));
  const winner = ranked.length > 1 && compareArcadePlayers(ranked[0]!, ranked[1]!, state.definitionId) === 0 ? undefined : ranked[0];
  let resultLabel = `Score ${player?.score ?? 0}`;
  if (state.definitionId === "game-space-defense") resultLabel = state.teamWon ? "Station saved" : "Station lost";
  else if (state.definitionId === "game-minefield-relay") resultLabel = state.teamWon ? "Field cleared" : "Field uncleared";
  else if (state.players.length > 1) resultLabel = !winner ? "Draw" : winner.userId === currentUserId ? "You win" : `${members.find((member) => member.id === winner.userId)?.name ?? "Opponent"} wins`;

  useEffect(() => {
    if (!interactive || !["game-bomb-arena", "game-snake-scramble", "game-space-defense"].includes(state.definitionId)) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = ({ ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" } as Record<string, ArcadeDirection>)[event.key];
      if (direction) { event.preventDefault(); onCommand({ kind: state.definitionId === "game-snake-scramble" ? "turn" : "move", direction }); }
      if (event.code === "Space" && state.definitionId !== "game-snake-scramble" && !(event.target instanceof HTMLElement && event.target.closest("button"))) { event.preventDefault(); onCommand({ kind: state.definitionId === "game-bomb-arena" ? "bomb" : "shoot" }); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [interactive, onCommand, state.definitionId]);

  return <div className="modal-backdrop game-backdrop">
    <section className="arcade-game arcade-new-game" ref={dialogRef} role="dialog" aria-modal="true" aria-label={game.name} tabIndex={-1} style={{ "--arcade-accent": game.accent } as React.CSSProperties}>
      <header className="game-header"><div><div><h2>{game.name}</h2><span>{state.phase === "result" ? "Finished" : `${state.definitionId === "game-sketch-guess" ? state.turnSecondsLeft ?? 45 : state.secondsLeft}s${showsStage ? ` · ${stageLabel} ${state.stage}` : ""}`}</span></div></div><IconButton icon={X} label="Close game" onClick={close} /></header>
      {confirmingExit && <GameExitPrompt multiplayer={state.players.length > 1} onLeave={onClose} onCancel={() => setConfirmingExit(false)} />}
      <div className="arcade-new-content">
        <div className="arcade-score-strip" aria-label="Scores">{state.players.map((entry, index) => <div key={entry.userId} className={entry.userId === currentUserId ? "is-you" : ""}>
          <span className="arcade-player-dot" style={{ background: playerColors[index % playerColors.length] }} />
          <span>{entry.userId === currentUserId ? "You" : members.find((member) => member.id === entry.userId)?.name ?? "Player"}</span>
          <strong>{entry.score}</strong>
          {entry.lives < 3 && state.definitionId !== "game-territory-rush" && state.definitionId !== "game-mini-golf" && state.definitionId !== "game-sketch-guess" && <small>{entry.lives} ♥</small>}
        </div>)}</div>
        {state.definitionId === "game-sketch-guess" ? <SketchBoard state={state} currentUserId={currentUserId} members={members} interactive={interactive} onCommand={onCommand} />
          : state.definitionId === "game-mini-golf" ? <GolfBoard state={state} playerId={currentUserId} interactive={interactive} onCommand={onCommand} />
            : <TileBoard state={state} playerId={currentUserId} interactive={interactive} onCommand={onCommand} />}
        {state.definitionId === "game-memory-sprint" && state.phase !== "result" && <div className="arcade-sequence" aria-live="polite">{state.phase === "preview" ? "Watch the pads" : `Repeat · ${player?.progress ?? 0}/${state.sequenceLength ?? 0}`}</div>}
        {state.definitionId === "game-space-defense" && <div className="arcade-station"><span>Station</span><progress max={24} value={state.stationHealth ?? 0} aria-label="Station health" /><strong>{state.stationHealth ?? 0}</strong></div>}
        {state.definitionId === "game-snake-scramble" || state.definitionId === "game-bomb-arena" || state.definitionId === "game-space-defense" ? <Controls kind={state.definitionId} interactive={interactive} onCommand={onCommand} /> : null}
        {state.phase === "result" && <div className="arcade-result" role="status">{resultLabel}</div>}
      </div>
      {state.phase === "result" && <GameResultActions onClose={onClose} onPlayAgain={onPlayAgain} />}
    </section>
  </div>;
}

function TileBoard({ state, playerId, interactive, onCommand }: { state: ArcadeGameState; playerId: string; interactive: boolean; onCommand: (command: ArcadeCommand) => void }) {
  const isActionBoard = ["game-minefield-relay", "game-memory-sprint", "game-territory-rush"].includes(state.definitionId);
  const boardRatio = state.width / state.height;
  const owner = state.players.findIndex((player) => player.userId === playerId) + 1;
  const player = state.players[owner - 1];
  const occupied = new Map<number, { label: string; className: string }>();
  if (state.definitionId === "game-snake-scramble") state.players.forEach((player, index) => player.trail.forEach((cell, segment) => occupied.set(cell, { label: segment === 0 ? "●" : "", className: `snake-${index % 4}` })));
  if (state.definitionId === "game-bomb-arena" || state.definitionId === "game-space-defense") state.players.forEach((player, index) => {
    if (!player.finished) occupied.set(Math.floor(player.y) * state.width + Math.floor(player.x), { label: state.definitionId === "game-space-defense" ? "▲" : "●", className: `snake-${index % 4}` });
  });
  state.entities.forEach((entity) => occupied.set(Math.floor(entity.y) * state.width + Math.floor(entity.x), { label: ({ bomb: "●", blast: "✦", enemy: "◆", bullet: "│", food: "◆", wall: "" } as Record<string, string>)[entity.kind] ?? "", className: `entity-${entity.kind}` }));
  const cells = state.board.map((value, cell) => {
    const object = occupied.get(cell);
    const kind = state.definitionId;
    const label = kind === "game-minefield-relay" ? value === -1 ? "" : value === 9 ? "✹" : value === 0 ? "" : String(value)
      : kind === "game-territory-rush" ? value ? "◆" : ""
        : kind === "game-memory-sprint" ? String(cell + 1) : object?.label ?? "";
    const neighbors = [cell % state.width > 0 ? cell - 1 : -1, cell % state.width < state.width - 1 ? cell + 1 : -1, cell - state.width, cell + state.width];
    const enabled = interactive && (kind === "game-minefield-relay" ? value === -1 : kind === "game-territory-rush" ? value === 0 && neighbors.some((neighbor) => state.board[neighbor] === owner) : state.phase === "play" && (player?.progress ?? 0) < (state.sequenceLength ?? 0));
    const className = `arcade-cell ${kind} ${object?.className ?? ""} ${value === 1 && !isActionBoard ? "is-wall" : ""} ${kind === "game-bomb-arena" && value === 2 ? "is-crate" : ""} ${kind === "game-minefield-relay" && value >= 0 ? "is-revealed" : ""} ${kind === "game-memory-sprint" && state.phase === "preview" && state.previewCell === cell ? "is-previewed" : ""} ${kind === "game-territory-rush" && value ? `is-owner-${value}` : ""} ${kind === "game-territory-rush" && enabled ? "is-available" : ""}`;
    if (!isActionBoard) return <span key={cell} className={className} aria-hidden="true">{label}</span>;
    const commandKind = kind === "game-minefield-relay" ? "reveal" : kind === "game-territory-rush" ? "claim" : "memory";
    return <button type="button" key={cell} data-cell={cell} className={className} disabled={!enabled} aria-label={kind === "game-minefield-relay" ? `Reveal row ${Math.floor(cell / state.width) + 1}, column ${cell % state.width + 1}` : kind === "game-territory-rush" ? `Claim row ${Math.floor(cell / state.width) + 1}, column ${cell % state.width + 1}` : `Pad ${cell + 1}`} onClick={() => onCommand({ kind: commandKind, cell })}>{label}</button>;
  });
  const navigate = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isActionBoard || !(event.target instanceof HTMLButtonElement)) return;
    const direction = ({ ArrowUp: -state.width, ArrowDown: state.width, ArrowLeft: -1, ArrowRight: 1 } as Record<string, number>)[event.key];
    if (direction === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    let next = Number(event.target.dataset.cell);
    while (true) {
      const candidate = next + direction;
      if (candidate < 0 || candidate >= state.board.length || Math.abs(direction) === 1 && Math.floor(candidate / state.width) !== Math.floor(next / state.width)) return;
      const button = event.currentTarget.querySelector<HTMLButtonElement>(`button[data-cell="${candidate}"]`);
      if (button && !button.disabled) { button.focus(); return; }
      next = candidate;
    }
  };
  return <div className={`arcade-tile-board ${isActionBoard ? "is-action" : ""}`} onKeyDown={navigate} style={{
    gridTemplateColumns: `repeat(${state.width}, 1fr)`,
    "--board-width": state.width,
    "--board-height": state.height,
    "--board-max-width": `${Math.min(state.definitionId === "game-memory-sprint" ? 380 : 560, 480 * boardRatio)}px`,
    "--board-viewport-width": `${60 * boardRatio}dvh`,
    "--board-landscape-width": `calc(${100 * boardRatio}dvh - ${146 * boardRatio}px)`,
  } as React.CSSProperties}>{cells}</div>;
}

function Controls({ kind, interactive, onCommand }: { kind: ArcadeGameState["definitionId"]; interactive: boolean; onCommand: (command: ArcadeCommand) => void }) {
  return <div className="arcade-controls" aria-label="Game controls">
    <div className="arcade-dpad">{directions.map((direction) => <PressControl key={direction} label={direction} interactive={interactive} command={{ kind: kind === "game-snake-scramble" ? "turn" : "move", direction }} repeatMs={kind === "game-snake-scramble" ? undefined : kind === "game-bomb-arena" ? 180 : 120} onCommand={onCommand}>{({ up: "↑", down: "↓", left: "←", right: "→" })[direction]}</PressControl>)}</div>
    {kind !== "game-snake-scramble" && <PressControl className="arcade-action" label={kind === "game-bomb-arena" ? "Bomb" : "Fire"} interactive={interactive} command={{ kind: kind === "game-bomb-arena" ? "bomb" : "shoot" }} repeatMs={kind === "game-space-defense" ? 350 : undefined} onCommand={onCommand}>{kind === "game-bomb-arena" ? "Bomb" : "Fire"}</PressControl>}
  </div>;
}

function PressControl({ label, className, interactive, command, repeatMs, onCommand, children }: {
  label: string; className?: string; interactive: boolean; command: ArcadeCommand; repeatMs?: number | undefined;
  onCommand: (command: ArcadeCommand) => void; children: React.ReactNode;
}) {
  const timer = useRef<number | undefined>(undefined);
  const stop = () => { if (timer.current !== undefined) window.clearInterval(timer.current); timer.current = undefined; };
  useEffect(() => {
    window.addEventListener("blur", stop);
    return () => { window.removeEventListener("blur", stop); stop(); };
  }, []);
  useEffect(() => { if (!interactive) stop(); }, [interactive]);
  return <button type="button" className={className} disabled={!interactive} aria-label={label}
    onPointerDown={(event) => {
      if (!interactive) return;
      stop();
      event.currentTarget.setPointerCapture(event.pointerId);
      onCommand(command);
      if (repeatMs !== undefined) timer.current = window.setInterval(() => onCommand(command), repeatMs);
    }}
    onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onPointerLeave={stop}
    onClick={(event) => { if (event.detail === 0) onCommand(command); }}
  >{children}</button>;
}

function SketchBoard({ state, currentUserId, members, interactive, onCommand }: { state: ArcadeGameState; currentUserId: string; members: Member[]; interactive: boolean; onCommand: (command: ArcadeCommand) => void }) {
  const drawing = currentUserId === state.currentPlayerId;
  const guessed = state.guessedUserIds?.includes(currentUserId) ?? false;
  const [color, setColor] = useState(colors[0]!);
  const [guess, setGuess] = useState("");
  const [draft, setDraft] = useState<number[]>([]);
  const currentStroke = useRef<number[]>([]);
  const activePointer = useRef<number | undefined>(undefined);
  const coordinates = (event: PointerEvent<SVGSVGElement>): [number, number] => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(100, Math.round((event.clientX - bounds.left) / bounds.width * 100))), Math.max(0, Math.min(100, Math.round((event.clientY - bounds.top) / bounds.height * 100)))];
  };
  const addPoint = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointer.current !== event.pointerId || !currentStroke.current.length) return;
    const [x, y] = coordinates(event);
    const points = currentStroke.current;
    if (points[points.length - 2] === x && points[points.length - 1] === y) return;
    points.push(x, y);
    if (points.length > 128) {
      const reduced: number[] = [];
      for (let index = 0; index < points.length - 2; index += 4) reduced.push(points[index]!, points[index + 1]!);
      reduced.push(x, y);
      currentStroke.current = reduced;
    }
    setDraft([...currentStroke.current]);
  };
  const endStroke = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointer.current !== event.pointerId) return;
    if (drawing && interactive) {
      addPoint(event);
      if (currentStroke.current.length === 2) currentStroke.current.push(...currentStroke.current);
      onCommand({ kind: "stroke", points: currentStroke.current, color });
    }
    activePointer.current = undefined;
    currentStroke.current = [];
    setDraft([]);
  };
  const cancelStroke = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = undefined;
    currentStroke.current = [];
    setDraft([]);
  };
  return <div className="arcade-sketch">
    <div className="arcade-sketch-status">{drawing ? state.prompt : state.phase === "result" ? state.prompt : `${members.find((member) => member.id === state.currentPlayerId)?.name ?? "Player"} draws · ${state.hint}`}</div>
    <svg viewBox="0 0 100 100" className="arcade-sketch-canvas" role="img" aria-label="Drawing canvas"
      onPointerDown={(event) => { if (!drawing || !interactive || activePointer.current !== undefined) return; event.currentTarget.setPointerCapture(event.pointerId); activePointer.current = event.pointerId; currentStroke.current = coordinates(event); setDraft([...currentStroke.current]); }}
      onPointerMove={(event) => { if (drawing && interactive) addPoint(event); }} onPointerUp={endStroke} onPointerCancel={cancelStroke} onLostPointerCapture={cancelStroke}>
      <rect x="0" y="0" width="100" height="100" fill="#fffdf7" />
      {state.strokes?.map((stroke, index) => <polyline key={index} points={toPoints(stroke.points)} stroke={stroke.color} fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />)}
      {draft.length >= 4 && <polyline points={toPoints(draft)} stroke={color} fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
    {drawing ? <div className="arcade-palette">{colors.map((option) => <button key={option} type="button" aria-label={`Color ${option}`} aria-pressed={color === option} style={{ background: option }} onClick={() => setColor(option)} />)}</div>
      : <form className="arcade-guess" onSubmit={(event) => { event.preventDefault(); if (guess.trim() && !guessed) { onCommand({ kind: "guess", text: guess }); setGuess(""); } }}><input value={guess} onChange={(event) => setGuess(event.target.value)} aria-label="Your guess" placeholder={guessed ? "Correct" : "Your guess"} maxLength={40} disabled={!interactive || guessed} /><button type="submit" disabled={!interactive || guessed || !guess.trim()}>Guess</button></form>}
    {state.message && <div className="arcade-sketch-message" role="status">{state.message}</div>}
  </div>;
}

function toPoints(points: number[]): string { const pairs = []; for (let index = 0; index < points.length; index += 2) pairs.push(`${points[index]},${points[index + 1]}`); return pairs.join(" "); }

function GolfBoard({ state, playerId, interactive, onCommand }: { state: ArcadeGameState; playerId: string; interactive: boolean; onCommand: (command: ArcadeCommand) => void }) {
  const player = state.players.find((entry) => entry.userId === playerId);
  const [aim, setAim] = useState<{ x: number; y: number }>();
  const activePointer = useRef<number | undefined>(undefined);
  const point = (event: PointerEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * 160, y: (event.clientY - rect.top) / rect.height * 120 }; };
  const shoot = (target: { x: number; y: number }) => {
    if (!interactive || !player || player.finished) return;
    const dx = target.x - player.x * 10, dy = target.y - player.y * 10, length = Math.hypot(dx, dy);
    if (length > 4) onCommand({ kind: "shot", dx: dx / length, dy: dy / length, power: Math.min(1, length / 65) });
    setAim(undefined);
  };
  const onKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (!interactive || !player || player.finished) return;
    const movement = ({ ArrowUp: [0, -10], ArrowDown: [0, 10], ArrowLeft: [-10, 0], ArrowRight: [10, 0] } as Record<string, [number, number]>)[event.key];
    if (movement) {
      event.preventDefault();
      event.stopPropagation();
      setAim((current) => {
        const origin = current ?? { x: player.x * 10, y: player.y * 10 };
        const step = current ? 1 : 3.5;
        return { x: Math.max(0, Math.min(160, origin.x + movement[0] * step)), y: Math.max(0, Math.min(120, origin.y + movement[1] * step)) };
      });
    } else if ((event.key === "Enter" || event.key === " ") && aim) {
      event.preventDefault();
      shoot(aim);
    }
  };
  const beginPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!interactive || activePointer.current !== undefined) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointer.current = event.pointerId;
    setAim(point(event));
  };
  const movePointer = (event: PointerEvent<SVGSVGElement>) => {
    if (interactive && (activePointer.current === undefined || activePointer.current === event.pointerId)) setAim(point(event));
  };
  const releasePointer = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = undefined;
    shoot(point(event));
  };
  const cancelPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = undefined;
    setAim(undefined);
  };
  return <div className="arcade-golf"><svg viewBox="0 0 160 120" role="button" tabIndex={interactive ? 0 : -1}
    aria-label="Mini golf course. Arrow keys aim; Enter shoots" onKeyDown={onKeyDown}
    onClick={(event) => { if (event.detail === 0 && aim) shoot(aim); }}
    onPointerDown={beginPointer} onPointerMove={movePointer} onPointerUp={releasePointer}
    onPointerCancel={cancelPointer} onLostPointerCapture={cancelPointer}
    onPointerLeave={() => { if (activePointer.current === undefined) setAim(undefined); }}>
    <rect width="160" height="120" fill="#71ad7c" />
    <path d="M5 5H155V115H5Z" fill="none" stroke="#775d48" strokeWidth="5" />
    {state.board.map((cell, index) => cell ? <rect key={index} x={index % 16 * 10} y={Math.floor(index / 16) * 10} width="10" height="10" fill="#d0ad7d" /> : null)}
    <circle cx="140" cy="60" r="5" fill="#293d3a" />
    {state.players.map((entry, index) => <circle key={entry.userId} cx={entry.x * 10} cy={entry.y * 10} r="3.5" fill={playerColors[index % playerColors.length]} stroke="white" strokeWidth="1" />)}
    {interactive && aim && player && <line x1={player.x * 10} y1={player.y * 10} x2={aim.x} y2={aim.y} stroke="#fff" strokeDasharray="3 3" />}
  </svg><span>Tap course to putt · {player?.strokes ?? 0} strokes</span></div>;
}
