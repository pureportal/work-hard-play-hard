import type { GameState } from "@workhard/shared";

type GameCommand = "left" | "right" | "rotate" | "down" | "drop" | "pause";

interface Piece {
  color: number;
  cells: number[][];
  x: number;
  y: number;
}

const WIDTH = 10;
const HEIGHT = 20;
const pieceDefinitions: number[][][] = [
  [[1, 1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
  [[1, 1, 0], [0, 1, 1]],
];

export class FallingBlocksGame {
  private board = Array.from({ length: HEIGHT }, () => Array<number>(WIDTH).fill(0));
  private piece: Piece | undefined;
  private pieceIndex = 0;
  private accumulatedMs = 0;
  private score = 0;
  private lines = 0;
  private running = true;
  private paused = false;
  private changed = true;

  constructor() {
    this.spawnPiece();
  }

  update(deltaMs: number): boolean {
    if (!this.running || this.paused) {
      return false;
    }
    this.accumulatedMs += deltaMs;
    const fallInterval = Math.max(140, 720 - this.level * 55);
    if (this.accumulatedMs < fallInterval) {
      return false;
    }
    this.accumulatedMs %= fallInterval;
    if (!this.tryMove(0, 1)) {
      this.lockPiece();
    }
    this.changed = true;
    return true;
  }

  command(command: GameCommand): boolean {
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

    if (command === "left") {
      this.tryMove(-1, 0);
    } else if (command === "right") {
      this.tryMove(1, 0);
    } else if (command === "down") {
      if (this.tryMove(0, 1)) {
        this.score += 1;
      } else {
        this.lockPiece();
      }
    } else if (command === "rotate") {
      this.tryRotate();
    } else if (command === "drop") {
      let dropped = 0;
      while (this.tryMove(0, 1)) {
        dropped += 1;
      }
      this.score += dropped * 2;
      this.lockPiece();
    }

    this.changed = true;
    return true;
  }

  get state(): GameState {
    const grid = this.board.map((row) => [...row]);
    if (this.piece) {
      this.piece.cells.forEach((row, rowIndex) => {
        row.forEach((value, columnIndex) => {
          const boardY = this.piece ? this.piece.y + rowIndex : 0;
          const boardX = this.piece ? this.piece.x + columnIndex : 0;
          if (value && boardY >= 0 && boardY < HEIGHT && boardX >= 0 && boardX < WIDTH) {
            grid[boardY]![boardX] = this.piece?.color ?? 0;
          }
        });
      });
    }
    return {
      type: "game.state",
      definitionId: "game-stack",
      grid,
      score: this.score,
      lines: this.lines,
      level: this.level,
      running: this.running,
      paused: this.paused,
    };
  }

  get completed(): boolean {
    return !this.running;
  }

  get result(): { score: number; lines: number } {
    return { score: this.score, lines: this.lines };
  }

  consumeChanged(): boolean {
    const wasChanged = this.changed;
    this.changed = false;
    return wasChanged;
  }

  private get level(): number {
    return Math.floor(this.lines / 8) + 1;
  }

  private spawnPiece(): void {
    const definition = pieceDefinitions[this.pieceIndex % pieceDefinitions.length];
    if (!definition) {
      return;
    }
    this.pieceIndex += 1;
    const piece: Piece = {
      color: ((this.pieceIndex - 1) % pieceDefinitions.length) + 1,
      cells: definition.map((row) => [...row]),
      x: Math.floor((WIDTH - definition[0]!.length) / 2),
      y: 0,
    };
    if (this.collides(piece)) {
      this.running = false;
      this.piece = undefined;
      return;
    }
    this.piece = piece;
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

  private tryRotate(): void {
    if (!this.piece || this.piece.cells.length === 1 && this.piece.cells[0]?.length === 1) {
      return;
    }
    const rotatedCells = this.piece.cells[0]?.map((_, columnIndex) =>
      this.piece?.cells.map((row) => row[columnIndex] ?? 0).reverse() ?? [],
    ) ?? [];
    const offsets = [0, -1, 1, -2, 2];
    for (const offset of offsets) {
      const rotated = { ...this.piece, cells: rotatedCells, x: this.piece.x + offset };
      if (!this.collides(rotated)) {
        this.piece = rotated;
        return;
      }
    }
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

  private lockPiece(): void {
    if (!this.piece) {
      return;
    }
    this.piece.cells.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        if (!value || !this.piece) {
          return;
        }
        const y = this.piece.y + rowIndex;
        const x = this.piece.x + columnIndex;
        if (y >= 0 && y < HEIGHT && x >= 0 && x < WIDTH) {
          this.board[y]![x] = this.piece.color;
        }
      });
    });

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
    this.spawnPiece();
  }
}
