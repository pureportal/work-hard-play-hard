import type { CharacterDirection, CharacterMotion, Position, Rect } from "@workhard/shared";
import { canTracePreview, findPreviewPath } from "./auth-preview-navigation";

interface PreviewActivity {
  id: string;
  position: Position;
  direction: CharacterDirection;
  motion: Extract<CharacterMotion, "idle" | "sit" | "listen">;
  duration: readonly [number, number];
  seatOffsetY?: number;
}

export const previewActivities: readonly PreviewActivity[] = [
  { id: "bench", position: { x: 317, y: 288 }, direction: "down", motion: "sit", duration: [7000, 9000], seatOffsetY: -30 },
  { id: "chess", position: { x: 215, y: 311 }, direction: "left", motion: "idle", duration: [6200, 8100] },
  { id: "sofa", position: { x: 337, y: 166 }, direction: "down", motion: "sit", duration: [6400, 8300], seatOffsetY: -30 },
  { id: "coffee", position: { x: 433, y: 157 }, direction: "up", motion: "idle", duration: [4600, 6500] },
  { id: "arcade", position: { x: 108, y: 340 }, direction: "left", motion: "idle", duration: [5500, 7800] },
  { id: "pond", position: { x: 441, y: 340 }, direction: "left", motion: "idle", duration: [5100, 7100] },
  { id: "desk", position: { x: 153, y: 149 }, direction: "left", motion: "idle", duration: [5000, 7200] },
];

const firstActivities = ["bench", "chess", "sofa", "coffee"] as const;
const followUps: Record<string, string> = {
  bench: "chess",
  chess: "coffee",
  sofa: "pond",
  coffee: "desk",
  arcade: "sofa",
  pond: "bench",
  desk: "arcade",
};

export class PreviewActor {
  readonly position: Position;
  direction: CharacterDirection = "down";
  motion: CharacterMotion = "idle";
  activity: PreviewActivity | undefined;
  seatOffsetY = 0;

  private path: Position[] = [];
  private remainingMs: number;
  private lastActivityId?: string;

  constructor(
    readonly index: number,
    position: Position,
    private readonly obstacles: readonly Rect[],
    private readonly random: () => number = Math.random,
  ) {
    this.position = { ...position };
    this.remainingMs = index * 650;
  }

  advance(deltaMs: number, reserved: ReadonlySet<string>): void {
    if (!this.activity) {
      this.remainingMs -= deltaMs;
      if (this.remainingMs <= 0) this.chooseActivity(reserved);
      return;
    }

    if (this.path.length > 0) {
      this.walk(Math.min(deltaMs, 50));
      return;
    }

    this.remainingMs -= deltaMs;
    if (this.remainingMs > 0) return;
    this.lastActivityId = this.activity.id;
    this.activity = undefined;
    this.motion = "idle";
    this.seatOffsetY = 0;
    this.remainingMs = 350 + this.random() * 550;
  }

  private chooseActivity(reserved: ReadonlySet<string>): void {
    const available = previewActivities.filter((activity) => activity.id !== this.lastActivityId && !reserved.has(activity.id));
    const preferred = this.lastActivityId
      ? this.random() < 0.6 ? followUps[this.lastActivityId] : undefined
      : firstActivities[this.index];
    const candidates = available.map((activity) => ({ activity, order: this.random() }));
    candidates.sort((left, right) =>
      Number(right.activity.id === preferred) - Number(left.activity.id === preferred) || left.order - right.order);

    for (const { activity } of candidates) {
      const path = findPreviewPath(this.position, activity.position, this.obstacles);
      if (path.length === 0) continue;
      this.activity = activity;
      this.path = path;
      this.motion = "walk";
      this.remainingMs = activity.duration[0] + this.random() * (activity.duration[1] - activity.duration[0]);
      return;
    }
    this.remainingMs = 1000;
  }

  private walk(deltaMs: number): void {
    const target = this.path[0]!;
    const dx = target.x - this.position.x;
    const dy = target.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.01) {
      this.path.shift();
      return;
    }

    const step = Math.min(distance, deltaMs * (0.065 + this.index * 0.005));
    const next = { x: this.position.x + dx / distance * step, y: this.position.y + dy / distance * step };
    if (!canTracePreview(this.position, next, this.obstacles)) {
      this.path = [];
      this.activity = undefined;
      this.motion = "idle";
      this.remainingMs = 1000;
      return;
    }
    this.position.x = next.x;
    this.position.y = next.y;
    this.direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up";
    if (distance <= step + 0.01) this.path.shift();
    if (this.path.length === 0) {
      this.direction = this.activity!.direction;
      this.motion = this.activity!.motion;
      this.seatOffsetY = this.activity!.seatOffsetY ?? 0;
    }
  }
}
