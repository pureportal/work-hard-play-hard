import { ARCADE_GAMES, type ArcadeCommand, type ArcadeDirection, type ArcadeEntity, type ArcadeGameId, type ArcadeGameState, type ArcadePlayerState } from "@workhard/shared";

const vectors: Record<ArcadeDirection, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const words = ["rocket", "lighthouse", "octopus", "bicycle", "volcano", "castle", "penguin", "sunflower", "umbrella", "spaceship", "mountain", "rainbow"];

export class ArcadeEngine {
  readonly state: ArcadeGameState;
  private elapsed = 0;
  private stepElapsed = 0;
  private spaceFrame = 0;
  private nextEntityId = 1;
  private mines = new Set<number>();
  private memoryProgress = new Map<string, number>();
  private lastMove = new Map<string, number>();
  private invulnerableUntil = new Map<string, number>();
  private guessed = new Set<string>();
  private velocities = new Map<string, { x: number; y: number }>();
  private pendingClaims: Array<{ userId: string; cell: number }> = [];
  private firstReveal = true;

  constructor(id: string, definitionId: ArcadeGameId, userIds: string[], private readonly random: () => number = Math.random) {
    const size = this.sizeFor(definitionId);
    this.state = {
      type: "game.state", definitionId, roundId: id, width: size[0], height: size[1],
      board: definitionId === "game-sketch-guess" ? [] : Array(size[0] * size[1]).fill(0), players: userIds.map((userId, index) => ({
        userId, score: 0, lives: definitionId === "game-snake-scramble" ? 1 : 3,
        x: 1 + index % 2 * (size[0] - 3), y: 1 + Math.floor(index / 2) % 2 * (size[1] - 3),
        direction: index % 2 ? "left" : "right", trail: [], strokes: 0, progress: 0, finished: false,
      })),
      entities: [], secondsLeft: this.durationFor(definitionId), stage: 1, phase: "play",
    };
    if (definitionId === "game-minefield-relay") {
      this.state.board.fill(-1);
      while (this.mines.size < 10) this.mines.add(this.pick(this.state.board.length));
    } else if (definitionId === "game-memory-sprint") {
      this.newSequence();
    } else if (definitionId === "game-territory-rush") {
      this.state.players.forEach((player, index) => this.state.board[this.cell(player.x, player.y)] = index + 1);
    } else if (definitionId === "game-sketch-guess") {
      this.newDrawing();
    } else if (definitionId === "game-bomb-arena") {
      this.buildBombBoard();
    } else if (definitionId === "game-snake-scramble") {
      this.state.players.forEach((player) => { player.trail = [this.cell(player.x, player.y), this.cell(player.x - vectors[player.direction][0], player.y)]; });
      this.spawnFood();
    } else if (definitionId === "game-mini-golf") {
      this.buildGolfCourse();
    } else if (definitionId === "game-space-defense") {
      this.state.players.forEach((player, index) => { player.x = [2, 6, 10, 14][index]!; player.y = 10; });
      this.state.stationHealth = 24;
    }
  }

  get completed(): boolean { return this.state.phase === "result" && this.state.secondsLeft === 0; }
  forceFinish(): void { this.finish(); }

  stateFor(userId: string): ArcadeGameState {
    const { definitionId, phase, prompt, sequence: _sequence, ...rest } = this.state;
    return {
      ...rest, definitionId, phase,
      ...(definitionId === "game-sketch-guess" && (this.state.currentPlayerId === userId || phase === "result") ? { prompt } : {}),
      ...(definitionId === "game-sketch-guess" && phase !== "result" ? { turnSecondsLeft: Math.max(0, 45 - Math.floor(this.stepElapsed / 1000)) } : {}),
    };
  }

  command(userId: string, command: ArcadeCommand): void {
    if (this.completed || this.state.phase === "result") throw new Error("GAME_MOVE_INVALID");
    this.validateCommand(command);
    const player = this.state.players.find((entry) => entry.userId === userId);
    if (!player || player.finished) throw new Error("GAME_MOVE_INVALID");
    switch (this.state.definitionId) {
      case "game-minefield-relay": this.reveal(player, command); break;
      case "game-memory-sprint": this.memory(player, command); break;
      case "game-territory-rush": this.claim(player, command); break;
      case "game-sketch-guess": this.sketch(player, command); break;
      case "game-bomb-arena": this.bomb(player, command); break;
      case "game-snake-scramble": this.snake(player, command); break;
      case "game-mini-golf": this.golf(player, command); break;
      case "game-space-defense": this.space(player, command); break;
    }
  }

  update(deltaMs: number): boolean {
    if (this.completed) return false;
    const before = JSON.stringify(this.state);
    const delta = Math.min(250, Math.max(0, deltaMs));
    this.elapsed += delta;
    this.stepElapsed += delta;
    this.state.secondsLeft = Math.max(0, this.durationFor(this.state.definitionId) - Math.floor(this.elapsed / 1000));
    const kind = this.state.definitionId;
    if (kind === "game-memory-sprint") this.updateMemory(delta);
    if (kind === "game-territory-rush") while (this.stepElapsed >= 200 && !this.completed) { this.stepElapsed -= 200; this.resolveClaims(); }
    if (kind === "game-sketch-guess") this.updateSketch(delta);
    if (kind === "game-bomb-arena") this.updateBombs(delta);
    if (kind === "game-snake-scramble") while (this.stepElapsed >= 320 && !this.completed) { this.stepElapsed -= 320; this.updateSnakes(); }
    if (kind === "game-mini-golf") this.updateGolf(delta);
    if (kind === "game-space-defense") while (this.stepElapsed >= 200 && !this.completed) { this.stepElapsed -= 200; this.updateSpace(); }
    if (this.state.secondsLeft === 0) this.finish();
    return JSON.stringify(this.state) !== before;
  }

  forfeit(userId: string): void {
    const player = this.state.players.find((entry) => entry.userId === userId);
    if (!player || this.completed) return;
    player.finished = true;
    player.lives = 0;
    if (this.state.definitionId === "game-sketch-guess" && this.state.currentPlayerId === userId) this.nextDrawing();
    if (this.state.players.every((entry) => entry.finished)) this.finish();
  }

  private sizeFor(id: ArcadeGameId): [number, number] {
    if (id === "game-minefield-relay" || id === "game-territory-rush") return [8, 8];
    if (id === "game-memory-sprint") return [4, 4];
    if (id === "game-bomb-arena") return [11, 9];
    if (id === "game-sketch-guess") return [100, 100];
    return [16, 12];
  }

  private durationFor(id: ArcadeGameId): number {
    return id === "game-sketch-guess" ? 45 * (this.state?.players.length ?? 2)
      : id === "game-mini-golf" ? 150 : id === "game-space-defense" ? 90 : 75;
  }

  private validateCommand(command: ArcadeCommand): void {
    if (!command || typeof command !== "object" || typeof command.kind !== "string") throw new Error("GAME_COMMAND_INVALID");
    if (command.kind === "move" || command.kind === "turn") {
      if (!Object.hasOwn(vectors, command.direction)) throw new Error("GAME_COMMAND_INVALID");
    } else if (command.kind === "reveal" || command.kind === "claim" || command.kind === "memory") {
      if (!Number.isInteger(command.cell)) throw new Error("GAME_COMMAND_INVALID");
    } else if (command.kind === "stroke") {
      if (!Array.isArray(command.points) || command.points.length > 128 || typeof command.color !== "string") throw new Error("GAME_COMMAND_INVALID");
    } else if (command.kind === "guess") {
      if (typeof command.text !== "string" || command.text.length > 40) throw new Error("GAME_COMMAND_INVALID");
    } else if (command.kind === "shot") {
      if (![command.dx, command.dy, command.power].every(Number.isFinite)) throw new Error("GAME_COMMAND_INVALID");
    } else if (command.kind !== "bomb" && command.kind !== "shoot") throw new Error("GAME_COMMAND_INVALID");
  }

  private pick(limit: number): number { return Math.floor(this.random() * limit); }
  private cell(x: number, y: number): number { return y * this.state.width + x; }
  private inside(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.state.width && y < this.state.height; }
  private adjacent(cell: number): number[] {
    const x = cell % this.state.width, y = Math.floor(cell / this.state.width);
    return Object.values(vectors).flatMap(([dx, dy]) => this.inside(x + dx, y + dy) ? [this.cell(x + dx, y + dy)] : []);
  }

  private reveal(player: ArcadePlayerState, command: ArcadeCommand): void {
    if (command.kind !== "reveal" || !Number.isInteger(command.cell) || command.cell < 0 || command.cell >= 64 || this.state.board[command.cell] !== -1) throw new Error("GAME_MOVE_INVALID");
    if (this.firstReveal && this.mines.has(command.cell)) {
      this.mines.delete(command.cell);
      const replacement = [...Array(64).keys()].find((cell) => !this.mines.has(cell) && cell !== command.cell)!;
      this.mines.add(replacement);
    }
    this.firstReveal = false;
    if (this.mines.has(command.cell)) {
      this.state.board[command.cell] = 9;
      player.lives--;
      if (player.lives <= 0) player.finished = true;
    } else {
      const queue = [command.cell];
      while (queue.length) {
        const cell = queue.shift()!;
        if (this.state.board[cell] !== -1 || this.mines.has(cell)) continue;
        const x = cell % 8, y = Math.floor(cell / 8);
        const nearby = [...this.mines].filter((mine) => Math.abs(mine % 8 - x) <= 1 && Math.abs(Math.floor(mine / 8) - y) <= 1).length;
        this.state.board[cell] = nearby;
        player.score += nearby ? 10 : 4;
        if (nearby === 0) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.inside(x + dx, y + dy)) queue.push(this.cell(x + dx, y + dy));
      }
    }
    if (this.state.board.filter((cell) => cell !== -1 && cell !== 9).length === 54 || this.state.players.every((entry) => entry.finished)) this.finish();
  }

  private newSequence(): void {
    const sequence: number[] = [];
    for (let index = 0; index < Math.min(3 + this.state.stage, 8); index++) {
      const previous = sequence[index - 1];
      const next = this.pick(previous === undefined ? 16 : 15);
      sequence.push(previous !== undefined && next >= previous ? next + 1 : next);
    }
    this.state.sequence = sequence;
    this.state.sequenceLength = this.state.sequence.length;
    this.state.previewCell = sequence[0]!;
    this.memoryProgress.clear();
    this.state.players.forEach((player) => { player.progress = 0; });
    this.state.phase = "preview";
    this.stepElapsed = 0;
  }

  private memory(player: ArcadePlayerState, command: ArcadeCommand): void {
    if (command.kind !== "memory" || this.state.phase !== "play" || !Number.isInteger(command.cell) || command.cell < 0 || command.cell >= 16) throw new Error("GAME_MOVE_INVALID");
    const progress = this.memoryProgress.get(player.userId) ?? 0;
    if (progress >= (this.state.sequence?.length ?? 0)) return;
    if (command.cell === this.state.sequence?.[progress]) {
      this.memoryProgress.set(player.userId, progress + 1);
      player.progress = progress + 1;
      player.score += 10 * this.state.stage;
      if (progress + 1 === this.state.sequence?.length) player.score += 25 * this.state.stage;
    } else {
      player.lives--;
      this.memoryProgress.set(player.userId, 0);
      player.progress = 0;
      if (!player.lives) player.finished = true;
    }
    if (this.state.players.every((entry) => entry.finished || this.memoryProgress.get(entry.userId) === this.state.sequence?.length)) {
      this.state.stage++;
      if (this.state.stage > 6 || this.state.players.every((entry) => entry.finished)) this.finish(); else this.newSequence();
    }
  }

  private updateMemory(_delta: number): void {
    if (this.state.phase === "preview" && this.stepElapsed >= 800 * (this.state.sequence?.length ?? 4)) {
      this.state.phase = "play";
      delete this.state.previewCell;
      this.stepElapsed = 0;
    } else if (this.state.phase === "preview") {
      this.state.previewCell = this.state.sequence![Math.floor(this.stepElapsed / 800)]!;
    } else if (this.state.phase === "play" && this.stepElapsed >= 16000) {
      this.state.stage++;
      if (this.state.stage > 6) this.finish(); else this.newSequence();
    }
  }

  private claim(player: ArcadePlayerState, command: ArcadeCommand): void {
    if (command.kind !== "claim" || !Number.isInteger(command.cell) || command.cell < 0 || command.cell >= 64 || this.state.board[command.cell] !== 0) throw new Error("GAME_MOVE_INVALID");
    const owner = this.state.players.indexOf(player) + 1;
    if (!this.adjacent(command.cell).some((cell) => this.state.board[cell] === owner)) throw new Error("GAME_MOVE_INVALID");
    if (!this.pendingClaims.some((claim) => claim.userId === player.userId && claim.cell === command.cell)) this.pendingClaims.push({ userId: player.userId, cell: command.cell });
  }

  private resolveClaims(): void {
    const cells = new Set(this.pendingClaims.map((claim) => claim.cell));
    for (const cell of cells) {
      if (this.state.board[cell] !== 0) continue;
      const candidates = this.pendingClaims.filter((claim) => claim.cell === cell && this.state.players.some((player) => player.userId === claim.userId && !player.finished));
      if (!candidates.length) continue;
      const claim = candidates[this.pick(candidates.length)]!;
      const player = this.state.players.find((entry) => entry.userId === claim.userId)!;
      const owner = this.state.players.indexOf(player) + 1;
      if (!this.adjacent(cell).some((neighbor) => this.state.board[neighbor] === owner)) continue;
      this.state.board[cell] = owner;
      player.score += 10;
    }
    this.pendingClaims = [];
    if (this.state.board.every(Boolean)) this.finish();
  }

  private newDrawing(): void {
    const drawer = this.state.players[(this.state.stage - 1) % this.state.players.length]!;
    this.state.currentPlayerId = drawer.userId;
    this.state.prompt = words[this.pick(words.length)]!;
    this.state.hint = `${this.state.prompt.length} letters`;
    this.state.strokes = [];
    this.state.guessedUserIds = [];
    delete this.state.message;
    this.guessed.clear();
    this.state.phase = "play";
    this.stepElapsed = 0;
  }

  private sketch(player: ArcadePlayerState, command: ArcadeCommand): void {
    if (command.kind === "stroke") {
      if (player.userId !== this.state.currentPlayerId || !/^#[0-9a-f]{6}$/i.test(command.color) || command.points.length < 4 || command.points.length > 128 || command.points.length % 2 || command.points.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) throw new Error("GAME_MOVE_INVALID");
      if ((this.state.strokes?.length ?? 0) >= 300) return;
      this.state.strokes!.push({ points: command.points, color: command.color });
    } else if (command.kind === "guess") {
      if (player.userId === this.state.currentPlayerId || this.guessed.has(player.userId)) throw new Error("GAME_MOVE_INVALID");
      const guess = command.text.trim().toLowerCase().slice(0, 40);
      if (!guess) throw new Error("GAME_MOVE_INVALID");
      if (guess === this.state.prompt) {
        this.guessed.add(player.userId);
        this.state.guessedUserIds!.push(player.userId);
        player.score += 100 + Math.max(0, 45 - Math.floor(this.stepElapsed / 1000));
        this.state.players.find((entry) => entry.userId === this.state.currentPlayerId)!.score += 50;
        this.state.message = "Correct!";
        if (this.guessed.size >= this.state.players.length - 1) this.nextDrawing();
      } else this.state.message = "Try again";
    } else throw new Error("GAME_COMMAND_INVALID");
  }

  private updateSketch(_delta: number): void {
    if (this.stepElapsed >= 45000) this.nextDrawing();
  }

  private nextDrawing(): void {
    this.state.stage++;
    while (this.state.stage <= this.state.players.length && this.state.players[this.state.stage - 1]!.finished) this.state.stage++;
    if (this.state.stage > this.state.players.length) this.finish(); else this.newDrawing();
  }

  private buildBombBoard(): void {
    const { width, height, board, players } = this.state;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const protectedCell = players.some((player) => Math.abs(player.x - x) + Math.abs(player.y - y) <= 2);
      board[this.cell(x, y)] = x === 0 || y === 0 || x === width - 1 || y === height - 1 || (x % 2 === 0 && y % 2 === 0) ? 1 : !protectedCell && this.random() < 0.34 ? 2 : 0;
    }
  }

  private bomb(player: ArcadePlayerState, command: ArcadeCommand): void {
    if (command.kind === "move") {
      if (this.elapsed - (this.lastMove.get(player.userId) ?? -250) < 170) return;
      const [dx, dy] = vectors[command.direction], x = player.x + dx, y = player.y + dy;
      if (!this.inside(x, y) || this.state.board[this.cell(x, y)] || this.state.entities.some((entity) => (entity.kind === "bomb" || entity.kind === "blast") && entity.x === x && entity.y === y)) return;
      player.x = x; player.y = y; player.direction = command.direction;
      this.lastMove.set(player.userId, this.elapsed);
    } else if (command.kind === "bomb") {
      if (this.state.entities.some((entity) => entity.kind === "bomb" && entity.ownerUserId === player.userId)) return;
      this.state.entities.push({ id: this.nextEntityId++, kind: "bomb", x: player.x, y: player.y, ownerUserId: player.userId, timer: 2100 });
    } else throw new Error("GAME_COMMAND_INVALID");
  }

  private updateBombs(delta: number): void {
    for (const entity of this.state.entities) entity.timer = (entity.timer ?? 0) - delta;
    let bomb = this.state.entities.find((entity) => entity.kind === "bomb" && (entity.timer ?? 0) <= 0);
    while (bomb) {
      this.explode(bomb);
      bomb = this.state.entities.find((entity) => entity.kind === "bomb" && (entity.timer ?? 0) <= 0);
    }
    this.state.entities = this.state.entities.filter((entity) => (entity.timer ?? 0) > 0);
    if (this.state.players.filter((player) => !player.finished).length <= (this.state.players.length === 1 ? 0 : 1)) this.finish();
  }

  private explode(bomb: ArcadeEntity): void {
    this.state.entities = this.state.entities.filter((entity) => entity.id !== bomb.id);
    const cells: Array<[number, number]> = [[bomb.x, bomb.y]];
    for (const [dx, dy] of Object.values(vectors)) for (let distance = 1; distance <= 2; distance++) {
      const x = bomb.x + dx * distance, y = bomb.y + dy * distance, cell = this.cell(x, y);
      if (!this.inside(x, y) || this.state.board[cell] === 1) break;
      cells.push([x, y]);
      if (this.state.board[cell] === 2) { this.state.board[cell] = 0; this.state.players.find((player) => player.userId === bomb.ownerUserId)!.score += 10; break; }
    }
    for (const [x, y] of cells) {
      this.state.entities.push({ id: this.nextEntityId++, kind: "blast", x, y, timer: 400 });
      for (const player of this.state.players) if (!player.finished && player.x === x && player.y === y && this.elapsed >= (this.invulnerableUntil.get(player.userId) ?? 0)) {
        player.lives--;
        if (player.lives <= 0) player.finished = true;
        else {
          const index = this.state.players.indexOf(player);
          player.x = index % 2 ? this.state.width - 2 : 1;
          player.y = Math.floor(index / 2) % 2 ? this.state.height - 2 : 1;
          this.invulnerableUntil.set(player.userId, this.elapsed + 1500);
        }
      }
      for (const other of this.state.entities.filter((entity) => entity.kind === "bomb" && entity.x === x && entity.y === y)) other.timer = 0;
    }
  }

  private snake(player: ArcadePlayerState, command: ArcadeCommand): void {
    if (command.kind !== "turn") throw new Error("GAME_COMMAND_INVALID");
    const [dx, dy] = vectors[command.direction];
    if (player.trail[1] === this.cell(player.x + dx, player.y + dy)) return;
    player.direction = command.direction;
  }

  private spawnFood(): void {
    const occupied = new Set(this.state.players.flatMap((player) => player.trail));
    const free = [...this.state.board.keys()].filter((cell) => !occupied.has(cell));
    if (!free.length) { this.finish(); return; }
    const cell = free[this.pick(free.length)]!;
    this.state.entities = [{ id: this.nextEntityId++, kind: "food", x: cell % this.state.width, y: Math.floor(cell / this.state.width) }];
  }

  private updateSnakes(): void {
    const occupied = new Set(this.state.players.flatMap((player) => player.trail.slice(0, -1)));
    const heads = new Map<number, ArcadePlayerState[]>();
    for (const player of this.state.players.filter((entry) => !entry.finished)) {
      const [dx, dy] = vectors[player.direction], x = player.x + dx, y = player.y + dy;
      if (!this.inside(x, y) || occupied.has(this.cell(x, y))) { player.finished = true; player.lives = 0; continue; }
      player.x = x; player.y = y;
      const cell = this.cell(x, y);
      heads.set(cell, [...(heads.get(cell) ?? []), player]);
    }
    for (const [cell, players] of heads) {
      if (players.length > 1) { players.forEach((player) => { player.finished = true; player.lives = 0; }); continue; }
      const player = players[0]!;
      player.trail.unshift(cell);
      const food = this.state.entities[0];
      if (food && cell === this.cell(food.x, food.y)) { player.score += 100; this.spawnFood(); }
      else player.trail.pop();
      player.score++;
    }
    if (this.state.players.filter((player) => !player.finished).length <= (this.state.players.length === 1 ? 0 : 1)) this.finish();
  }

  private buildGolfCourse(): void {
    this.state.board.fill(0);
    const wallX = 5 + (this.state.stage - 1) * 2;
    for (let y = 2; y < 10; y++) if (y !== 4 + this.state.stage) this.state.board[this.cell(wallX, y)] = 1;
    this.state.players.forEach((player) => { player.x = 1.5; player.y = 6; player.finished = player.lives <= 0; });
    this.state.entities = [{ id: this.nextEntityId++, kind: "food", x: 14, y: 6 }];
    this.velocities.clear();
  }

  private golf(player: ArcadePlayerState, command: ArcadeCommand): void {
    if (command.kind !== "shot" || !Number.isFinite(command.dx) || !Number.isFinite(command.dy) || !Number.isFinite(command.power) || command.power <= 0 || command.power > 1 || Math.hypot(command.dx, command.dy) < 0.1 || Math.hypot(command.dx, command.dy) > 1.01) throw new Error("GAME_MOVE_INVALID");
    if (this.velocities.has(player.userId)) return;
    this.velocities.set(player.userId, { x: command.dx * command.power * 9, y: command.dy * command.power * 9 });
    player.strokes++;
  }

  private updateGolf(delta: number): void {
    const steps = Math.ceil(delta / 50);
    for (let index = 0; index < steps; index++) {
      const step = delta / steps / 1000;
      for (const player of this.state.players) {
        const velocity = this.velocities.get(player.userId);
        if (!velocity || player.finished) continue;
        const nextX = player.x + velocity.x * step, nextY = player.y + velocity.y * step;
        if (nextX < 0.5 || nextX > 15.5 || this.state.board[this.cell(Math.floor(nextX), Math.floor(player.y))]) velocity.x *= -0.65; else player.x = nextX;
        if (nextY < 0.5 || nextY > 11.5 || this.state.board[this.cell(Math.floor(player.x), Math.floor(nextY))]) velocity.y *= -0.65; else player.y = nextY;
        velocity.x *= Math.max(0, 1 - step * 1.5); velocity.y *= Math.max(0, 1 - step * 1.5);
        if (Math.hypot(player.x - 14, player.y - 6) < 0.55 && Math.hypot(velocity.x, velocity.y) < 3) {
          player.score += Math.max(10, 200 - player.strokes * 25); player.finished = true; this.velocities.delete(player.userId);
        } else if (Math.hypot(velocity.x, velocity.y) < 0.12) this.velocities.delete(player.userId);
      }
    }
    if (this.state.players.every((player) => player.finished)) {
      this.state.stage++;
      if (this.state.stage > 3) this.finish(); else this.buildGolfCourse();
    }
  }

  private space(player: ArcadePlayerState, command: ArcadeCommand): void {
    if (command.kind === "move") {
      if (this.elapsed - (this.lastMove.get(player.userId) ?? -250) < 110) return;
      const [dx, dy] = vectors[command.direction];
      player.x = Math.max(0, Math.min(15, player.x + dx));
      player.y = Math.max(7, Math.min(11, player.y + dy));
      this.lastMove.set(player.userId, this.elapsed);
    } else if (command.kind === "shoot") {
      if (this.elapsed - (this.lastMove.get(`${player.userId}:shoot`) ?? -500) < 350) return;
      this.state.entities.push({ id: this.nextEntityId++, kind: "bullet", x: player.x, y: player.y - 1, ownerUserId: player.userId });
      this.lastMove.set(`${player.userId}:shoot`, this.elapsed);
    } else throw new Error("GAME_COMMAND_INVALID");
  }

  private updateSpace(): void {
    const frame = ++this.spaceFrame;
    this.state.stage = Math.min(3, 1 + Math.floor(this.elapsed / 30000));
    if (frame % (14 - this.state.stage * 2) === 0) this.state.entities.push({ id: this.nextEntityId++, kind: "enemy", x: this.pick(16), y: 0 });
    const previousY = new Map(this.state.entities.map((entity) => [entity.id, entity.y]));
    for (const entity of this.state.entities) if (entity.kind === "bullet") entity.y--;
    if (frame % (4 - this.state.stage) === 0) for (const entity of this.state.entities) if (entity.kind === "enemy") entity.y++;
    for (const bullet of this.state.entities.filter((entity) => entity.kind === "bullet")) {
      const enemy = this.state.entities.find((entity) => entity.kind === "enemy" && entity.x === bullet.x
        && (entity.y === bullet.y || previousY.get(entity.id) === bullet.y && previousY.get(bullet.id) === entity.y));
      if (!enemy) continue;
      this.state.entities = this.state.entities.filter((entity) => entity.id !== bullet.id && entity.id !== enemy.id);
      this.state.players.find((player) => player.userId === bullet.ownerUserId)!.score += 25;
    }
    for (const enemy of this.state.entities.filter((entity) => entity.kind === "enemy")) {
      const defenders = this.state.players.filter((player) => !player.finished && player.x === enemy.x && player.y === enemy.y && this.elapsed >= (this.invulnerableUntil.get(player.userId) ?? 0));
      if (!defenders.length) continue;
      this.state.entities = this.state.entities.filter((entity) => entity.id !== enemy.id);
      for (const defender of defenders) {
        defender.lives--;
        if (defender.lives === 0) defender.finished = true;
        else this.invulnerableUntil.set(defender.userId, this.elapsed + 1000);
      }
    }
    for (const enemy of this.state.entities.filter((entity) => entity.kind === "enemy" && entity.y >= 11)) {
      this.state.entities = this.state.entities.filter((entity) => entity.id !== enemy.id);
      this.state.stationHealth = Math.max(0, this.state.stationHealth! - 1);
    }
    this.state.entities = this.state.entities.filter((entity) => entity.y >= 0 && entity.y < 12);
    if (this.state.stationHealth === 0 || this.state.players.every((player) => player.finished)) this.finish();
  }

  private finish(): void {
    if (this.completed) return;
    if (this.state.definitionId === "game-memory-sprint") delete this.state.previewCell;
    if (this.state.definitionId === "game-minefield-relay") this.state.teamWon = this.state.board.filter((cell) => cell >= 0 && cell !== 9).length === 54;
    if (this.state.definitionId === "game-space-defense") this.state.teamWon = this.state.secondsLeft === 0 && this.state.stationHealth! > 0 && this.state.players.some((player) => !player.finished);
    this.state.phase = "result";
    this.state.secondsLeft = 0;
    if (this.state.definitionId === "game-bomb-arena") this.state.players.filter((player) => !player.finished).forEach((player) => { player.score += 100; });
    if (this.state.definitionId === "game-minefield-relay") for (const mine of this.mines) if (this.state.board[mine] === -1) this.state.board[mine] = 9;
    if (this.state.definitionId === "game-sketch-guess") this.state.hint = this.state.prompt ?? "";
  }
}

export function isArcadeGameId(value: string): value is ArcadeGameId { return ARCADE_GAMES.some((game) => game.id === value); }
