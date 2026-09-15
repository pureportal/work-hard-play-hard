import {
  FALLING_BLOCKS_DEFINITION_ID,
  FALLING_BLOCKS_GARBAGE_CELL,
  FALLING_BLOCKS_HARD_CELL,
  TETROMINO_COLOR_IDS,
  TETROMINO_SHAPES,
  TETROMINO_TYPES,
  type FallingBlocksGameState,
  type TetrominoType,
  type FallingBlocksCellPosition,
  type FallingBlocksCommand,
  type FallingBlocksMode,
  type FallingBlocksClear,
  type FallingBlocksLineCount,
  type FallingBlocksSpin,
} from "@workhard/shared";
import {
  FALLING_BLOCKS_HEIGHT as HEIGHT,
  FALLING_BLOCKS_WIDTH as WIDTH,
  FALLING_BLOCKS_SPEED_STEP_MS,
  FALLING_BLOCKS_HARD_ROW_INTERVAL_MS,
} from "./falling-blocks-rules.js";
import { rotateCells, rotationKicks, type FallingBlocksRotation } from "./falling-blocks-rotation.js";
import { FallingBlocksScoring } from "./falling-blocks-scoring.js";

interface Piece {
  type: TetrominoType;
  color: number;
  cells: number[][];
  x: number;
  y: number;
  rotation: FallingBlocksRotation;
}

const NEXT_PREVIEW_COUNT = 5;
const LOCK_DELAY_MS = 500;
const MAX_LOCK_RESETS = 15;

export class FallingBlocksGame {
  private board = Array.from({ length: HEIGHT }, () => Array<number>(WIDTH).fill(0));
  private piece: Piece | undefined;
  private readonly pieceQueue: TetrominoType[] = [];
  private readonly random: () => number;
  private heldPiece: TetrominoType | undefined;
  private holdAvailable = true;
  private accumulatedMs = 0;
  private elapsedMs = 0;
  private clears: FallingBlocksClear[] = [];
  private readonly scoring = new FallingBlocksScoring();
  private lastRotationKick: number | null = null;
  private groundedMs = 0;
  private lockResetCount = 0;
  private score = 0;
  private lines = 0;
  private running = true;
  private paused = false;
  private changed = true;

  constructor(private readonly roundId: string, private readonly mode: FallingBlocksMode = "classic") {
    this.random = createSeededRandom(roundId);
    this.spawnPiece();
  }

  update(deltaMs: number): boolean {
    if (!this.running || this.paused || !this.piece) {
      return false;
    }

    let remainingMs = deltaMs;
    let changed = false;
    while (remainingMs > 0 && this.running && this.piece) {
      const previousLevel = this.level;
      const grounded = this.isGrounded();
      const untilAction = grounded
        ? this.lockResetCount >= MAX_LOCK_RESETS ? 0 : LOCK_DELAY_MS - this.groundedMs
        : this.fallIntervalMs - this.accumulatedMs;
      const modeInterval = this.mode === "speed-up" ? FALLING_BLOCKS_SPEED_STEP_MS
        : this.mode === "sudden-death" ? FALLING_BLOCKS_HARD_ROW_INTERVAL_MS : Infinity;
      const untilModeStep = modeInterval - this.elapsedMs % modeInterval;
      const stepMs = Math.min(remainingMs, Math.max(0, untilAction), untilModeStep);
      this.elapsedMs += stepMs;
      remainingMs -= stepMs;
      if (grounded) {
        this.groundedMs += stepMs;
      } else {
        this.groundedMs = 0;
        this.accumulatedMs += stepMs;
      }

      if (this.mode === "sudden-death" && stepMs > 0 && this.elapsedMs % modeInterval === 0) {
        this.raiseRow(Array<number>(WIDTH).fill(FALLING_BLOCKS_HARD_CELL), HEIGHT);
        changed = true;
      }
      changed = this.level !== previousLevel || changed;
      if (!this.running) break;
      if ((this.groundedMs >= LOCK_DELAY_MS || this.lockResetCount >= MAX_LOCK_RESETS) && this.isGrounded()) {
        this.lockPiece();
        changed = true;
      } else if (this.accumulatedMs >= this.fallIntervalMs && !this.isGrounded()) {
        this.accumulatedMs -= this.fallIntervalMs;
        changed = this.tryMove(0, 1) || changed;
      }
    }
    this.changed = this.changed || changed;
    return changed;
  }

  command(command: FallingBlocksCommand): boolean {
    if (!this.running) {
      return false;
    }
    if (command === "pause") {
      this.paused = !this.paused;
      this.changed = true;
      return true;
    }
    if (this.paused || !this.piece) {
      return false;
    }

    let didChange = false;
    if (command === "left") {
      didChange = this.tryPlayerMove(-1);
    } else if (command === "right") {
      didChange = this.tryPlayerMove(1);
    } else if (command === "down") {
      didChange = this.tryMove(0, 1);
      if (didChange) {
        this.score += 1;
        this.groundedMs = 0;
      }
    } else if (command === "rotate" || command === "rotate-counterclockwise") {
      didChange = this.tryPlayerRotate(command === "rotate" ? 1 : -1);
    } else if (command === "drop") {
      let dropped = 0;
      while (this.tryMove(0, 1)) {
        dropped += 1;
      }
      this.score += dropped * 2;
      this.lockPiece();
      didChange = true;
    } else if (command === "hold") {
      didChange = this.tryHold();
    }

    if (didChange) {
      this.changed = true;
    }
    return didChange;
  }

  get state(): FallingBlocksGameState {
    const grid = this.board.map((row) => [...row]);
    const activeCells = this.piece ? this.cellPositions(this.piece) : [];
    if (this.piece) {
      for (const { row, column } of activeCells) {
        if (row >= 0 && row < HEIGHT && column >= 0 && column < WIDTH) {
          grid[row]![column] = this.piece.color;
        }
      }
    }
    return {
      type: "game.state",
      roundId: this.roundId,
      definitionId: FALLING_BLOCKS_DEFINITION_ID,
      grid,
      score: this.score,
      lines: this.lines,
      level: this.level,
      fallIntervalMs: this.fallIntervalMs,
      running: this.running,
      paused: this.paused,
      activePiece: this.piece?.type ?? null,
      activeCells: activeCells.filter(({ row }) => row >= 0 && row < HEIGHT),
      ghostCells: this.piece
        ? this.cellPositions(this.getGhostPiece(this.piece)).filter(({ row }) => row >= 0 && row < HEIGHT)
        : [],
      heldPiece: this.heldPiece ?? null,
      nextPieces: this.pieceQueue.slice(0, NEXT_PREVIEW_COUNT),
      canHold: this.holdAvailable && this.running,
      specials: { ...this.scoring.specials },
      lastClear: this.scoring.lastClear ? { ...this.scoring.lastClear } : null,
    };
  }

  get completed(): boolean {
    return !this.running;
  }

  get result() {
    return { score: this.score, lines: this.lines, level: this.level, fallingBlocks: { ...this.scoring.specials } };
  }

  end(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.paused = false;
    this.changed = true;
  }

  consumeChanged(): boolean {
    const wasChanged = this.changed;
    this.changed = false;
    return wasChanged;
  }

  consumeClears(): FallingBlocksClear[] {
    const clears = this.clears;
    this.clears = [];
    return clears;
  }

  get stoneCount(): number {
    return this.board.reduce((count, row) => count + row.filter((cell) => cell !== 0).length, 0);
  }

  addGarbageRows(count: number, holeColumn: number): void {
    const hardRows = this.board.filter((row) => row.every((cell) => cell === FALLING_BLOCKS_HARD_CELL)).length;
    for (let index = 0; index < count && this.running; index += 1) {
      const row = Array.from({ length: WIDTH }, (_, column) => column === holeColumn ? 0 : FALLING_BLOCKS_GARBAGE_CELL);
      this.raiseRow(row, HEIGHT - hardRows);
    }
  }

  private get level(): number {
    const timeLevels = this.mode === "speed-up" ? Math.floor(this.elapsedMs / FALLING_BLOCKS_SPEED_STEP_MS) : 0;
    return Math.floor(this.lines / 8) + timeLevels + 1;
  }

  private get fallIntervalMs(): number {
    return Math.max(140, 720 - this.level * 55);
  }

  private raiseRow(row: number[], insertionRow: number): void {
    const overflow = this.board[0]!.some((cell) => cell !== 0);
    this.board = [...this.board.slice(1, insertionRow), row, ...this.board.slice(insertionRow)];
    this.lastRotationKick = null;
    this.changed = true;
    if (this.piece) {
      while (this.collides(this.piece)) {
        this.piece = { ...this.piece, y: this.piece.y - 1 };
      }
    }
    if (overflow || (this.piece && this.cellPositions(this.piece).some(({ row: cellRow }) => cellRow < 0))) {
      this.end();
      this.piece = undefined;
    }
  }

  private spawnPiece(type = this.takeNextPiece()): void {
    const definition = TETROMINO_SHAPES[type];
    const piece: Piece = {
      type,
      color: TETROMINO_COLOR_IDS[type],
      cells: definition.map((row) => [...row]),
      x: Math.floor((WIDTH - definition[0]!.length) / 2),
      y: type === "I" ? -1 : 0,
      rotation: 0,
    };
    this.accumulatedMs = 0;
    this.groundedMs = 0;
    this.lockResetCount = 0;
    this.lastRotationKick = null;
    if (this.collides(piece)) {
      this.running = false;
      this.piece = undefined;
      return;
    }
    this.piece = piece;
  }

  private takeNextPiece(): TetrominoType {
    this.fillPieceQueue(NEXT_PREVIEW_COUNT + 1);
    const type = this.pieceQueue.shift()!;
    this.fillPieceQueue(NEXT_PREVIEW_COUNT);
    return type;
  }

  private fillPieceQueue(minimumLength: number): void {
    while (this.pieceQueue.length < minimumLength) {
      const bag = [...TETROMINO_TYPES];
      for (let index = bag.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(this.random() * (index + 1));
        [bag[index], bag[swapIndex]] = [bag[swapIndex]!, bag[index]!];
      }
      this.pieceQueue.push(...bag);
    }
  }

  private tryHold(): boolean {
    if (!this.piece || !this.holdAvailable) {
      return false;
    }
    const outgoingType = this.piece.type;
    const incomingType = this.heldPiece;
    this.heldPiece = outgoingType;
    this.holdAvailable = false;
    if (incomingType) {
      this.spawnPiece(incomingType);
    } else {
      this.spawnPiece();
    }
    return true;
  }

  private tryPlayerMove(deltaX: number): boolean {
    const wasGrounded = this.isGrounded();
    const moved = this.tryMove(deltaX, 0);
    if (moved) {
      this.resetLockDelay(wasGrounded);
    }
    return moved;
  }

  private tryMove(deltaX: number, deltaY: number): boolean {
    if (!this.piece) {
      return false;
    }
    const moved = { ...this.piece, x: this.piece.x + deltaX, y: this.piece.y + deltaY };
    if (this.collides(moved)) {
      return false;
    }
    this.piece = moved;
    this.lastRotationKick = null;
    return true;
  }

  private tryPlayerRotate(direction: 1 | -1): boolean {
    if (!this.piece || this.piece.type === "O") {
      return false;
    }
    const wasGrounded = this.isGrounded();
    const rotation = (this.piece.rotation + direction + 4) % 4 as FallingBlocksRotation;
    const rotatedCells = rotateCells(this.piece.cells, direction);
    const kicks = rotationKicks(this.piece.type, this.piece.rotation, rotation);
    for (const [index, [offsetX, offsetY]] of kicks.entries()) {
      const rotated = { ...this.piece, cells: rotatedCells, rotation, x: this.piece.x + offsetX, y: this.piece.y + offsetY };
      if (!this.collides(rotated)) {
        this.piece = rotated;
        this.lastRotationKick = index;
        this.resetLockDelay(wasGrounded);
        return true;
      }
    }
    return false;
  }

  private resetLockDelay(wasGrounded: boolean): void {
    if (!wasGrounded || this.lockResetCount >= MAX_LOCK_RESETS) {
      return;
    }
    this.groundedMs = 0;
    this.lockResetCount += 1;
  }

  private isGrounded(): boolean {
    return Boolean(this.piece && this.collides({ ...this.piece, y: this.piece.y + 1 }));
  }

  private collides(piece: Piece): boolean {
    return piece.cells.some((row, rowIndex) =>
      row.some((value, columnIndex) => {
        if (!value) {
          return false;
        }
        const x = piece.x + columnIndex;
        const y = piece.y + rowIndex;
        return x < 0 || x >= WIDTH || y >= HEIGHT || (y >= 0 && this.board[y]?.[x] !== 0);
      }),
    );
  }

  private getGhostPiece(piece: Piece): Piece {
    let ghost = { ...piece };
    while (!this.collides({ ...ghost, y: ghost.y + 1 })) {
      ghost = { ...ghost, y: ghost.y + 1 };
    }
    return ghost;
  }

  private cellPositions(piece: Piece): FallingBlocksCellPosition[] {
    const positions: FallingBlocksCellPosition[] = [];
    piece.cells.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        if (value) {
          positions.push({ row: piece.y + rowIndex, column: piece.x + columnIndex });
        }
      });
    });
    return positions;
  }

  private lockPiece(): void {
    if (!this.piece) {
      return;
    }
    const positions = this.cellPositions(this.piece);
    if (positions.some(({ row }) => row < 0)) {
      this.end();
      this.piece = undefined;
      return;
    }
    const spin = this.detectSpin();
    const scoringLevel = this.level;
    for (const { row, column } of positions) {
      if (row >= 0 && row < HEIGHT && column >= 0 && column < WIDTH) {
        this.board[row]![column] = this.piece.color;
      }
    }

    const remainingRows = this.board.filter((row) => row.some((value) => value === 0 || value === FALLING_BLOCKS_HARD_CELL));
    const cleared = (HEIGHT - remainingRows.length) as FallingBlocksLineCount;
    if (cleared > 0) {
      this.board = [
        ...Array.from({ length: cleared }, () => Array<number>(WIDTH).fill(0)),
        ...remainingRows,
      ];
      this.lines += cleared;
    }
    const perfectClear = cleared > 0 && this.board.every((row) => row.every((cell) => cell === 0));
    const clear = this.scoring.lock(cleared, spin, perfectClear, scoringLevel);
    this.score += clear.points;
    if (cleared > 0 || spin !== "none") this.clears.push(clear);
    this.holdAvailable = true;
    this.spawnPiece();
  }

  private detectSpin(): FallingBlocksSpin {
    if (!this.piece || this.piece.type !== "T" || this.lastRotationKick === null) return "none";
    const { x, y, rotation } = this.piece;
    const offsets = [[0, 0], [2, 0], [2, 2], [0, 2]] as const;
    const corners = offsets.map(([offsetX, offsetY]) => {
      const column = x + offsetX;
      const row = y + offsetY;
      return column < 0 || column >= WIDTH || row >= HEIGHT || (row >= 0 && this.board[row]![column] !== 0);
    });
    if (corners.filter(Boolean).length < 3) return "none";
    return (corners[rotation] && corners[(rotation + 1) % 4]) || this.lastRotationKick === 4 ? "full" : "mini";
  }
}

function createSeededRandom(seed: string): () => number {
  let state = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    state = Math.imul(state ^ seed.charCodeAt(index), 16_777_619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}
