import { LocateFixed, Minus, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import { getAreaBoundaryWalls, getAreaDoorRect, isEnclosedArea } from "@workhard/shared";
import type {
  Area,
  Floor,
  FloorLayout,
  LayoutTool,
  Meeting,
  Member,
  WorldObject,
  WorldPlayer,
} from "@workhard/shared";
import { REACTION_EMOJI, type DisplayHighFive, type DisplayReaction } from "../reactions";
import { IconButton } from "./IconButton";

interface WorldCanvasProps {
  floor: Floor;
  layout: FloorLayout;
  members: Member[];
  meetings: Meeting[];
  players: WorldPlayer[];
  reactions: DisplayReaction[];
  highFives: DisplayHighFive[];
  currentUserId: string;
  editingTool: LayoutTool | null;
  editing: boolean;
  inputEnabled: boolean;
  focusTarget?: { userId: string; requestId: string } | undefined;
  onDestination: (x: number, y: number) => void;
  onPlayerApproach: (userId: string) => void;
  onEdit: (x: number, y: number) => void;
  onAreaSelect: (area: Area, x: number, y: number) => void;
  onObjectSelect: (object: WorldObject) => void;
  onDirectionalInput: (sequence: number, dx: number, dy: number) => void;
}

interface RendererCallbacks {
  onDestination: WorldCanvasProps["onDestination"];
  onPlayerApproach: WorldCanvasProps["onPlayerApproach"];
  onEdit: WorldCanvasProps["onEdit"];
  onAreaSelect: WorldCanvasProps["onAreaSelect"];
  onObjectSelect: WorldCanvasProps["onObjectSelect"];
}

interface PlayerView {
  container: Container;
  status: Graphics;
  wave: Graphics;
  reactionBubble: Container;
  reactionText: Text;
  reactionId?: string;
  reactionStartedAt: number;
  reactionUntil: number;
  targetX: number;
  targetY: number;
  wavingUntil: number;
}

interface HighFiveView {
  container: Container;
  ring: Graphics;
  userIds: [string, string];
  startedAt: number;
  expiresAt: number;
}

interface PixiLifecycle {
  app: Application;
  initialization: Promise<void>;
  renderer?: OfficeRenderer;
  cleanupTimer?: number;
  active: boolean;
  initialized: boolean;
  destroyed: boolean;
}

const statusColors: Record<Member["availability"], string> = {
  available: "#37b879",
  busy: "#f2ad3b",
  dnd: "#e85f5f",
  away: "#9aa2ad",
};

export function WorldCanvas(props: WorldCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<OfficeRenderer | undefined>(undefined);
  const lifecycleRef = useRef<PixiLifecycle | undefined>(undefined);
  const propsRef = useRef(props);
  const callbacksRef = useRef<RendererCallbacks>({
    onDestination: props.onDestination,
    onPlayerApproach: props.onPlayerApproach,
    onEdit: props.onEdit,
    onAreaSelect: props.onAreaSelect,
    onObjectSelect: props.onObjectSelect,
  });
  const directionCallbackRef = useRef(props.onDirectionalInput);
  const sequenceRef = useRef(0);
  const handledFocusRequestRef = useRef<string | undefined>(undefined);

  callbacksRef.current = {
    onDestination: props.onDestination,
    onPlayerApproach: props.onPlayerApproach,
    onEdit: props.onEdit,
    onAreaSelect: props.onAreaSelect,
    onObjectSelect: props.onObjectSelect,
  };
  directionCallbackRef.current = props.onDirectionalInput;
  propsRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    let lifecycle = lifecycleRef.current;
    if (!lifecycle) {
      const app = new Application();
      const createdLifecycle: PixiLifecycle = {
        app,
        initialization: Promise.resolve(),
        active: true,
        initialized: false,
        destroyed: false,
      };
      lifecycle = createdLifecycle;
      lifecycleRef.current = lifecycle;
      lifecycle.initialization = app.init({
        antialias: true,
        backgroundAlpha: 0,
        resizeTo: host,
        preference: "webgl",
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      }).then(() => {
        createdLifecycle.initialized = true;
        if (createdLifecycle.destroyed) {
          return;
        }
        host.appendChild(app.canvas);
        const renderer = new OfficeRenderer(app, callbacksRef);
        createdLifecycle.renderer = renderer;
        rendererRef.current = renderer;
        const current = propsRef.current;
        renderer.setScene(current.floor, current.layout, current.meetings, current.editing, current.editingTool);
        renderer.setPlayers(current.players, current.members, current.currentUserId);
        renderer.setReactions(current.reactions);
        renderer.setHighFives(current.highFives);
        if (current.focusTarget && renderer.focusUser(current.focusTarget.userId)) {
          handledFocusRequestRef.current = current.focusTarget.requestId;
        }
      }).catch((error: unknown) => {
        if (createdLifecycle.active) {
          console.error("Office renderer could not start.", error);
        }
      });
    } else {
      lifecycle.active = true;
      if (lifecycle.cleanupTimer !== undefined) {
        window.clearTimeout(lifecycle.cleanupTimer);
        delete lifecycle.cleanupTimer;
      }
    }
    return () => {
      lifecycle.active = false;
      lifecycle.cleanupTimer = window.setTimeout(() => {
        if (lifecycle.active || lifecycle.destroyed) {
          return;
        }
        lifecycle.destroyed = true;
        void lifecycle.initialization.then(() => {
          lifecycle.renderer?.destroy();
          rendererRef.current = undefined;
          if (lifecycle.app.canvas.parentElement === host) {
            host.removeChild(lifecycle.app.canvas);
          }
          if (lifecycle.initialized) {
            lifecycle.app.destroy(true, { children: true });
          }
          if (lifecycleRef.current === lifecycle) {
            lifecycleRef.current = undefined;
          }
        });
      }, 0);
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setScene(props.floor, props.layout, props.meetings, props.editing, props.editingTool);
  }, [props.editing, props.editingTool, props.floor, props.layout, props.meetings]);

  useEffect(() => {
    rendererRef.current?.setPlayers(props.players, props.members, props.currentUserId);
  }, [props.currentUserId, props.members, props.players]);

  useEffect(() => {
    rendererRef.current?.setReactions(props.reactions);
  }, [props.reactions]);

  useEffect(() => {
    rendererRef.current?.setHighFives(props.highFives);
  }, [props.highFives]);

  useEffect(() => {
    const target = props.focusTarget;
    if (target && handledFocusRequestRef.current !== target.requestId && rendererRef.current?.focusUser(target.userId)) {
      handledFocusRequestRef.current = target.requestId;
    }
  }, [props.focusTarget, props.players]);

  useEffect(() => {
    const pressed = new Set<string>();
    const keyMap: Record<string, [number, number]> = {
      w: [0, -1],
      arrowup: [0, -1],
      s: [0, 1],
      arrowdown: [0, 1],
      a: [-1, 0],
      arrowleft: [-1, 0],
      d: [1, 0],
      arrowright: [1, 0],
    };

    const emit = () => {
      let dx = 0;
      let dy = 0;
      for (const key of pressed) {
        const direction = keyMap[key];
        if (direction) {
          dx += direction[0];
          dy += direction[1];
        }
      }
      directionCallbackRef.current(++sequenceRef.current, Math.max(-1, Math.min(1, dx)), Math.max(-1, Math.min(1, dy)));
    };

    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement;

    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!props.inputEnabled || isTyping(event.target) || !keyMap[key] || pressed.has(key)) {
        return;
      }
      event.preventDefault();
      pressed.add(key);
      emit();
    };
    const keyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!pressed.delete(key)) {
        return;
      }
      event.preventDefault();
      emit();
    };
    const reset = () => {
      if (pressed.size > 0) {
        pressed.clear();
        emit();
      }
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", reset);
    return () => {
      reset();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", reset);
    };
  }, [props.inputEnabled]);

  return (
    <div className={`world-viewport ${props.editing ? "editing" : ""}`}>
      <div
        ref={hostRef}
        className="world-canvas"
        role="application"
        tabIndex={0}
        aria-label={`${props.floor.name} office map. Use arrow keys or WASD to move.`}
      />
      <div className="world-zoom-controls">
        <IconButton label="Zoom in" icon={Plus} onClick={() => rendererRef.current?.zoomBy(0.12)} />
        <IconButton label="Zoom out" icon={Minus} onClick={() => rendererRef.current?.zoomBy(-0.12)} />
        <IconButton label="Center on me" icon={LocateFixed} onClick={() => rendererRef.current?.focusUser(props.currentUserId)} />
      </div>
    </div>
  );
}

class OfficeRenderer {
  private readonly world = new Container();
  private readonly layoutLayer = new Container();
  private readonly playerLayer = new Container();
  private readonly celebrationLayer = new Container();
  private readonly playerViews = new Map<string, PlayerView>();
  private readonly highFiveViews = new Map<string, HighFiveView>();
  private readonly reactions = new Map<string, DisplayReaction>();
  private readonly pointerStart = { x: 0, y: 0 };
  private floor?: Floor;
  private layout?: FloorLayout;
  private meetings: Meeting[] = [];
  private editing = false;
  private editingTool: LayoutTool | null = null;
  private currentUserId = "";
  private cameraUserId = "";
  private zoom = 0.78;
  private offsetX = 0;
  private offsetY = 0;
  private panning = false;
  private directPanCandidate = false;
  private activePointerId: number | undefined;
  private lastPointer = { x: 0, y: 0 };

  constructor(
    private readonly app: Application,
    private readonly callbacks: React.MutableRefObject<RendererCallbacks>,
  ) {
    this.app.stage.addChild(this.world);
    this.world.addChild(this.layoutLayer, this.playerLayer, this.celebrationLayer);
    this.app.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.app.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.app.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.app.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.app.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.app.ticker.add(this.renderFrame);
  }

  setScene(floor: Floor, layout: FloorLayout, meetings: Meeting[], editing: boolean, editingTool: LayoutTool | null): void {
    const floorChanged = this.floor?.id !== floor.id;
    this.floor = floor;
    this.layout = layout;
    this.meetings = meetings;
    this.editing = editing;
    this.editingTool = editingTool;
    if (floorChanged) {
      this.offsetX = 0;
      this.offsetY = 0;
      this.cameraUserId = this.currentUserId;
    }
    this.drawLayout();
  }

  setPlayers(players: WorldPlayer[], members: Member[], currentUserId: string): void {
    this.currentUserId = currentUserId;
    if (!this.cameraUserId) {
      this.cameraUserId = currentUserId;
    }
    const memberMap = new Map(members.map((member) => [member.id, member]));
    const visibleIds = new Set(players.map((player) => player.userId));
    for (const [userId, view] of this.playerViews) {
      if (!visibleIds.has(userId)) {
        view.container.destroy({ children: true });
        this.playerViews.delete(userId);
      }
    }
    for (const player of players) {
      const member = memberMap.get(player.userId);
      if (!member) {
        continue;
      }
      let view = this.playerViews.get(player.userId);
      if (!view) {
        view = this.createPlayerView(member, player.userId === currentUserId);
        view.container.position.set(player.x, player.y);
        this.playerViews.set(player.userId, view);
        this.playerLayer.addChild(view.container);
        this.applyReaction(view, this.reactions.get(player.userId));
      }
      view.targetX = player.x;
      view.targetY = player.y;
      view.wavingUntil = player.wavingUntil ?? 0;
      view.status.clear().circle(13, -13, 5).fill(statusColors[player.availability]).stroke({ color: "#ffffff", width: 2 });
    }
  }

  setReactions(reactions: DisplayReaction[]): void {
    this.reactions.clear();
    for (const reaction of reactions) {
      this.reactions.set(reaction.userId, reaction);
    }
    for (const [userId, view] of this.playerViews) {
      this.applyReaction(view, this.reactions.get(userId));
    }
  }

  setHighFives(highFives: DisplayHighFive[]): void {
    const visibleIds = new Set(highFives.map((highFive) => highFive.id));
    for (const [id, view] of this.highFiveViews) {
      if (!visibleIds.has(id)) {
        view.container.destroy({ children: true });
        this.highFiveViews.delete(id);
      }
    }
    for (const highFive of highFives) {
      if (this.highFiveViews.has(highFive.id)) {
        continue;
      }
      const container = new Container();
      const ring = new Graphics().circle(0, 0, 30).fill({ color: "#ffffff", alpha: 0.96 }).stroke({ color: "#f4b942", width: 4 });
      const emoji = new Text({
        text: "🙌",
        style: { fontFamily: "Segoe UI Emoji, Apple Color Emoji, sans-serif", fontSize: 26, fill: "#282631" },
      });
      emoji.anchor.set(0.5);
      const sparks = new Graphics()
        .circle(-34, -20, 4).fill("#ff7a66")
        .circle(34, -18, 4).fill("#6c5ce7")
        .circle(-28, 28, 3).fill("#25b99a")
        .circle(30, 26, 3).fill("#f4b942");
      container.addChild(ring, sparks, emoji);
      this.celebrationLayer.addChild(container);
      this.highFiveViews.set(highFive.id, {
        container,
        ring,
        userIds: highFive.userIds,
        startedAt: Date.now(),
        expiresAt: highFive.expiresAt,
      });
    }
  }

  focusUser(userId: string): boolean {
    if (!this.playerViews.has(userId)) {
      return false;
    }
    this.cameraUserId = userId;
    this.offsetX = 0;
    this.offsetY = 0;
    return true;
  }

  zoomBy(amount: number): void {
    this.zoom = Math.max(0.5, Math.min(1.45, this.zoom + amount));
  }

  destroy(): void {
    this.app.ticker.remove(this.renderFrame);
    this.app.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.app.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.app.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.app.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.app.canvas.removeEventListener("wheel", this.handleWheel);
  }

  private drawLayout(): void {
    if (!this.floor || !this.layout) {
      return;
    }
    for (const child of this.layoutLayer.removeChildren()) {
      child.destroy({ children: true });
    }
    const base = new Graphics()
      .roundRect(0, 0, this.floor.width, this.floor.height, 24)
      .fill(this.floor.background)
      .stroke({ color: "#c8c0b2", width: 2 });
    this.layoutLayer.addChild(base);

    const grid = new Graphics();
    const gridSize = this.editing ? 32 : 80;
    const gridColor = this.editing ? "#766f6728" : "#766f6713";
    const start = this.editing ? -512 : 0;
    const endX = this.editing ? this.floor.width + 512 : this.floor.width;
    const endY = this.editing ? this.floor.height + 512 : this.floor.height;
    for (let x = start; x <= endX; x += gridSize) {
      grid.moveTo(x, start).lineTo(x, endY);
    }
    for (let y = start; y <= endY; y += gridSize) {
      grid.moveTo(start, y).lineTo(endX, y);
    }
    grid.stroke({ color: gridColor, width: 1 });
    this.layoutLayer.addChild(grid);

    for (const tile of this.layout.tiles) {
      this.layoutLayer.addChild(new Graphics().rect(tile.x, tile.y, 32, 32).fill(tile.color));
    }
    for (const area of this.layout.areas) {
      const areaGraphic = new Graphics()
        .roundRect(area.x, area.y, area.width, area.height, 18)
        .fill({ color: area.color, alpha: 0.72 })
        .stroke({ color: area.locked ? "#51476c" : "#ffffff80", width: area.locked ? 2 : 1 });
      this.layoutLayer.addChild(areaGraphic);
      const label = new Text({
        text: area.name,
        style: { fontFamily: "Inter, Segoe UI, sans-serif", fontSize: 15, fontWeight: "600", fill: "#34313b" },
      });
      label.position.set(area.x + 18, area.y + 15);
      this.layoutLayer.addChild(label);
    }

    for (const area of this.layout.areas.filter(isEnclosedArea)) {
      for (const wall of getAreaBoundaryWalls(area)) {
        this.layoutLayer.addChild(
          new Graphics().roundRect(wall.x, wall.y, wall.width, wall.height, 2).fill("#57535e"),
        );
      }
      for (const door of area.doors) {
        const rect = getAreaDoorRect(area, door);
        this.layoutLayer.addChild(
          new Graphics()
            .roundRect(rect.x, rect.y, rect.width, rect.height, 3)
            .fill(area.locked ? "#6b5b80" : "#e8e2d8")
            .stroke({ color: area.locked ? "#3f354d" : "#8b8379", width: 2 }),
        );
      }
    }

    for (const meeting of this.meetings) {
      if (meeting.status === "ended" || meeting.location.type !== "public" || meeting.location.floorId !== this.floor.id) {
        continue;
      }
      const marker = new Graphics()
        .circle(meeting.location.x, meeting.location.y, meeting.location.radius)
        .fill({ color: "#6c5ce7", alpha: 0.09 })
        .stroke({ color: "#6c5ce7", width: 3, alpha: meeting.status === "live" ? 0.72 : 0.38 });
      const center = new Graphics()
        .circle(meeting.location.x, meeting.location.y, 5)
        .fill({ color: "#6c5ce7", alpha: 0.78 });
      this.layoutLayer.addChild(marker, center);
    }

    for (const object of this.layout.objects) {
      this.drawObject(object);
    }
    for (const wall of this.layout.walls) {
      const shadow = new Graphics().rect(wall.x + 3, wall.y + 4, wall.width, wall.height).fill({ color: "#282633", alpha: 0.14 });
      const graphic = new Graphics().roundRect(wall.x, wall.y, wall.width, wall.height, 3).fill("#4d4a55");
      this.layoutLayer.addChild(shadow, graphic);
    }

    const spawn = new Graphics()
      .moveTo(this.floor.spawn.x, this.floor.spawn.y - 8)
      .lineTo(this.floor.spawn.x + 8, this.floor.spawn.y)
      .lineTo(this.floor.spawn.x, this.floor.spawn.y + 8)
      .lineTo(this.floor.spawn.x - 8, this.floor.spawn.y)
      .closePath()
      .fill({ color: "#6c5ce7", alpha: 0.35 });
    this.layoutLayer.addChild(spawn);
  }

  private drawObject(object: WorldObject): void {
    const shadow = new Graphics().roundRect(object.x + 4, object.y + 5, object.width, object.height, 6).fill({ color: "#24212d", alpha: 0.12 });
    const graphic = new Graphics().roundRect(object.x, object.y, object.width, object.height, object.type === "plant" ? 10 : 6).fill(object.color);
    this.layoutLayer.addChild(shadow, graphic);

    if (object.type === "arcade") {
      const screen = new Graphics().roundRect(object.x + 10, object.y + 12, object.width - 20, 34, 3).fill("#9af0d0");
      const controls = new Graphics().circle(object.x + 20, object.y + 62, 5).fill("#ff7a66").circle(object.x + object.width - 20, object.y + 62, 5).fill("#f4b942");
      this.layoutLayer.addChild(screen, controls);
    } else if (object.type === "plant") {
      const leaf = new Graphics().rect(object.x + 8, object.y + 4, object.width - 16, object.height - 12).fill("#79b58c");
      this.layoutLayer.addChild(leaf);
    } else if (object.type === "portal") {
      const portal = new Graphics().roundRect(object.x + 8, object.y + 8, object.width - 16, object.height - 16, 7).stroke({ color: "#ffffff", width: 3 });
      this.layoutLayer.addChild(portal);
    } else if (object.type === "desk") {
      const inset = new Graphics().rect(object.x + 8, object.y + 8, object.width - 16, 5).fill({ color: "#ffffff", alpha: 0.32 });
      this.layoutLayer.addChild(inset);
    }

    if (object.label) {
      const label = new Text({
        text: object.label,
        style: { fontFamily: "Inter, Segoe UI, sans-serif", fontSize: object.type === "portal" ? 13 : 10, fontWeight: "700", fill: object.type === "arcade" ? "#ffffff" : "#34313b" },
      });
      label.anchor.set(0.5);
      label.position.set(object.x + object.width / 2, object.y + object.height - (object.type === "arcade" ? 13 : object.type === "portal" ? object.height / 2 : 9));
      this.layoutLayer.addChild(label);
    }
  }

  private createPlayerView(member: Member, current: boolean): PlayerView {
    const container = new Container();
    const wave = new Graphics().circle(0, 0, 24).stroke({ color: member.color, width: 3 });
    wave.alpha = 0;
    const shadow = new Graphics().roundRect(-14, -11, 32, 32, 7).fill({ color: "#24212d", alpha: 0.18 });
    const square = new Graphics().roundRect(-16, -16, 32, 32, 7).fill(member.color).stroke({ color: current ? "#ffffff" : "#ffffffcc", width: current ? 3 : 2 });
    const initials = new Text({ text: member.initials, style: { fontFamily: "Inter, Segoe UI, sans-serif", fontSize: 10, fontWeight: "800", fill: "#ffffff" } });
    initials.anchor.set(0.5);
    const name = new Text({ text: current ? "You" : member.name.split(" ")[0] ?? member.name, style: { fontFamily: "Inter, Segoe UI, sans-serif", fontSize: 11, fontWeight: "600", fill: "#292731" } });
    name.anchor.set(0.5, 0);
    name.position.set(0, 22);
    const status = new Graphics();
    const reactionBubble = new Container();
    reactionBubble.visible = false;
    reactionBubble.position.set(0, -52);
    const reactionShadow = new Graphics().roundRect(-22, -20, 44, 40, 15).fill({ color: "#24212d", alpha: 0.18 });
    reactionShadow.position.set(2, 3);
    const reactionBackground = new Graphics()
      .roundRect(-22, -20, 44, 40, 15)
      .fill({ color: "#ffffff", alpha: 0.98 })
      .stroke({ color: member.color, width: 2, alpha: 0.45 });
    const reactionText = new Text({
      text: "",
      style: { fontFamily: "Segoe UI Emoji, Apple Color Emoji, sans-serif", fontSize: 22, fill: "#282631" },
    });
    reactionText.anchor.set(0.5);
    reactionBubble.addChild(reactionShadow, reactionBackground, reactionText);
    container.addChild(wave, shadow, square, initials, name, status, reactionBubble);
    return {
      container,
      status,
      wave,
      reactionBubble,
      reactionText,
      reactionStartedAt: 0,
      reactionUntil: 0,
      targetX: 0,
      targetY: 0,
      wavingUntil: 0,
    };
  }

  private applyReaction(view: PlayerView, reaction?: DisplayReaction): void {
    if (!reaction) {
      view.reactionUntil = 0;
      return;
    }
    if (view.reactionId !== reaction.id) {
      view.reactionId = reaction.id;
      view.reactionStartedAt = Date.now();
      view.reactionText.text = REACTION_EMOJI[reaction.reaction];
    }
    view.reactionUntil = reaction.expiresAt;
  }

  private readonly renderFrame = (): void => {
    const now = Date.now();
    for (const view of this.playerViews.values()) {
      view.container.x += (view.targetX - view.container.x) * 0.22;
      view.container.y += (view.targetY - view.container.y) * 0.22;
      const waving = view.wavingUntil > now;
      view.wave.alpha = waving ? 0.35 + Math.sin(now / 100) * 0.2 : 0;
      view.wave.scale.set(waving ? 1 + ((now / 700) % 0.4) : 1);
      const reacting = view.reactionUntil > now;
      view.reactionBubble.visible = reacting;
      if (reacting) {
        const entrance = Math.min(1, (now - view.reactionStartedAt) / 180);
        const exit = Math.min(1, (view.reactionUntil - now) / 280);
        const scale = 0.72 + 0.28 * (1 - Math.pow(1 - entrance, 3));
        view.reactionBubble.alpha = exit;
        view.reactionBubble.scale.set(scale);
        view.reactionBubble.y = -49 - entrance * 5;
      }
    }
    for (const view of this.highFiveViews.values()) {
      const left = this.playerViews.get(view.userIds[0]);
      const right = this.playerViews.get(view.userIds[1]);
      view.container.visible = Boolean(left && right && now < view.expiresAt);
      if (!left || !right || now >= view.expiresAt) {
        continue;
      }
      view.container.position.set((left.container.x + right.container.x) / 2, (left.container.y + right.container.y) / 2 - 34);
      const entrance = Math.min(1, (now - view.startedAt) / 220);
      const exit = Math.min(1, (view.expiresAt - now) / 320);
      view.container.alpha = exit;
      view.container.scale.set(0.62 + entrance * 0.38);
      view.ring.scale.set(1 + entrance * 0.12);
    }
    const focus = this.playerViews.get(this.cameraUserId) ?? this.playerViews.get(this.currentUserId);
    const fallbackX = this.floor ? this.floor.width / 2 : 0;
    const fallbackY = this.floor ? this.floor.height / 2 : 0;
    const targetX = (focus?.container.x ?? fallbackX) + this.offsetX;
    const targetY = (focus?.container.y ?? fallbackY) + this.offsetY;
    const desiredX = this.app.screen.width / 2 - targetX * this.zoom;
    const desiredY = this.app.screen.height / 2 - targetY * this.zoom;
    this.world.position.x += (desiredX - this.world.position.x) * 0.14;
    this.world.position.y += (desiredY - this.world.position.y) * 0.14;
    this.world.scale.set(this.zoom);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1)) {
      return;
    }
    this.app.canvas.focus();
    this.activePointerId = event.pointerId;
    this.pointerStart.x = event.clientX;
    this.pointerStart.y = event.clientY;
    this.lastPointer.x = event.clientX;
    this.lastPointer.y = event.clientY;
    this.panning = event.button === 1 || event.shiftKey;
    this.directPanCandidate = event.pointerType !== "mouse";
    this.app.canvas.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) {
      return;
    }
    if (!this.panning && this.directPanCandidate && Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 6) {
      this.panning = true;
    }
    if (!this.panning) {
      return;
    }
    const deltaX = event.clientX - this.lastPointer.x;
    const deltaY = event.clientY - this.lastPointer.y;
    this.offsetX -= deltaX / this.zoom;
    this.offsetY -= deltaY / this.zoom;
    this.lastPointer.x = event.clientX;
    this.lastPointer.y = event.clientY;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) {
      return;
    }
    if (this.app.canvas.hasPointerCapture(event.pointerId)) {
      this.app.canvas.releasePointerCapture(event.pointerId);
    }
    this.activePointerId = undefined;
    this.directPanCandidate = false;
    const moved = Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y);
    const wasPanning = this.panning;
    this.panning = false;
    if (wasPanning || moved > 6 || !this.layout) {
      return;
    }
    this.cameraUserId = this.currentUserId;
    const point = this.toWorld(event.clientX, event.clientY);
    if (this.editing && this.editingTool) {
      this.callbacks.current.onEdit(point.x, point.y);
      return;
    }
    const player = [...this.playerViews.entries()].reverse().find(
      ([userId, view]) => userId !== this.currentUserId && Math.hypot(point.x - view.container.x, point.y - view.container.y) <= 28,
    );
    if (player) {
      this.callbacks.current.onPlayerApproach(player[0]);
      return;
    }
    const object = [...this.layout.objects].reverse().find((item) => item.interactive && isInside(point.x, point.y, item));
    if (object) {
      this.callbacks.current.onObjectSelect(object);
      return;
    }
    const area = [...this.layout.areas].reverse().find((item) => isInside(point.x, point.y, item));
    if (area) {
      this.callbacks.current.onAreaSelect(area, point.x, point.y);
      return;
    }
    this.callbacks.current.onDestination(point.x, point.y);
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) {
      return;
    }
    this.activePointerId = undefined;
    this.directPanCandidate = false;
    this.panning = false;
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoom = Math.max(0.5, Math.min(1.45, this.zoom + (event.deltaY > 0 ? -0.08 : 0.08)));
  };

  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.world.position.x) / this.zoom,
      y: (clientY - rect.top - this.world.position.y) / this.zoom,
    };
  }
}

function isInside(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
