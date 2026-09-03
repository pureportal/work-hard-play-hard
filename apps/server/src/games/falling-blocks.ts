import {
  TETRIS_DEFINITION_ID,
  TETROMINO_COLOR_IDS,
  TETROMINO_SHAPES,
  TETROMINO_TYPES,
  type GameState,
  type TetrominoType,
  type TetrisCellPosition,
  type TetrisCommand,
} from "@workhard/shared";

interface Piece {
  type: TetrominoType;
  color: number;
  cells: number[][];
  x: number;
  y: number;
}

const WIDTH = 10;
const HEIGHT = 20;
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
  private groundedMs = 0;
  private lockResetCount = 0;
  private score = 0;
  private lines = 0;
  private running = true;
  private paused = false;
  private changed = true;

  constructor(private readonly roundId: string) {
    this.random = createSeededRandom(roundId);
    this.spawnPiece();
  }

  update(deltaMs: number): boolean {
    if (!this.running || this.paused || !this.piece) {
      return false;
    }

    if (this.isGrounded()) {
      this.groundedMs += deltaMs;
      if (this.groundedMs >= LOCK_DELAY_MS) {
        this.lockPiece();
        this.changed = true;
        return true;
      }
      return false;
    }

    this.groundedMs = 0;
    this.accumulatedMs += deltaMs;
    const fallInterval = Math.max(140, 720 - this.level * 55);
    let moved = false;
    while (this.accumulatedMs >= fallInterval && this.piece && !this.isGrounded()) {
      this.accumulatedMs -= fallInterval;
      moved = this.tryMove(0, 1) || moved;
    }
    if (moved) {
      this.changed = true;
    }
    return moved;
  }

  command(command: TetrisCommand): boolean {
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
    } else if (command === "rotate") {
      didChange = this.tryPlayerRotate();
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

  get state(): GameState {
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
      definitionId: TETRIS_DEFINITION_ID,
      grid,
      score: this.score,
      lines: this.lines,
      level: this.level,
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
    };
  }

  get completed(): boolean {
    return !this.running;
  }

  get result(): { score: number; lines: number; level: number } {
    return { score: this.score, lines: this.lines, level: this.level };
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

  private get level(): number {
    return Math.floor(this.lines / 8) + 1;
  }

  private spawnPiece(type = this.takeNextPiece()): void {
    const definition = TETROMINO_SHAPES[type];
    const piece: Piece = {
      type,
      color: TETROMINO_COLOR_IDS[type],
      cells: definition.map((row) => [...row]),
      x: Math.floor((WIDTH - definition[0]!.length) / 2),
      y: 0,
    };
    this.accumulatedMs = 0;
    this.groundedMs = 0;
    this.lockResetCount = 0;
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
    return true;
  }

  private tryPlayerRotate(): boolean {
    if (!this.piece) {
      return false;
    }
    const wasGrounded = this.isGrounded();
    const rotatedCells = this.piece.cells[0]?.map((_, columnIndex) =>
      this.piece?.cells.map((row) => row[columnIndex] ?? 0).reverse() ?? [],
    ) ?? [];
    for (const offset of [0, -1, 1, -2, 2]) {
      const rotated = { ...this.piece, cells: rotatedCells, x: this.piece.x + offset };
      if (!this.collides(rotated)) {
        this.piece = rotated;
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

  private cellPositions(piece: Piece): TetrisCellPosition[] {
    const positions: TetrisCellPosition[] = [];
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
    for (const { row, column } of this.cellPositions(this.piece)) {
      if (row >= 0 && row < HEIGHT && column >= 0 && column < WIDTH) {
        this.board[row]![column] = this.piece.color;
      }
    }

    const remainingRows = this.board.filter((row) => row.some((value) => value === 0));
    const cleared = HEIGHT - remainingRows.length;
    if (cleared > 0) {
      this.board = [
        ...Array.from({ length: cleared }, () => Array<number>(WIDTH).fill(0)),
        ...remainingRows,
      ];
      this.lines += cleared;
      this.score += [0, 100, 300, 500, 800][cleared]! * this.level;
    }
    this.holdAvailable = true;
    this.spawnPiece();
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
