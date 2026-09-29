import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ARCADE_GAMES, type ArcadeGameState, type GameLobbyState } from "@workhard/shared";
import { ArcadeGame } from "./ArcadeGame";
import { ArcadeLobby } from "./ArcadeLobby";

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function state(definitionId: ArcadeGameState["definitionId"]): ArcadeGameState {
  const width = definitionId === "game-memory-sprint" ? 4 : 8;
  return {
    type: "game.state", definitionId, roundId: "round", width, height: width, board: Array(width * width).fill(definitionId === "game-minefield-relay" ? -1 : 0),
    players: [{ userId: "maya", score: 0, lives: 3, x: 1, y: 1, direction: "right", trail: [], strokes: 0, progress: 0, finished: false }],
    entities: [], secondsLeft: 75, stage: 1, phase: "play",
  };
}

describe("new arcade games", () => {
  it.each(ARCADE_GAMES.filter((game) => game.id !== "game-sketch-guess"))("starts $name solo", ({ id }) => {
    const start = vi.fn();
    const lobby: GameLobbyState = { definitionId: id, objectId: "table", floorId: "floor", participantIds: ["maya"], capacity: 4 };
    render(<ArcadeLobby lobby={lobby} members={[]} currentUserId="maya" pending={false} onStart={start} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(start).toHaveBeenCalledWith(true);
  });

  it("requires a second player for Sketch & Guess", () => {
    const start = vi.fn();
    const lobby: GameLobbyState = { definitionId: "game-sketch-guess", objectId: "table", floorId: "floor", participantIds: ["maya"], capacity: 4 };
    render(<ArcadeLobby lobby={lobby} members={[]} currentUserId="maya" pending={false} onStart={start} />);
    expect(screen.getByRole("button", { name: "Waiting for player" })).toHaveProperty("disabled", true);
  });

  it("reveals a minefield tile and leaves revealed tiles disabled", () => {
    const command = vi.fn();
    const game = state("game-minefield-relay");
    game.board[1] = 2;
    render(<ArcadeGame state={game} members={[]} currentUserId="maya" onCommand={command} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Reveal row 1, column 1" }));
    expect(command).toHaveBeenCalledWith({ kind: "reveal", cell: 0 });
    expect(screen.getByRole("button", { name: "Reveal row 1, column 2" })).toHaveProperty("disabled", true);
  });

  it("highlights the preview pad without exposing the sequence", () => {
    const game = state("game-memory-sprint");
    game.phase = "preview"; game.previewCell = 3; game.sequenceLength = 2;
    const { container, rerender } = render(<ArcadeGame state={game} members={[]} currentUserId="maya" onCommand={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Watch the pads")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pad 4" }).className).toContain("is-previewed");
    const inputState = { ...game };
    delete inputState.previewCell;
    rerender(<ArcadeGame state={{ ...inputState, phase: "play" }} members={[]} currentUserId="maya" onCommand={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Repeat · 0/2")).toBeTruthy();
    expect(container.querySelector(".is-previewed")).toBeNull();
  });

  it("keeps opponent territory distinct from bomb crates", () => {
    const game = state("game-territory-rush");
    game.players.push({ ...game.players[0]!, userId: "leo" });
    game.board[10] = 2;
    render(<ArcadeGame state={game} members={[]} currentUserId="maya" onCommand={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Claim row 2, column 3" }).className).toContain("is-owner-2");
    expect(screen.getByRole("button", { name: "Claim row 2, column 3" }).className).not.toContain("is-crate");
  });

  it("shows a shared defense result instead of an individual winner", () => {
    const game = state("game-space-defense");
    game.phase = "result";
    game.secondsLeft = 0;
    game.teamWon = true;
    game.stationHealth = 8;
    game.players.push({ ...game.players[0]!, userId: "leo", score: 100 });
    render(<ArcadeGame state={game} members={[]} currentUserId="maya" onCommand={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("Station saved");
  });

  it("shows the surviving Bomb Arena player as the winner", () => {
    const game = state("game-bomb-arena");
    game.phase = "result";
    game.players[0]!.score = 10;
    game.players.push({ ...game.players[0]!, userId: "leo", score: 100, lives: 0, finished: true });
    render(<ArcadeGame state={game} members={[]} currentUserId="maya" onCommand={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("You win");
  });

  it("claims only neighboring territory in the interface", () => {
    const command = vi.fn();
    const game = state("game-territory-rush");
    game.board[9] = 1;
    render(<ArcadeGame state={game} members={[]} currentUserId="maya" onCommand={command} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim row 2, column 3" }));
    expect(command).toHaveBeenCalledWith({ kind: "claim", cell: 10 });
    expect(screen.getByRole("button", { name: "Claim row 8, column 8" })).toHaveProperty("disabled", true);
  });

  it("moves focus through available tiles with arrow keys", () => {
    const game = state("game-minefield-relay");
    game.board[1] = 2;
    render(<ArcadeGame state={game} members={[]} currentUserId="maya" onCommand={vi.fn()} onClose={vi.fn()} />);
    const first = screen.getByRole("button", { name: "Reveal row 1, column 1" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reveal row 1, column 3" }));
  });

  it("aims and shoots mini golf with the keyboard", () => {
    const command = vi.fn();
    render(<ArcadeGame state={state("game-mini-golf")} members={[]} currentUserId="maya" onCommand={command} onClose={vi.fn()} />);
    const course = screen.getByRole("button", { name: /Mini golf course/ });
    course.focus();
    fireEvent.keyDown(course, { key: "ArrowRight" });
    fireEvent.keyDown(course, { key: "Enter" });
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ kind: "shot", dx: 1, dy: 0 }));
  });

  it("uses the first golf arrow as the shot direction", () => {
    const command = vi.fn();
    render(<ArcadeGame state={state("game-mini-golf")} members={[]} currentUserId="maya" onCommand={command} onClose={vi.fn()} />);
    const course = screen.getByRole("button", { name: /Mini golf course/ });
    fireEvent.keyDown(course, { key: "ArrowUp" });
    fireEvent.keyDown(course, { key: "Enter" });
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ kind: "shot", dx: 0, dy: -1 }));
  });

  it("shoots golf only from the pointer that began the putt", () => {
    const command = vi.fn();
    render(<ArcadeGame state={state("game-mini-golf")} members={[]} currentUserId="maya" onCommand={command} onClose={vi.fn()} />);
    const course = screen.getByRole("button", { name: /Mini golf course/ });
    Object.assign(course, { setPointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 160, height: 120 }) });
    fireEvent.pointerDown(course, { pointerId: 1, clientX: 70, clientY: 40 });
    fireEvent.pointerUp(course, { pointerId: 2, clientX: 70, clientY: 40 });
    expect(command).not.toHaveBeenCalled();
    fireEvent.pointerUp(course, { pointerId: 1, clientX: 70, clientY: 40 });
    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ kind: "shot" }));
  });

  it("ignores stray touches and canceled drawing strokes", () => {
    const command = vi.fn();
    const game = state("game-sketch-guess");
    game.currentPlayerId = "maya";
    game.prompt = "rocket";
    render(<ArcadeGame state={game} members={[]} currentUserId="maya" onCommand={command} onClose={vi.fn()} />);
    const canvas = screen.getByRole("img", { name: "Drawing canvas" });
    Object.assign(canvas, { setPointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 90, clientY: 90 });
    fireEvent.pointerCancel(canvas, { pointerId: 1 });
    expect(command).not.toHaveBeenCalled();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 30, clientY: 30 });
    expect(command).toHaveBeenCalledWith({ kind: "stroke", points: [10, 10, 30, 30], color: "#343547" });
  });

  it("keeps long sketch strokes connected and lets the drawer make a dot", () => {
    const command = vi.fn();
    const game = state("game-sketch-guess");
    game.currentPlayerId = "maya";
    game.prompt = "rocket";
    render(<ArcadeGame state={game} members={[]} currentUserId="maya" onCommand={command} onClose={vi.fn()} />);
    const canvas = screen.getByRole("img", { name: "Drawing canvas" });
    Object.assign(canvas, { setPointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0, clientY: 0 });
    for (let index = 1; index <= 90; index++) fireEvent.pointerMove(canvas, { pointerId: 1, clientX: index, clientY: index });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 90, clientY: 90 });
    const stroke = command.mock.calls[0]![0] as { points: number[] };
    expect(stroke.points.length).toBeLessThanOrEqual(128);
    expect(stroke.points.slice(0, 2)).toEqual([0, 0]);
    expect(stroke.points.slice(-2)).toEqual([90, 90]);
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 20, clientY: 20 });
    expect(command.mock.calls[1]![0]).toMatchObject({ kind: "stroke", points: [20, 20, 20, 20] });
  });

  it("repeats a held touch direction and stops on release", () => {
    vi.useFakeTimers();
    try {
      const command = vi.fn();
      render(<ArcadeGame state={state("game-bomb-arena")} members={[]} currentUserId="maya" onCommand={command} onClose={vi.fn()} />);
      const right = screen.getByRole("button", { name: "right" });
      Object.assign(right, { setPointerCapture: vi.fn() });
      fireEvent.pointerDown(right, { pointerId: 1 });
      vi.advanceTimersByTime(360);
      fireEvent.pointerUp(right, { pointerId: 1 });
      vi.advanceTimersByTime(400);
      expect(command).toHaveBeenCalledTimes(3);
      expect(command).toHaveBeenCalledWith({ kind: "move", direction: "right" });
    } finally { vi.useRealTimers(); }
  });

  it("leaves Space to a focused control button", () => {
    const command = vi.fn();
    render(<ArcadeGame state={state("game-bomb-arena")} members={[]} currentUserId="maya" onCommand={command} onClose={vi.fn()} />);
    const close = screen.getByRole("button", { name: "Close game" });
    close.focus();
    fireEvent.keyDown(close, { key: " ", code: "Space" });
    expect(command).not.toHaveBeenCalled();
  });
});
