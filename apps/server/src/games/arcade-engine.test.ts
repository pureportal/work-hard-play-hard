import { describe, expect, it } from "vitest";
import { ARCADE_GAMES, type ArcadeGameId } from "@workhard/shared";
import { ArcadeEngine } from "./arcade-engine.js";

function random() {
  let seed = 42;
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function game(id: ArcadeGameId, players = ["a", "b"]) { return new ArcadeEngine("round", id, players, random()); }
function advance(engine: ArcadeEngine, milliseconds: number) { for (let elapsed = 0; elapsed < milliseconds; elapsed += 250) engine.update(Math.min(250, milliseconds - elapsed)); }

describe("arcade games", () => {
  it("registers all eight distinct games", () => {
    expect(new Set(ARCADE_GAMES.map((entry) => entry.id)).size).toBe(8);
    for (const definition of ARCADE_GAMES) expect(game(definition.id).state.definitionId).toBe(definition.id);
  });

  it("keeps the first minefield reveal safe and scores revealed clues", () => {
    const engine = game("game-minefield-relay", ["a"]);
    engine.command("a", { kind: "reveal", cell: 0 });
    expect(engine.state.board[0]).toBeGreaterThanOrEqual(0);
    expect(engine.state.players[0]!.score).toBeGreaterThan(0);
    expect(() => engine.command("a", { kind: "reveal", cell: 0 })).toThrow("GAME_MOVE_INVALID");
  });

  it("reveals one memory pad at a time and hides the sequence during input", () => {
    const engine = game("game-memory-sprint", ["a"]);
    const sequence = [...engine.state.sequence!];
    expect(sequence.every((cell, index) => index === 0 || cell !== sequence[index - 1])).toBe(true);
    expect(engine.stateFor("a").sequence).toBeUndefined();
    expect(engine.stateFor("a").previewCell).toBe(sequence[0]);
    expect(engine.update(250)).toBe(false);
    expect(engine.update(250)).toBe(false);
    expect(engine.update(250)).toBe(false);
    expect(engine.update(50)).toBe(true);
    expect(engine.stateFor("a").previewCell).toBe(sequence[1]);
    advance(engine, (sequence.length - 1) * 800);
    expect(engine.stateFor("a").sequence).toBeUndefined();
    expect(engine.stateFor("a").previewCell).toBeUndefined();
    sequence.forEach((cell) => engine.command("a", { kind: "memory", cell }));
    expect(engine.state.players[0]!.score).toBeGreaterThan(0);
    expect(engine.state.stage).toBe(2);
  });

  it("only claims adjacent neutral territory", () => {
    const engine = game("game-territory-rush", ["a"]);
    expect(() => engine.command("a", { kind: "claim", cell: 63 })).toThrow("GAME_MOVE_INVALID");
    engine.command("a", { kind: "claim", cell: 2 + 8 });
    engine.update(200);
    expect(engine.state.board[10]).toBe(1);
    expect(engine.state.players[0]!.score).toBe(10);
  });

  it("resolves competing territory claims in the same window once", () => {
    const engine = game("game-territory-rush");
    engine.state.board.fill(0);
    engine.state.board[9] = 1;
    engine.state.board[11] = 2;
    engine.command("a", { kind: "claim", cell: 10 });
    engine.command("b", { kind: "claim", cell: 10 });
    engine.update(200);
    expect([1, 2]).toContain(engine.state.board[10]);
    expect(engine.state.players.reduce((sum, player) => sum + player.score, 0)).toBe(10);
  });

  it("keeps the sketch prompt private and scores a correct guess", () => {
    const engine = game("game-sketch-guess");
    const prompt = engine.stateFor("a").prompt!;
    expect(engine.stateFor("b").prompt).toBeUndefined();
    expect(engine.stateFor("b").turnSecondsLeft).toBe(45);
    advance(engine, 2000);
    expect(engine.stateFor("b").turnSecondsLeft).toBe(43);
    engine.command("a", { kind: "stroke", points: [10, 10, 30, 30], color: "#343547" });
    expect(engine.stateFor("b").strokes).toHaveLength(1);
    engine.command("b", { kind: "guess", text: prompt.toUpperCase() });
    expect(engine.state.players[1]!.score).toBeGreaterThan(100);
    expect(engine.state.players[0]!.score).toBe(50);
  });

  it("runs solo bomb arena, resolves fuses, and rejects invalid directions", () => {
    const engine = game("game-bomb-arena", ["a"]);
    engine.update(50);
    expect(engine.completed).toBe(false);
    expect(() => engine.command("a", { kind: "move", direction: "diagonal" as "up" })).toThrow("GAME_COMMAND_INVALID");
    engine.command("a", { kind: "bomb" });
    advance(engine, 2200);
    expect(engine.state.entities.some((entity) => entity.kind === "blast")).toBe(true);
  });

  it("detonates every bomb in a chain regardless of placement order", () => {
    const engine = game("game-bomb-arena", ["a"]);
    engine.state.board.fill(0);
    engine.command("a", { kind: "bomb" });
    engine.state.entities.push({ id: 999, kind: "bomb", x: 3, y: 1, ownerUserId: "a", timer: 1 });
    engine.update(50);
    expect(engine.state.entities.filter((entity) => entity.kind === "bomb")).toHaveLength(0);
    expect(engine.state.entities.filter((entity) => entity.kind === "blast").length).toBeGreaterThan(9);
  });

  it("moves snakes on the server and ends on a wall collision", () => {
    const engine = game("game-snake-scramble", ["a"]);
    engine.command("a", { kind: "turn", direction: "up" });
    advance(engine, 700);
    expect(engine.completed).toBe(true);
    expect(engine.state.players[0]!.lives).toBe(0);
  });

  it("does not reverse a snake through two turns before a tick", () => {
    const engine = game("game-snake-scramble", ["a"]);
    engine.command("a", { kind: "turn", direction: "up" });
    engine.command("a", { kind: "turn", direction: "left" });
    expect(engine.state.players[0]!.direction).toBe("up");
    advance(engine, 320);
    expect(engine.state.players[0]!.finished).toBe(false);
    expect(engine.state.players[0]!.y).toBe(0);
  });

  it("simulates a golf putt and counts strokes", () => {
    const engine = game("game-mini-golf", ["a"]);
    engine.command("a", { kind: "shot", dx: 1, dy: 0, power: 0.5 });
    advance(engine, 250);
    expect(engine.state.players[0]!.x).toBeGreaterThan(1.5);
    expect(engine.state.players[0]!.strokes).toBe(1);
  });

  it("keeps a fast golf ball on its side of a solid wall", () => {
    const engine = game("game-mini-golf", ["a"]);
    engine.command("a", { kind: "shot", dx: 1, dy: 0, power: 1 });
    advance(engine, 1000);
    expect(engine.state.players[0]!.x).toBeLessThan(5);
  });

  it("fires projectiles and spawns enemies in space defense", () => {
    const engine = game("game-space-defense", ["a"]);
    expect(engine.state.players[0]!.y).toBe(10);
    engine.command("a", { kind: "shoot" });
    expect(engine.state.entities.some((entity) => entity.kind === "bullet")).toBe(true);
    advance(engine, 2400);
    expect(engine.state.entities.some((entity) => entity.kind === "enemy")).toBe(true);
  });

  it("starts defenders apart and loses station health when an enemy reaches the base", () => {
    const engine = game("game-space-defense", ["a", "b", "c", "d"]);
    expect(new Set(engine.state.players.map((player) => `${player.x},${player.y}`)).size).toBe(4);
    engine.state.entities.push({ id: 999, kind: "enemy", x: 0, y: 11 });
    advance(engine, 200);
    expect(engine.state.stationHealth).toBe(23);
    expect(engine.state.entities.some((entity) => entity.id === 999)).toBe(false);
  });

  it("lets a defender intercept an enemy before it reaches the station", () => {
    const engine = game("game-space-defense", ["a"]);
    const defender = engine.state.players[0]!;
    engine.state.entities.push({ id: 999, kind: "enemy", x: defender.x, y: defender.y });
    advance(engine, 200);
    expect(defender.lives).toBe(2);
    expect(engine.state.stationHealth).toBe(24);
    expect(engine.state.entities.some((entity) => entity.id === 999)).toBe(false);
  });

  it("marks a defended station as a team success after the final wave", () => {
    const engine = game("game-space-defense", ["a", "b"]);
    for (let tick = 0; tick < 450; tick++) {
      engine.state.entities = [];
      engine.update(200);
    }
    expect(engine.completed).toBe(true);
    expect(engine.state.teamWon).toBe(true);
    expect(engine.state.stationHealth).toBe(24);
  });

  it("advances golf holes when the ball reaches the cup", () => {
    const engine = game("game-mini-golf", ["a"]);
    for (let hole = 1; hole <= 3; hole++) {
      const player = engine.state.players[0]!;
      player.x = 13.5;
      player.y = 6;
      engine.command("a", { kind: "shot", dx: 1, dy: 0, power: 0.25 });
      advance(engine, 1000);
      expect(engine.state.stage).toBe(hole + 1);
    }
    expect(engine.completed).toBe(true);
    expect(engine.state.players[0]!.score).toBeGreaterThan(0);
  });

  it("finishes timed rounds and discloses mines only at the end", () => {
    const engine = game("game-minefield-relay", ["a"]);
    expect(engine.stateFor("a").board).not.toContain(9);
    advance(engine, 75000);
    expect(engine.completed).toBe(true);
    expect(engine.stateFor("a").board.filter((cell) => cell === 9)).toHaveLength(10);
  });
});
