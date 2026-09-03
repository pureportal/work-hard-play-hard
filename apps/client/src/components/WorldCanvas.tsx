import { ArrowUp, Check, LocateFixed, Minus, Plus, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import {
  ASSET_RASTER_SIZE,
  BUILD_GRID_SIZE,
  PROXIMITY_GROUP_REACH_RADIUS,
  PROXIMITY_INTERACTION_RADIUS,
  WALL_THICKNESS,
  getAssetDefinition,
  getAssetPlacementError,
  getCenteredAssetPosition,
  getOpeningCenter,
  getOpeningRect,
  getOutdoorBounds,
  getOutdoorWindowLights,
  getPlacedAssetBounds,
  getPlacedAssetCells,
  getPlacedAssetInteractions,
  getPlayerAssetRoomError,
  getWallOpeningPlacement,
  getWallPlacementError,
  getWallRect,
  getWallSolidRects,
  isPointInPlacedAsset,
  mergeWallSegments,
  normalizeWall,
  pointInRect,
  requireAssetDefinition,
  requireAssetVariant,
  snapToBuildGrid,
} from "@workhard/shared";
import type {
  AssetDefinition,
  AssetRotation,
  AssetVariantDefinition,
  Floor,
  FloorLayout,
  GameSettings,
  LayoutEdit,
  LayoutItemReference,
  LayoutTool,
  Meeting,
  Member,
  OpeningType,
  PlacedAssetCell,
  PlacedAssetInteraction,
  Rect,
  Wall,
  WorldObject,
  WorldPlayer,
} from "@workhard/shared";
import type { DisplayGongRing } from "../gong";
import { getAssetDirectionIndicators, getAssetOrientationLabel, rotateAssetClockwise } from "../asset-orientation";
import { REACTION_EMOJI, type DisplayHighFive, type DisplayReaction } from "../reactions";
import { resolveServerUrl } from "../server-url";
import type { ColorTheme } from "../theme";
import { isPointInWorldTarget, resolveWorldPointTarget } from "../world-point-target";
import { IconButton } from "./IconButton";

export interface WorldCanvasProps {
  floor: Floor;
  layout: FloorLayout;
  members: Member[];
  meetings: Meeting[];
  players: WorldPlayer[];
  reactions: DisplayReaction[];
  highFives: DisplayHighFive[];
  gongRings: DisplayGongRing[];
  currentUserId: string;
  editingTool: LayoutTool | null;
  editingAssetId: string;
  editingAssetVariantId: string;
  editingAssetRotation: AssetRotation;
  selectedBuildItem?: LayoutItemReference | undefined;
  movingBuildItem?: LayoutItemReference | undefined;
  playerAssetPlacement?: { userId: string; settings: GameSettings } | undefined;
  colorTheme: ColorTheme;
  editing: boolean;
  inputEnabled: boolean;
  focusTarget?: { userId: string; requestId: string } | undefined;
  onDestination: (x: number, y: number) => void;
  onPlayerSelect: (userId: string, anchor: ContextAnchor) => void;
  onEdit: (edit: LayoutEdit) => void;
  onObjectSelect: (object: WorldObject, interactionId: string | undefined, anchor: ContextAnchor) => void;
  onBuildItemSelect: (item?: LayoutItemReference) => void;
  onAssetRotationChange: (rotation: AssetRotation) => void;
  onPlacementCancel: () => void;
  onGongOffscreen: (ring: DisplayGongRing) => void;
  onDirectionalInput: (sequence: number, dx: number, dy: number) => void;
}

export interface ContextAnchor {
  x: number;
  y: number;
}

interface RendererCallbacks {
  onDestination: WorldCanvasProps["onDestination"];
  onPlayerSelect: WorldCanvasProps["onPlayerSelect"];
  onEdit: WorldCanvasProps["onEdit"];
  onObjectSelect: WorldCanvasProps["onObjectSelect"];
  onBuildItemSelect: WorldCanvasProps["onBuildItemSelect"];
  onGongOffscreen: WorldCanvasProps["onGongOffscreen"];
  onAssetPreviewStateChange: (state: AssetPreviewState) => void;
  onCameraModeChange: (mode: CameraMode) => void;
}

interface AssetPreviewState {
  hasPoint: boolean;
  canPlace: boolean;
}

type CameraMode = "follow" | "free";

interface ActivePointer {
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  pointerType: string;
}

const MIN_CAMERA_ZOOM = 0.5;
const MAX_CAMERA_ZOOM = 1.45;
const MOUSE_DRAG_THRESHOLD = 6;
const TOUCH_DRAG_THRESHOLD = 10;
const MULTI_POINTER_MOVE_THRESHOLD = 1;
const MULTI_POINTER_ZOOM_THRESHOLD = 0.002;
const MIN_TOUCH_TARGET_SIZE = 44;

interface PlayerView {
  container: Container;
  proximity: Graphics;
  status: Graphics;
  facing: Graphics;
  wave: Graphics;
  avatarImage: Container;
  initials: Text;
  name: Text;
  avatarUrl: string | undefined;
  reactionBubble: Container;
  reactionText: Text;
  reactionId?: string;
  reactionStartedAt: number;
  reactionUntil: number;
  targetX: number;
  targetY: number;
  wavingUntil: number;
  availability?: Member["availability"];
  facingDirection?: WorldPlayer["facing"];
  proximityStyle?: string;
}

interface HighFiveView {
  container: Container;
  ring: Graphics;
  userIds: [string, string];
  startedAt: number;
  expiresAt: number;
}

interface GongObjectView {
  disc: Container;
  mallet: Container;
  ringStartedAt: number;
  ringUntil: number;
}

interface GongConfettiParticle {
  graphic: Graphics;
  startX: number;
  startY: number;
  velocityX: number;
  velocityY: number;
  rotationSpeed: number;
}

interface GongCelebrationView {
  container: Container;
  rings: Graphics[];
  confetti: GongConfettiParticle[];
  maxRadius: number;
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

const proximityColors = ["#6c5ce7", "#287fc1", "#0f9f82", "#d9822b", "#d35c79"];

function proximityColor(callId: string): string {
  let hash = 0;
  for (const character of callId) {
    hash = Math.imul(hash, 31) + character.charCodeAt(0);
  }
  return proximityColors[Math.abs(hash) % proximityColors.length]!;
}

export function WorldCanvas(props: WorldCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<OfficeRenderer | undefined>(undefined);
  const [assetPreviewState, setAssetPreviewState] = useState<AssetPreviewState>({ hasPoint: false, canPlace: false });
  const [cameraMode, setCameraMode] = useState<CameraMode>("follow");
  const lifecycleRef = useRef<PixiLifecycle | undefined>(undefined);
  const propsRef = useRef(props);
  const callbacksRef = useRef<RendererCallbacks>({
    onDestination: props.onDestination,
    onPlayerSelect: props.onPlayerSelect,
    onEdit: props.onEdit,
    onObjectSelect: props.onObjectSelect,
    onBuildItemSelect: props.onBuildItemSelect,
    onGongOffscreen: props.onGongOffscreen,
    onAssetPreviewStateChange: setAssetPreviewState,
    onCameraModeChange: setCameraMode,
  });
  const directionCallbackRef = useRef(props.onDirectionalInput);
  const sequenceRef = useRef(0);
  const handledFocusRequestRef = useRef<string | undefined>(undefined);

  callbacksRef.current = {
    onDestination: props.onDestination,
    onPlayerSelect: props.onPlayerSelect,
    onEdit: props.onEdit,
    onObjectSelect: props.onObjectSelect,
    onBuildItemSelect: props.onBuildItemSelect,
    onGongOffscreen: props.onGongOffscreen,
    onAssetPreviewStateChange: setAssetPreviewState,
    onCameraModeChange: setCameraMode,
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
        renderer.setScene(
          current.floor,
          current.layout,
          current.meetings,
          current.editing,
          current.editingTool,
          current.editingAssetId,
          current.editingAssetVariantId,
          current.editingAssetRotation,
          current.selectedBuildItem,
          current.movingBuildItem,
          current.playerAssetPlacement,
          current.colorTheme,
        );
        renderer.setPlayers(current.players, current.members, current.currentUserId);
        renderer.setReactions(current.reactions);
        renderer.setHighFives(current.highFives);
        renderer.setGongRings(current.gongRings);
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
    rendererRef.current?.setScene(
      props.floor,
      props.layout,
      props.meetings,
      props.editing,
      props.editingTool,
      props.editingAssetId,
      props.editingAssetVariantId,
      props.editingAssetRotation,
      props.selectedBuildItem,
      props.movingBuildItem,
      props.playerAssetPlacement,
      props.colorTheme,
    );
  }, [props.colorTheme, props.editing, props.editingAssetId, props.editingAssetRotation, props.editingAssetVariantId, props.editingTool, props.floor, props.layout, props.meetings, props.movingBuildItem, props.playerAssetPlacement, props.selectedBuildItem]);

  const assetPlacementActive = props.editing
    && (props.editingTool === "asset" || props.movingBuildItem?.type === "asset");

  useEffect(() => {
    if (!assetPlacementActive) {
      setAssetPreviewState({ hasPoint: false, canPlace: false });
    }
  }, [assetPlacementActive]);

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
    rendererRef.current?.setGongRings(props.gongRings);
  }, [props.gongRings]);

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
        aria-label={props.editing ? `${props.floor.name} build canvas.` : `${props.floor.name} office map. Use arrow keys or WASD to move.`}
      />
      <div className="world-zoom-controls" role="toolbar" aria-label="Camera">
        <IconButton label="Zoom in" icon={Plus} onClick={() => rendererRef.current?.zoomBy(0.12)} />
        <IconButton label="Zoom out" icon={Minus} onClick={() => rendererRef.current?.zoomBy(-0.12)} />
        {cameraMode === "free" && (
          <button className="camera-follow-button" onClick={() => rendererRef.current?.focusUser(props.currentUserId)}>
            <LocateFixed size={17} aria-hidden="true" />
            Follow
          </button>
        )}
      </div>
      {assetPlacementActive && (
        <div className="placement-controls" role="toolbar" aria-label="Asset placement">
          <span className="placement-orientation" aria-label={`Facing ${getAssetOrientationLabel(props.editingAssetRotation)}`}>
            <ArrowUp
              size={16}
              aria-hidden="true"
              style={{ transform: `rotate(${props.editingAssetRotation}deg)` }}
            />
            <strong>{getAssetOrientationLabel(props.editingAssetRotation)}</strong>
          </span>
          <IconButton
            label="Rotate asset clockwise"
            icon={RotateCw}
            onClick={() => props.onAssetRotationChange(rotateAssetClockwise(props.editingAssetRotation))}
          />
          <button
            className="placement-confirm"
            disabled={!assetPreviewState.hasPoint || !assetPreviewState.canPlace}
            onClick={() => rendererRef.current?.commitAssetPlacement()}
          >
            <Check size={16} aria-hidden="true" />
            {props.movingBuildItem?.type === "asset" ? "Move here" : "Place"}
          </button>
          <IconButton label="Cancel placement" icon={X} onClick={props.onPlacementCancel} />
        </div>
      )}
    </div>
  );
}

class OfficeRenderer {
  private readonly world = new Container();
  private readonly layoutLayer = new Container();
  private readonly selectionOverlay = new Graphics();
  private readonly buildPreview = new Graphics();
  private readonly playerLayer = new Container();
  private readonly celebrationLayer = new Container();
  private readonly playerViews = new Map<string, PlayerView>();
  private readonly highFiveViews = new Map<string, HighFiveView>();
  private readonly gongViews = new Map<string, GongObjectView>();
  private readonly gongCelebrationViews = new Map<string, GongCelebrationView>();
  private readonly reactions = new Map<string, DisplayReaction>();
  private readonly pointerStart = { x: 0, y: 0 };
  private memberMap = new Map<string, Member>();
  private members?: Member[];
  private floor?: Floor;
  private layout?: FloorLayout;
  private placementLayout: FloorLayout | undefined;
  private meetings: Meeting[] = [];
  private players: WorldPlayer[] = [];
  private editing = false;
  private editingTool: LayoutTool | null = null;
  private editingAssetId = "";
  private editingAssetVariantId = "";
  private editingAssetRotation: AssetRotation = 0;
  private selectedBuildItem: LayoutItemReference | undefined;
  private movingBuildItem: LayoutItemReference | undefined;
  private playerAssetPlacement: { userId: string; settings: GameSettings } | undefined;
  private currentUserId = "";
  private cameraUserId = "";
  private cameraMode: CameraMode = "follow";
  private freeCameraX = 0;
  private freeCameraY = 0;
  private zoom = 0.78;
  private panning = false;
  private activePointerId: number | undefined;
  private readonly activePointers = new Map<number, ActivePointer>();
  private lastPointer = { x: 0, y: 0 };
  private multiPointerGesture = false;
  private pinchCenter?: { x: number; y: number };
  private pinchDistance = 0;
  private hoverPoint?: { x: number; y: number };
  private hoverPointIsTouch = false;
  private buildStart?: { x: number; y: number };
  private buildOrientation?: "horizontal" | "vertical";
  private colorTheme: ColorTheme = "light";
  private assetPreviewState: AssetPreviewState = { hasPoint: false, canPlace: false };
  private touchPlacement = false;

  constructor(
    private readonly app: Application,
    private readonly callbacks: React.MutableRefObject<RendererCallbacks>,
  ) {
    this.app.stage.addChild(this.world);
    this.world.scale.set(this.zoom);
    this.playerLayer.sortableChildren = true;
    this.world.addChild(this.layoutLayer, this.selectionOverlay, this.buildPreview, this.playerLayer, this.celebrationLayer);
    this.app.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.app.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.app.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.app.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.app.canvas.addEventListener("lostpointercapture", this.handleLostPointerCapture);
    this.app.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.app.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.app.ticker.add(this.renderFrame);
  }

  setScene(
    floor: Floor,
    layout: FloorLayout,
    meetings: Meeting[],
    editing: boolean,
    editingTool: LayoutTool | null,
    editingAssetId: string,
    editingAssetVariantId: string,
    editingAssetRotation: AssetRotation,
    selectedBuildItem?: LayoutItemReference,
    movingBuildItem?: LayoutItemReference,
    playerAssetPlacement?: { userId: string; settings: GameSettings },
    colorTheme: ColorTheme = "light",
  ): void {
    const floorChanged = this.floor?.id !== floor.id;
    const structureChanged = this.floor !== floor || this.layout !== layout;
    const meetingsChanged = this.meetings.length !== meetings.length
      || this.meetings.some((meeting, index) => meeting !== meetings[index]);
    const editingGridChanged = this.editing !== editing
      || (editing && (this.editingTool === "asset") !== (editingTool === "asset"));
    const themeChanged = this.colorTheme !== colorTheme;
    const layoutChanged = structureChanged
      || meetingsChanged
      || editingGridChanged
      || themeChanged;
    const toolChanged = this.editing !== editing
      || this.editingTool !== editingTool
      || itemKey(this.movingBuildItem) !== itemKey(movingBuildItem);
    this.floor = floor;
    this.layout = layout;
    if (structureChanged) {
      const mergedSegments = mergeWallSegments(layout.walls, layout.openings);
      this.placementLayout = { ...layout, walls: mergedSegments.walls, openings: mergedSegments.openings };
    }
    this.meetings = meetings;
    this.editing = editing;
    this.editingTool = editingTool;
    this.editingAssetId = editingAssetId;
    this.editingAssetVariantId = editingAssetVariantId;
    this.editingAssetRotation = editingAssetRotation;
    this.selectedBuildItem = selectedBuildItem;
    this.movingBuildItem = movingBuildItem;
    this.playerAssetPlacement = playerAssetPlacement;
    this.colorTheme = colorTheme;
    if (toolChanged) {
      this.buildPreview.clear();
      delete this.buildStart;
      delete this.buildOrientation;
      this.touchPlacement = false;
      this.updateAssetPreviewState(false, false);
    }
    if (floorChanged) {
      this.cancelPointerInteraction();
      this.cameraUserId = this.currentUserId;
      this.updateCameraMode("follow");
      for (const view of this.gongCelebrationViews.values()) {
        view.container.destroy({ children: true });
      }
      this.gongCelebrationViews.clear();
    }
    if (layoutChanged) {
      this.drawLayout();
    }
    if (themeChanged) {
      this.applyPlayerTheme();
    }
    this.drawBuildSelection();
    if (this.editing && this.hoverPoint && !this.buildStart && (!this.hoverPointIsTouch || this.touchPlacement)) {
      this.drawPlacementPreview(this.hoverPoint);
    }
  }

  setPlayers(players: WorldPlayer[], members: Member[], currentUserId: string): void {
    this.players = players;
    this.currentUserId = currentUserId;
    if (!this.cameraUserId) {
      this.cameraUserId = currentUserId;
    }
    if (this.members !== members) {
      this.members = members;
      this.memberMap = new Map(members.map((member) => [member.id, member]));
    }
    const visibleIds = new Set(players.map((player) => player.userId));
    if (this.cameraMode === "follow" && this.cameraUserId && !visibleIds.has(this.cameraUserId)) {
      this.cameraUserId = currentUserId;
    }
    const playerMap = new Map(players.map((player) => [player.userId, player]));
    for (const [userId, view] of this.playerViews) {
      if (!visibleIds.has(userId)) {
        view.container.destroy({ children: true });
        this.playerViews.delete(userId);
      }
    }
    for (const player of players) {
      const member = this.memberMap.get(player.userId);
      if (!member) {
        continue;
      }
      let view = this.playerViews.get(player.userId);
      if (view && view.avatarUrl !== member.avatarUrl) {
        view.container.destroy({ children: true });
        this.playerViews.delete(player.userId);
        view = undefined;
      }
      if (!view) {
        view = this.createPlayerView(member, player.userId === currentUserId);
        view.container.position.set(player.x, player.y);
        this.playerViews.set(player.userId, view);
        this.playerLayer.addChild(view.container);
        this.applyReaction(view, this.reactions.get(player.userId));
      }
      const carrier = player.carriedByUserId ? playerMap.get(player.carriedByUserId) : undefined;
      view.targetX = carrier?.x ?? player.x;
      view.targetY = (carrier?.y ?? player.y) - (carrier ? 42 : 0);
      view.container.zIndex = carrier ? 1 : 0;
      view.wavingUntil = player.wavingUntil ?? 0;
      const proximityStyle = player.proximity?.callId
        ? `call:${player.proximity.callId}`
        : player.proximity ? `ready:${member.color}` : "";
      if (view.proximityStyle !== proximityStyle) {
        view.proximityStyle = proximityStyle;
        view.proximity.clear();
        if (player.proximity) {
          const radius = player.proximity.callId ? PROXIMITY_GROUP_REACH_RADIUS : PROXIMITY_INTERACTION_RADIUS;
          const color = player.proximity.callId ? proximityColor(player.proximity.callId) : member.color;
          view.proximity
            .circle(0, 0, radius)
            .fill({ color, alpha: player.proximity.callId ? 0.1 : 0.06 })
            .stroke({ color, width: 2, alpha: player.proximity.callId ? 0.58 : 0.42 });
        }
      }
      if (view.availability !== player.availability) {
        view.availability = player.availability;
        view.status.clear().circle(13, -13, 5).fill(statusColors[player.availability]).stroke({ color: "#ffffff", width: 2 });
      }
      if (view.facingDirection !== player.facing) {
        view.facingDirection = player.facing;
        view.facing.rotation = facingRotation(player.facing);
      }
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

  setGongRings(gongRings: DisplayGongRing[]): void {
    const visibleIds = new Set(gongRings.map((ring) => ring.id));
    for (const [id, view] of this.gongCelebrationViews) {
      if (!visibleIds.has(id)) {
        view.container.destroy({ children: true });
        this.gongCelebrationViews.delete(id);
      }
    }
    for (const ring of gongRings) {
      if (this.gongCelebrationViews.has(ring.id)) {
        continue;
      }
      const object = this.layout?.objects.find((candidate) => candidate.id === ring.objectId);
      if (!object || getAssetDefinition(object.assetId)?.kind !== "gong") {
        this.callbacks.current.onGongOffscreen(ring);
        continue;
      }
      const bounds = getPlacedAssetBounds(object);
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const container = new Container();
      container.position.set(centerX, centerY);
      const rings = Array.from({ length: 3 }, () => new Graphics()
        .circle(0, 0, 1)
        .stroke({ color: "#f4b942", width: 4, alpha: 0.82 }));
      const confettiColors = ["#f4b942", "#ff7a66", "#fff1a8", "#25b99a", "#6c5ce7"];
      const confetti = Array.from({ length: 24 }, (_, index): GongConfettiParticle => {
        const angle = -Math.PI + Math.random() * Math.PI;
        const speed = 90 + Math.random() * 125;
        const graphic = new Graphics()
          .rect(-3, -3, 6 + index % 3, 6 + (index + 1) % 3)
          .fill(confettiColors[index % confettiColors.length]!);
        container.addChild(graphic);
        return {
          graphic,
          startX: (Math.random() - 0.5) * 22,
          startY: -8 + (Math.random() - 0.5) * 10,
          velocityX: Math.cos(angle) * speed,
          velocityY: Math.sin(angle) * speed - 55,
          rotationSpeed: (Math.random() - 0.5) * 8,
        };
      });
      container.addChild(...rings);
      this.celebrationLayer.addChild(container);
      const floorWidth = this.floor?.width ?? bounds.x + bounds.width;
      const floorHeight = this.floor?.height ?? bounds.y + bounds.height;
      const maxRadius = Math.max(
        Math.hypot(centerX, centerY),
        Math.hypot(floorWidth - centerX, centerY),
        Math.hypot(centerX, floorHeight - centerY),
        Math.hypot(floorWidth - centerX, floorHeight - centerY),
      );
      this.gongCelebrationViews.set(ring.id, {
        container,
        rings,
        confetti,
        maxRadius,
        startedAt: ring.startedAt,
        expiresAt: ring.expiresAt,
      });
      const gongView = this.gongViews.get(object.id);
      if (gongView) {
        gongView.ringStartedAt = ring.startedAt;
        gongView.ringUntil = ring.expiresAt;
      }
      if (!this.isObjectVisible(bounds)) {
        this.callbacks.current.onGongOffscreen(ring);
      }
    }
  }

  focusUser(userId: string): boolean {
    if (!this.playerViews.has(userId)) {
      return false;
    }
    this.cameraUserId = userId;
    this.updateCameraMode("follow");
    return true;
  }

  zoomBy(amount: number): void {
    const nextZoom = clampCameraZoom(this.zoom + amount);
    if (nextZoom === this.zoom) {
      return;
    }
    const visibleCenter = {
      x: (this.app.screen.width / 2 - this.world.position.x) / this.zoom,
      y: (this.app.screen.height / 2 - this.world.position.y) / this.zoom,
    };
    this.zoom = nextZoom;
    if (this.cameraMode === "free") {
      this.applyFreeCameraTransform();
    } else {
      const center = this.constrainCameraCenter(visibleCenter);
      this.world.scale.set(this.zoom);
      this.world.position.set(
        this.app.screen.width / 2 - center.x * this.zoom,
        this.app.screen.height / 2 - center.y * this.zoom,
      );
    }
    this.refreshPlacementPreview();
  }

  commitAssetPlacement(): boolean {
    const point = this.hoverPoint;
    if (!point || !this.editing || (this.editingTool !== "asset" && this.movingBuildItem?.type !== "asset")) {
      return false;
    }
    const candidate = this.createAssetCandidate(point);
    if (!candidate || !this.drawAssetPreview(candidate)) {
      return false;
    }
    this.callbacks.current.onEdit(this.movingBuildItem?.type === "asset"
      ? {
          tool: "asset.move",
          objectId: candidate.id,
          position: { x: candidate.x, y: candidate.y },
          variantId: candidate.variantId,
          rotation: candidate.rotation,
        }
      : {
          tool: "asset",
          position: { x: candidate.x, y: candidate.y },
          assetId: candidate.assetId,
          variantId: candidate.variantId,
          rotation: candidate.rotation,
        });
    return true;
  }

  destroy(): void {
    this.app.ticker.remove(this.renderFrame);
    this.app.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.app.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.app.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.app.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.app.canvas.removeEventListener("lostpointercapture", this.handleLostPointerCapture);
    this.app.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.app.canvas.removeEventListener("wheel", this.handleWheel);
    this.cancelPointerInteraction();
  }

  private drawLayout(): void {
    if (!this.floor || !this.layout) {
      return;
    }
    this.gongViews.clear();
    for (const child of this.layoutLayer.removeChildren()) {
      child.destroy({ children: true });
    }
    const dark = this.colorTheme === "dark";
    const outdoorBounds = getOutdoorBounds(this.floor);
    const outdoors = new Graphics()
      .rect(outdoorBounds.x, outdoorBounds.y, outdoorBounds.width, outdoorBounds.height)
      .fill(dark ? "#1d2925" : "#d8e6dc");
    const baseShadow = new Graphics()
      .roundRect(7, 9, this.floor.width, this.floor.height, 24)
      .fill({ color: dark ? "#08090e" : "#34303a", alpha: dark ? 0.38 : 0.13 });
    const base = new Graphics()
      .roundRect(0, 0, this.floor.width, this.floor.height, 24)
      .fill(dark ? mixHex(this.floor.background, "#171922", 0.72) : this.floor.background)
      .stroke({ color: dark ? "#4a4856" : "#bfb6aa", width: 2 });
    this.layoutLayer.addChild(outdoors, baseShadow, base);

    const grid = new Graphics();
    const gridSize = this.editing ? (this.editingTool === "asset" ? ASSET_RASTER_SIZE : BUILD_GRID_SIZE) : 80;
    const gridColor = dark
      ? this.editing ? "#d9d2eb25" : "#d9d2eb10"
      : this.editing ? "#766f6728" : "#766f6713";
    const startX = this.editing ? outdoorBounds.x : 0;
    const startY = this.editing ? outdoorBounds.y : 0;
    const endX = this.editing ? outdoorBounds.x + outdoorBounds.width : this.floor.width;
    const endY = this.editing ? outdoorBounds.y + outdoorBounds.height : this.floor.height;
    for (let x = startX; x <= endX; x += gridSize) {
      grid.moveTo(x, startY).lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      grid.moveTo(startX, y).lineTo(endX, y);
    }
    grid.stroke({ color: gridColor, width: 1 });
    this.layoutLayer.addChild(grid);

    if (this.layout.tiles.length > 0) {
      const tiles = new Graphics();
      for (const tile of this.layout.tiles) {
        tiles.rect(tile.x, tile.y, 32, 32).fill(dark ? mixHex(tile.color, "#171922", 0.58) : tile.color);
      }
      this.layoutLayer.addChild(tiles);
    }
    for (const room of this.layout.rooms) {
      const roomGraphic = new Graphics();
      for (const rect of room.footprint) {
        roomGraphic.rect(rect.x, rect.y, rect.width, rect.height);
      }
      roomGraphic
        .fill({ color: dark ? mixHex(room.color, "#20222d", 0.62) : room.color, alpha: dark ? 0.82 : 0.7 })
        .stroke({ color: "#ffffff", width: 1, alpha: dark ? 0.12 : 0.26 });
      this.layoutLayer.addChild(roomGraphic);
    }

    for (const object of this.layout.objects) {
      if (requireAssetDefinition(object.assetId).placement.layer === "ground") {
        this.drawObject(object);
      }
    }

    for (const room of this.layout.rooms) {
      const label = new Text({
        text: room.name,
        style: { fontFamily: "Inter, Segoe UI, sans-serif", fontSize: 14, fontWeight: "700", fill: dark ? "#f1edf7" : "#3b3742" },
      });
      const labelX = room.bounds.x + 15;
      const labelY = room.bounds.y + 13;
      label.position.set(labelX + 8, labelY + 5);
      const labelPlate = new Graphics()
        .roundRect(labelX, labelY, label.width + 16, label.height + 10, 8)
        .fill({ color: dark ? "#20212a" : "#fffdfa", alpha: dark ? 0.8 : 0.64 })
        .stroke({ color: "#ffffff", width: 1, alpha: dark ? 0.12 : 0.45 });
      this.layoutLayer.addChild(labelPlate, label);
    }

    for (const light of getOutdoorWindowLights(this.layout, this.floor)) {
      const perpendicular = { x: -light.direction.y, y: light.direction.x };
      const halfWidth = light.width * 0.42;
      const farHalfWidth = light.width * 0.62;
      this.layoutLayer.addChild(new Graphics().poly([
        light.origin.x - perpendicular.x * halfWidth,
        light.origin.y - perpendicular.y * halfWidth,
        light.origin.x + perpendicular.x * halfWidth,
        light.origin.y + perpendicular.y * halfWidth,
        light.origin.x + light.direction.x * light.depth + perpendicular.x * farHalfWidth,
        light.origin.y + light.direction.y * light.depth + perpendicular.y * farHalfWidth,
        light.origin.x + light.direction.x * light.depth - perpendicular.x * farHalfWidth,
        light.origin.y + light.direction.y * light.depth - perpendicular.y * farHalfWidth,
      ]).fill({ color: light.color, alpha: light.intensity }));
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

    const walls = this.placementLayout?.walls ?? this.layout.walls;
    const openings = this.placementLayout?.openings ?? this.layout.openings;
    const wallShadows = new Graphics();
    const wallBodies = new Graphics();
    for (const wall of walls) {
      for (const rect of getWallSolidRects(wall, openings)) {
        wallShadows.rect(rect.x + 3, rect.y + 4, rect.width, rect.height).fill({ color: "#11121a", alpha: dark ? 0.34 : 0.14 });
        wallBodies
          .roundRect(rect.x, rect.y, rect.width, rect.height, 3)
          .fill(dark ? "#555461" : "#4b4853")
          .stroke({ color: "#ffffff", width: 1, alpha: dark ? 0.16 : 0.1 });
      }
    }
    this.layoutLayer.addChild(wallShadows, wallBodies);
    const wallsById = new Map(walls.map((wall) => [wall.id, wall]));
    for (const opening of openings) {
      const wall = wallsById.get(opening.wallId);
      if (!wall) {
        continue;
      }
      const rect = getOpeningRect(wall, opening, opening.type === "door" ? 8 : WALL_THICKNESS + 4);
      if (opening.type === "window") {
        this.layoutLayer.addChild(new Graphics()
          .roundRect(rect.x, rect.y, rect.width, rect.height, 2)
          .fill({ color: dark ? "#5994ad" : "#a9d8f1", alpha: 0.94 })
          .stroke({ color: "#f3fbff", width: 2, alpha: 0.95 }));
      } else {
        const restricted = this.layout.rooms.some((room) => room.doorIds.includes(opening.id) && room.access.mode === "assigned");
        this.layoutLayer.addChild(new Graphics()
          .roundRect(rect.x, rect.y, rect.width, rect.height, 2)
          .fill(restricted ? dark ? "#806f98" : "#746588" : dark ? "#8c8992" : "#d8d0c5")
          .stroke({ color: restricted ? "#3f354d" : dark ? "#51505a" : "#817970", width: 1 }));
      }
    }
    const objects = this.layout.objects.filter((object) => requireAssetDefinition(object.assetId).placement.layer !== "ground").sort((left, right) => {
      const leftLayer = requireAssetDefinition(left.assetId).placement.layer === "surface" ? 1 : 0;
      const rightLayer = requireAssetDefinition(right.assetId).placement.layer === "surface" ? 1 : 0;
      return leftLayer - rightLayer;
    });
    for (const object of objects) {
      this.drawObject(object);
    }

    const spawn = new Graphics()
      .moveTo(this.floor.spawn.x, this.floor.spawn.y - 8)
      .lineTo(this.floor.spawn.x + 8, this.floor.spawn.y)
      .lineTo(this.floor.spawn.x, this.floor.spawn.y + 8)
      .lineTo(this.floor.spawn.x - 8, this.floor.spawn.y)
      .closePath()
      .fill({ color: "#7f70ee", alpha: dark ? 0.55 : 0.35 });
    this.layoutLayer.addChild(spawn);
  }

  private drawObject(object: WorldObject): void {
    const definition = requireAssetDefinition(object.assetId);
    const cells = getPlacedAssetCells(object);
    const bounds = getPlacedAssetBounds(object);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const variant = requireAssetVariant(definition, object.variantId);
    if (definition.kind === "floor-tile") {
      const surface = new Graphics()
        .roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 3)
        .fill(variant.color)
        .stroke({ color: variant.accentColor, width: 1, alpha: 0.72 });
      drawFloorSurfacePattern(surface, bounds, variant, object.rotation);
      this.layoutLayer.addChild(surface);
      return;
    }
    if (definition.kind === "gong") {
      this.drawGong(object, bounds, variant);
      return;
    }
    if (definition.radius) {
      const radius = new Graphics();
      drawAssetRadius(radius, bounds, definition.radius, "#6c5ce7", 0.035, 0.24);
      this.layoutLayer.addChild(radius);
    }

    const shadow = new Graphics();
    const body = new Graphics();
    const dark = this.colorTheme === "dark";
    const objectColor = dark ? mixHex(variant.color, "#171922", 0.14) : variant.color;
    for (const cell of cells) {
      shadow
        .rect(cell.worldX + 3, cell.worldY + 4, ASSET_RASTER_SIZE, ASSET_RASTER_SIZE)
        .fill({ color: "#08090e", alpha: dark ? 0.3 : 0.11 });
      if (cell.type === "foliage") {
        body
          .roundRect(cell.worldX, cell.worldY, ASSET_RASTER_SIZE, ASSET_RASTER_SIZE, 5)
          .fill({ color: objectColor, alpha: 0.96 });
      } else {
        body
          .roundRect(cell.worldX, cell.worldY, ASSET_RASTER_SIZE, ASSET_RASTER_SIZE, cell.type === "support" ? 1 : 2)
          .fill({ color: objectColor, alpha: cell.type === "support" ? 0.78 : 1 });
      }
    }
    const interactions = getPlacedAssetInteractions(object);
    this.layoutLayer.addChild(shadow, body, drawCellOutline(cells));
    this.drawObjectDetails(definition, variant, cells, bounds, interactions);

    if (interactions.length > 0) {
      const interactionGraphic = new Graphics();
      for (const interaction of interactions) {
        interactionGraphic
          .roundRect(interaction.bounds.x + 2, interaction.bounds.y + 2, interaction.bounds.width - 4, interaction.bounds.height - 4, 5)
          .stroke({ color: "#ffffff", width: 1, alpha: 0.28 });
        const vector = directionVector(interaction.direction);
        interactionGraphic
          .moveTo(interaction.center.x - vector.x * 3, interaction.center.y - vector.y * 3)
          .lineTo(interaction.center.x + vector.x * 6, interaction.center.y + vector.y * 6)
          .stroke({ color: "#ffffff", width: 2, alpha: 0.46 });
      }
      this.layoutLayer.addChild(interactionGraphic);
    }

    if (object.label) {
      const darkLabel = dark || definition.kind === "arcade" || definition.kind === "game";
      const label = new Text({
        text: object.label,
        style: {
          fontFamily: "Inter, Segoe UI, sans-serif",
          fontSize: definition.kind === "portal" ? 13 : 11,
          fontWeight: "700",
          fill: darkLabel ? "#ffffff" : "#34313b",
        },
      });
      label.anchor.set(0.5);
      const labelY = definition.kind === "portal" ? centerY : bounds.y + bounds.height - 11;
      label.position.set(centerX, labelY);
      const plate = new Graphics()
        .roundRect(centerX - label.width / 2 - 6, labelY - label.height / 2 - 3, label.width + 12, label.height + 6, 6)
        .fill({ color: darkLabel ? "#292734" : "#fffdfa", alpha: darkLabel ? 0.82 : 0.72 });
      this.layoutLayer.addChild(plate, label);
    }
  }

  private drawObjectDetails(
    definition: AssetDefinition,
    variant: AssetVariantDefinition,
    cells: PlacedAssetCell[],
    bounds: Rect,
    interactions: PlacedAssetInteraction[],
  ): void {
    const details = new Graphics();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    if (definition.id === "table-round") {
      details
        .ellipse(centerX, centerY, Math.max(8, bounds.width / 2 - 5), Math.max(8, bounds.height / 2 - 5))
        .fill({ color: "#ffffff", alpha: 0.08 })
        .stroke({ color: "#ffffff", width: 2, alpha: 0.24 })
        .circle(centerX, centerY, 5)
        .fill({ color: variant.accentColor, alpha: 0.55 });
    } else if (definition.kind === "desk" || definition.kind === "table") {
      for (const cell of cells.filter((candidate) => candidate.allows.includes("decoration"))) {
        details
          .roundRect(cell.worldX + 3, cell.worldY + 3, ASSET_RASTER_SIZE - 6, 3, 1.5)
          .fill({ color: variant.secondaryColor, alpha: 0.36 });
      }
    } else if (definition.kind === "chair" || definition.kind === "sofa") {
      for (const interaction of interactions) {
        const { x, y, width, height } = interaction.bounds;
        details
          .roundRect(x + 4, y + 4, width - 8, height - 8, 7)
          .fill({ color: variant.secondaryColor, alpha: 0.32 })
          .stroke({ color: variant.accentColor, width: 1, alpha: 0.42 });
        if (interaction.direction === "up" || interaction.direction === "down") {
          const edgeY = interaction.direction === "down" ? y + 6 : y + height - 6;
          details.moveTo(x + 6, edgeY).lineTo(x + width - 6, edgeY).stroke({ color: variant.accentColor, width: 3, alpha: 0.48 });
        } else {
          const edgeX = interaction.direction === "left" ? x + width - 6 : x + 6;
          details.moveTo(edgeX, y + 6).lineTo(edgeX, y + height - 6).stroke({ color: variant.accentColor, width: 3, alpha: 0.48 });
        }
      }
    } else if (definition.kind === "plant") {
      cells.forEach((cell, index) => {
        const offset = index % 2 === 0 ? 0 : 1;
        details
          .ellipse(cell.worldX + 6 + offset, cell.worldY + 6, 6, 4)
          .fill({ color: variant.secondaryColor, alpha: 0.95 })
          .ellipse(cell.worldX + 10, cell.worldY + 10 - offset, 4, 6)
          .fill({ color: variant.color, alpha: 0.98 })
          .circle(cell.worldX + 8, cell.worldY + 8, 2)
          .fill({ color: variant.accentColor, alpha: 0.8 });
      });
      const potWidth = Math.min(20, Math.max(10, bounds.width - 8));
      details
        .roundRect(centerX - potWidth / 2, bounds.y + bounds.height - 8, potWidth, 8, 3)
        .fill({ color: mixHex(variant.accentColor, "#8b5f45", 0.45), alpha: 0.94 });
    } else if (definition.kind === "garden") {
      cells.forEach((cell, index) => {
        const flower = ["#f4b942", "#ef8372", "#d9b6ed"][index % 3]!;
        details
          .ellipse(cell.worldX + 5, cell.worldY + 7, 4, 3).fill("#7fb77d")
          .ellipse(cell.worldX + 11, cell.worldY + 10, 3, 4).fill("#5f9d70")
          .circle(cell.worldX + 9, cell.worldY + 5, 2.3).fill(flower);
      });
    } else if (definition.kind === "pool") {
      details
        .roundRect(bounds.x + 6, bounds.y + 6, bounds.width - 12, bounds.height - 12, 13)
        .fill(variant.secondaryColor)
        .stroke({ color: variant.accentColor, width: 3, alpha: 0.75 });
      for (let y = bounds.y + 28; y < bounds.y + bounds.height - 14; y += 28) {
        details
          .moveTo(bounds.x + 20, y)
          .bezierCurveTo(bounds.x + bounds.width * 0.34, y - 8, bounds.x + bounds.width * 0.4, y + 8, bounds.x + bounds.width * 0.54, y)
          .bezierCurveTo(bounds.x + bounds.width * 0.68, y - 8, bounds.x + bounds.width * 0.75, y + 8, bounds.x + bounds.width - 20, y)
          .stroke({ color: "#f4fbff", width: 3, alpha: 0.66 });
      }
    } else if (definition.kind === "arcade") {
      const vertical = bounds.height >= bounds.width;
      const screen = vertical
        ? { x: bounds.x + 9, y: bounds.y + 11, width: bounds.width - 18, height: Math.min(34, bounds.height * 0.38) }
        : { x: bounds.x + 11, y: bounds.y + 9, width: Math.min(34, bounds.width * 0.38), height: bounds.height - 18 };
      details
        .roundRect(screen.x, screen.y, screen.width, screen.height, 5)
        .fill(variant.secondaryColor)
        .stroke({ color: variant.accentColor, width: 2, alpha: 0.72 });
      if (vertical) {
        details.circle(bounds.x + 18, bounds.y + bounds.height * 0.62, 4).fill("#ff7a66");
        details.circle(bounds.x + bounds.width - 18, bounds.y + bounds.height * 0.62, 4).fill("#f4b942");
      } else {
        details.circle(bounds.x + bounds.width * 0.62, bounds.y + 18, 4).fill("#ff7a66");
        details.circle(bounds.x + bounds.width * 0.62, bounds.y + bounds.height - 18, 4).fill("#f4b942");
      }
    } else if (definition.kind === "portal") {
      details
        .roundRect(bounds.x + 7, bounds.y + 7, bounds.width - 14, bounds.height - 14, 10)
        .stroke({ color: variant.secondaryColor, width: 3, alpha: 0.95 })
        .roundRect(bounds.x + 14, bounds.y + 14, bounds.width - 28, bounds.height - 28, 7)
        .stroke({ color: variant.accentColor, width: 2, alpha: 0.9 });
    } else if (definition.kind === "laptop") {
      details
        .roundRect(bounds.x + 3, bounds.y + 2, bounds.width - 6, bounds.height - 5, 2)
        .fill(variant.accentColor)
        .stroke({ color: variant.secondaryColor, width: 2, alpha: 0.88 })
        .moveTo(bounds.x + 2, bounds.y + bounds.height - 2)
        .lineTo(bounds.x + bounds.width - 2, bounds.y + bounds.height - 2)
        .stroke({ color: "#d4d9df", width: 2, alpha: 0.8 });
    } else if (definition.kind === "monitor") {
      const horizontal = bounds.width >= bounds.height;
      const screen = horizontal
        ? { x: bounds.x + 3, y: bounds.y + 2, width: bounds.width - 6, height: bounds.height - 5 }
        : { x: bounds.x + 2, y: bounds.y + 3, width: bounds.width - 5, height: bounds.height - 6 };
      details
        .roundRect(screen.x, screen.y, screen.width, screen.height, 2)
        .fill(variant.accentColor)
        .stroke({ color: variant.secondaryColor, width: 2, alpha: 0.82 })
        .circle(centerX, centerY, 2)
        .fill({ color: "#d7f5fb", alpha: 0.9 });
    } else if (definition.kind === "coffee") {
      details
        .circle(centerX, centerY, 5.5)
        .fill(variant.secondaryColor)
        .stroke({ color: variant.accentColor, width: 1.5, alpha: 0.85 })
        .circle(centerX + 6, centerY, 3.5)
        .stroke({ color: variant.secondaryColor, width: 2, alpha: 0.95 })
        .circle(centerX, centerY, 2.7)
        .fill(variant.accentColor);
    } else if (definition.kind === "lamp") {
      details
        .circle(centerX, centerY, 10).fill({ color: variant.secondaryColor, alpha: 0.24 })
        .circle(centerX, centerY, 6).fill(variant.secondaryColor)
        .stroke({ color: "#ffffff", width: 2, alpha: 0.72 });
    } else if (definition.kind === "bookshelf") {
      const horizontal = bounds.width >= bounds.height;
      details
        .roundRect(bounds.x + 3, bounds.y + 3, bounds.width - 6, bounds.height - 6, 3)
        .fill({ color: variant.accentColor, alpha: 0.62 })
        .stroke({ color: variant.secondaryColor, width: 2, alpha: 0.62 });
      const bookColors = ["#d96f67", "#e2b458", "#6b91c8", "#71a47d", "#a77bc0"];
      if (horizontal) {
        for (let x = bounds.x + 8, index = 0; x < bounds.x + bounds.width - 7; x += 11, index += 1) {
          details.roundRect(x, bounds.y + 6 + index % 2, 7, bounds.height - 12 - index % 2, 1).fill(bookColors[index % bookColors.length]!);
        }
      } else {
        for (let y = bounds.y + 8, index = 0; y < bounds.y + bounds.height - 7; y += 11, index += 1) {
          details.roundRect(bounds.x + 6 + index % 2, y, bounds.width - 12 - index % 2, 7, 1).fill(bookColors[index % bookColors.length]!);
        }
      }
    } else if (definition.kind === "whiteboard") {
      const horizontal = bounds.width >= bounds.height;
      details
        .roundRect(bounds.x + 3, bounds.y + 3, bounds.width - 6, bounds.height - 6, 3)
        .fill(variant.secondaryColor)
        .stroke({ color: variant.accentColor, width: 2 });
      if (horizontal) {
        details.moveTo(bounds.x + 13, centerY - 2).lineTo(bounds.x + bounds.width * 0.52, centerY - 2).stroke({ color: "#8294c7", width: 2, alpha: 0.72 });
        details.moveTo(bounds.x + bounds.width * 0.6, centerY + 2).lineTo(bounds.x + bounds.width - 14, centerY + 2).stroke({ color: "#e68a76", width: 2, alpha: 0.72 });
      } else {
        details.moveTo(centerX - 2, bounds.y + 13).lineTo(centerX - 2, bounds.y + bounds.height * 0.52).stroke({ color: "#8294c7", width: 2, alpha: 0.72 });
        details.moveTo(centerX + 2, bounds.y + bounds.height * 0.6).lineTo(centerX + 2, bounds.y + bounds.height - 14).stroke({ color: "#e68a76", width: 2, alpha: 0.72 });
      }
    } else if (definition.kind === "game") {
      details
        .roundRect(bounds.x + 7, bounds.y + 7, bounds.width - 14, bounds.height - 14, 10)
        .stroke({ color: variant.secondaryColor, width: 2, alpha: 0.64 });
      const blockColors = ["#5b8def", "#f4b942", "#ff7a66", "#25b99a"];
      [[1, 0], [0, 1], [1, 1], [2, 1]].forEach(([column = 0, row = 0], index) => {
        details
          .roundRect(centerX - 29 + column * 20, centerY - 22 + row * 20, 18, 18, 4)
          .fill(blockColors[index]!)
          .stroke({ color: "#ffffff", width: 1, alpha: 0.36 });
      });
    }

    this.layoutLayer.addChild(details);
  }

  private drawGong(object: WorldObject, bounds: Rect, variant: AssetVariantDefinition): void {
    const container = new Container();
    container.position.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    const shadow = new Graphics()
      .roundRect(-34, 31, 68, 7, 3)
      .fill({ color: "#24212d", alpha: 0.16 });
    shadow.position.set(3, 3);
    const stand = new Graphics()
      .roundRect(-32, -35, 64, 7, 3).fill(variant.accentColor)
      .roundRect(-31, -31, 7, 64, 3).fill(variant.accentColor)
      .roundRect(24, -31, 7, 64, 3).fill(variant.accentColor)
      .roundRect(-38, 29, 22, 7, 3).fill(variant.color)
      .roundRect(16, 29, 22, 7, 3).fill(variant.color)
      .circle(0, -29, 3).fill(variant.secondaryColor);
    const disc = new Container();
    disc.addChild(
      new Graphics()
        .circle(0, 0, 24)
        .fill(variant.color)
        .stroke({ color: variant.secondaryColor, width: 3, alpha: 0.95 })
        .circle(0, 0, 7)
        .fill(variant.accentColor)
        .stroke({ color: variant.secondaryColor, width: 2 })
        .moveTo(-12, -12)
        .lineTo(6, -18)
        .stroke({ color: "#ffffff", width: 3, alpha: 0.42 }),
    );
    disc.pivot.set(0, -27);
    disc.position.set(0, -27);
    const mallet = new Container();
    mallet.position.set(34, -5);
    mallet.rotation = 0.38;
    mallet.addChild(new Graphics()
      .roundRect(-2, -15, 4, 29, 2).fill(variant.accentColor)
      .circle(0, -16, 7).fill(variant.secondaryColor).stroke({ color: "#ffffff", width: 1, alpha: 0.32 }));
    container.addChild(shadow, stand, disc, mallet);
    this.layoutLayer.addChild(container);
    this.gongViews.set(object.id, {
      disc,
      mallet,
      ringStartedAt: 0,
      ringUntil: 0,
    });
  }

  private createPlayerView(member: Member, current: boolean): PlayerView {
    const container = new Container();
    const proximity = new Graphics();
    const wave = new Graphics().circle(0, 0, 24).stroke({ color: member.color, width: 3 });
    wave.alpha = 0;
    const shadow = new Graphics().roundRect(-14, -11, 32, 32, 7).fill({ color: "#24212d", alpha: 0.18 });
    const square = new Graphics().roundRect(-16, -16, 32, 32, 7).fill(member.color).stroke({ color: current ? "#ffffff" : "#ffffffcc", width: current ? 3 : 2 });
    const avatarImage = new Container();
    const initials = new Text({ text: member.initials, style: { fontFamily: "Inter, Segoe UI, sans-serif", fontSize: 10, fontWeight: "800", fill: "#ffffff" } });
    initials.anchor.set(0.5);
    const facing = new Graphics()
      .poly([-4, -10, 0, -15, 4, -10])
      .fill({ color: "#ffffff", alpha: 0.9 });
    const name = new Text({ text: current ? "You" : member.name.split(" ")[0] ?? member.name, style: { fontFamily: "Inter, Segoe UI, sans-serif", fontSize: 11, fontWeight: "600", fill: this.colorTheme === "dark" ? "#f4f1f8" : "#292731" } });
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
    container.addChild(proximity, wave, shadow, square, avatarImage, initials, facing, name, status, reactionBubble);
    const view: PlayerView = {
      container,
      proximity,
      status,
      facing,
      wave,
      avatarImage,
      initials,
      name,
      avatarUrl: member.avatarUrl,
      reactionBubble,
      reactionText,
      reactionStartedAt: 0,
      reactionUntil: 0,
      targetX: 0,
      targetY: 0,
      wavingUntil: 0,
    };
    if (member.avatarUrl) {
      void this.loadPlayerAvatar(view, member.avatarUrl);
    }
    return view;
  }

  private applyPlayerTheme(): void {
    const fill = this.colorTheme === "dark" ? "#f4f1f8" : "#292731";
    for (const view of this.playerViews.values()) {
      view.name.style.fill = fill;
    }
  }

  private async loadPlayerAvatar(view: PlayerView, avatarUrl: string): Promise<void> {
    try {
      const image = new Image();
      image.crossOrigin = "use-credentials";
      const texture = await new Promise<Texture>((resolve, reject) => {
        image.onload = () => resolve(Texture.from(image));
        image.onerror = () => reject(new Error("Avatar image request failed."));
        image.src = resolveServerUrl(avatarUrl);
      });
      if (view.container.destroyed || view.avatarUrl !== avatarUrl) {
        texture.destroy(true);
        return;
      }
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.width = 32;
      sprite.height = 32;
      const mask = new Graphics().roundRect(-16, -16, 32, 32, 7).fill("#ffffff");
      sprite.mask = mask;
      view.initials.visible = false;
      view.avatarImage.addChild(sprite, mask);
    } catch (error) {
      console.error("Avatar could not be loaded.", error);
    }
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
    for (const view of this.gongViews.values()) {
      if (now >= view.ringUntil) {
        view.disc.rotation = 0;
        view.disc.x = 0;
        view.mallet.rotation = 0.38;
        continue;
      }
      const elapsed = now - view.ringStartedAt;
      const decay = Math.max(0, 1 - elapsed / 1_650);
      const swing = Math.sin(elapsed / 72) * decay;
      view.disc.rotation = swing * 0.16;
      view.disc.x = swing * 4;
      const strike = Math.min(1, elapsed / 170);
      const rebound = Math.max(0, Math.min(1, (elapsed - 170) / 360));
      view.mallet.rotation = 0.38 - strike * 0.92 + rebound * 0.92;
    }
    for (const view of this.gongCelebrationViews.values()) {
      const elapsed = now - view.startedAt;
      const seconds = Math.max(0, elapsed / 1_000);
      view.container.visible = now < view.expiresAt;
      for (const [index, ring] of view.rings.entries()) {
        const ringProgress = Math.max(0, Math.min(1, (elapsed - index * 170) / 2_050));
        const eased = 1 - Math.pow(1 - ringProgress, 3);
        ring.visible = ringProgress > 0 && ringProgress < 1;
        ring.alpha = Math.pow(1 - ringProgress, 1.6) * 0.82;
        ring.clear()
          .circle(0, 0, Math.max(1, view.maxRadius * eased))
          .stroke({ color: "#f4b942", width: 4, alpha: 0.82 });
      }
      const confettiFade = Math.max(0, Math.min(1, (1_900 - elapsed) / 430));
      for (const particle of view.confetti) {
        particle.graphic.visible = elapsed < 1_900;
        particle.graphic.alpha = confettiFade;
        particle.graphic.position.set(
          particle.startX + particle.velocityX * seconds,
          particle.startY + particle.velocityY * seconds + 190 * seconds * seconds,
        );
        particle.graphic.rotation = particle.rotationSpeed * seconds;
      }
    }
    if (this.cameraMode === "free") {
      this.applyFreeCameraTransform();
      return;
    }
    const focus = this.playerViews.get(this.cameraUserId) ?? this.playerViews.get(this.currentUserId);
    const target = this.constrainCameraCenter({
      x: focus?.container.x ?? (this.floor ? this.floor.width / 2 : 0),
      y: focus?.container.y ?? (this.floor ? this.floor.height / 2 : 0),
    });
    const desiredX = this.app.screen.width / 2 - target.x * this.zoom;
    const desiredY = this.app.screen.height / 2 - target.y * this.zoom;
    const nextCenter = this.constrainCameraCenter({
      x: (this.app.screen.width / 2 - (this.world.position.x + (desiredX - this.world.position.x) * 0.14)) / this.zoom,
      y: (this.app.screen.height / 2 - (this.world.position.y + (desiredY - this.world.position.y) * 0.14)) / this.zoom,
    });
    this.world.scale.set(this.zoom);
    this.world.position.set(
      this.app.screen.width / 2 - nextCenter.x * this.zoom,
      this.app.screen.height / 2 - nextCenter.y * this.zoom,
    );
  };

  private isObjectVisible(bounds: Rect): boolean {
    const padding = 20;
    const left = this.world.position.x + bounds.x * this.zoom;
    const top = this.world.position.y + bounds.y * this.zoom;
    const right = left + bounds.width * this.zoom;
    const bottom = top + bounds.height * this.zoom;
    return right >= -padding
      && bottom >= -padding
      && left <= this.app.screen.width + padding
      && top <= this.app.screen.height + padding;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const mousePointerActive = [...this.activePointers.values()].some((pointer) => pointer.pointerType === "mouse");
    if (
      (event.pointerType === "mouse" && (event.button !== 0 && event.button !== 1))
      || (event.pointerType !== "mouse" && event.button !== 0)
      || this.activePointers.has(event.pointerId)
      || (this.activePointers.size > 0 && (event.pointerType === "mouse" || mousePointerActive))
    ) {
      return;
    }
    event.preventDefault();
    this.app.canvas.parentElement?.focus({ preventScroll: true });
    const pointer = this.getPointer(event);
    this.activePointers.set(event.pointerId, pointer);
    this.app.canvas.setPointerCapture(event.pointerId);
    if (this.activePointers.size > 1) {
      this.multiPointerGesture = true;
      this.panning = false;
      this.setPinchReference();
      return;
    }
    this.activePointerId = event.pointerId;
    this.pointerStart.x = event.clientX;
    this.pointerStart.y = event.clientY;
    this.lastPointer.x = pointer.screenX;
    this.lastPointer.y = pointer.screenY;
    this.panning = event.pointerType === "mouse" && (event.button === 1 || event.shiftKey);
    if (this.panning) {
      this.app.canvas.style.cursor = "grabbing";
      return;
    }
    if (event.pointerType === "mouse") {
      this.touchPlacement = false;
      this.hoverPointIsTouch = false;
      this.hoverPoint = this.toWorld(event.clientX, event.clientY);
      if (this.editing) {
        this.drawPlacementPreview(this.hoverPoint);
      }
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const trackedPointer = this.activePointers.get(event.pointerId);
    if (!trackedPointer) {
      if (this.activePointers.size === 0 && event.pointerType !== "touch") {
        this.touchPlacement = false;
        this.hoverPointIsTouch = false;
        const point = this.toWorld(event.clientX, event.clientY);
        this.hoverPoint = this.editing && event.pointerType !== "mouse"
          ? this.resolveTouchBuildPoint(point)
          : point;
      }
      if (this.activePointers.size === 0 && this.editing && this.hoverPoint) {
        this.drawPlacementPreview(this.hoverPoint);
      }
      return;
    }
    event.preventDefault();
    const pointer = this.getPointer(event);
    this.activePointers.set(event.pointerId, pointer);
    if (this.multiPointerGesture && this.activePointers.size > 1) {
      this.updateMultiPointerGesture();
      return;
    }
    if (this.activePointerId !== event.pointerId) {
      return;
    }
    const threshold = event.pointerType === "mouse" ? MOUSE_DRAG_THRESHOLD : TOUCH_DRAG_THRESHOLD;
    if (!this.panning && Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > threshold) {
      this.panning = true;
      this.app.canvas.style.cursor = "grabbing";
    }
    if (this.panning) {
      const deltaX = pointer.screenX - this.lastPointer.x;
      const deltaY = pointer.screenY - this.lastPointer.y;
      if (deltaX !== 0 || deltaY !== 0) {
        this.panCamera(deltaX, deltaY);
      }
      this.lastPointer.x = pointer.screenX;
      this.lastPointer.y = pointer.screenY;
      return;
    }
    if (event.pointerType === "touch") {
      return;
    }
    const point = this.toWorld(event.clientX, event.clientY);
    this.hoverPoint = this.editing && event.pointerType !== "mouse"
      ? this.resolveTouchBuildPoint(point)
      : point;
    if (this.buildStart && this.editingTool === "wall") {
      const deltaX = this.hoverPoint.x - this.buildStart.x;
      const deltaY = this.hoverPoint.y - this.buildStart.y;
      if (!this.buildOrientation && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 4) {
        this.buildOrientation = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
      }
      this.drawWallPreview(wallEdit(this.buildStart, this.hoverPoint, this.buildOrientation));
      return;
    }
    if (this.editing) {
      this.drawPlacementPreview(this.hoverPoint);
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.activePointers.has(event.pointerId)) {
      return;
    }
    event.preventDefault();
    const pointer = this.getPointer(event);
    this.activePointers.set(event.pointerId, pointer);
    if (this.multiPointerGesture && this.activePointers.size > 1) {
      this.updateMultiPointerGesture();
    } else if (this.activePointerId === event.pointerId && this.panning) {
      this.panCamera(pointer.screenX - this.lastPointer.x, pointer.screenY - this.lastPointer.y);
    }
    this.activePointers.delete(event.pointerId);
    if (this.app.canvas.hasPointerCapture(event.pointerId)) {
      this.app.canvas.releasePointerCapture(event.pointerId);
    }
    if (this.multiPointerGesture) {
      this.continueMultiPointerGesture();
      return;
    }
    if (this.activePointerId !== event.pointerId) {
      return;
    }
    this.activePointerId = undefined;
    const threshold = event.pointerType === "mouse" ? MOUSE_DRAG_THRESHOLD : TOUCH_DRAG_THRESHOLD;
    const moved = Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y);
    if (!this.panning && moved > threshold) {
      this.panning = true;
      this.panCamera(pointer.screenX - this.lastPointer.x, pointer.screenY - this.lastPointer.y);
    }
    this.app.canvas.style.removeProperty("cursor");
    if (this.buildStart && this.editingTool === "wall" && !this.panning) {
      const point = this.toWorld(event.clientX, event.clientY);
      this.hoverPoint = point;
      this.hoverPointIsTouch = event.pointerType === "touch";
      const edit = wallEdit(this.buildStart, point, this.buildOrientation);
      const valid = this.drawWallPreview(edit);
      delete this.buildStart;
      delete this.buildOrientation;
      this.buildPreview.clear();
      this.panning = false;
      if (this.cameraMode === "follow") {
        this.cameraUserId = this.currentUserId;
      }
      if (valid) {
        this.callbacks.current.onEdit(edit);
      }
      return;
    }
    const wasPanning = this.panning;
    this.panning = false;
    if (wasPanning || moved > threshold || !this.layout) {
      return;
    }
    if (this.cameraMode === "follow") {
      this.cameraUserId = this.currentUserId;
    }
    const pointerPoint = this.toWorld(event.clientX, event.clientY);
    if (this.editing) {
      const point = event.pointerType === "mouse" ? pointerPoint : this.resolveTouchBuildPoint(pointerPoint);
      this.hoverPoint = point;
      this.hoverPointIsTouch = event.pointerType === "touch";
      this.drawPlacementPreview(point);
      if (this.movingBuildItem) {
        if (this.movingBuildItem.type === "asset" && event.pointerType !== "mouse") {
          this.touchPlacement = true;
          return;
        }
        this.touchPlacement = false;
        this.placeMovingItem(point);
        return;
      }
      if (this.editingTool === "asset") {
        if (event.pointerType !== "mouse") {
          this.touchPlacement = true;
          return;
        }
        this.touchPlacement = false;
        this.commitAssetPlacement();
      } else if (this.editingTool === "wall") {
        this.buildStart = {
          x: snapToBuildGrid(point.x),
          y: snapToBuildGrid(point.y),
        };
        delete this.buildOrientation;
        this.drawWallPreview(wallEdit(this.buildStart, this.buildStart));
      } else if (this.editingTool === "door" || this.editingTool === "window") {
        if (this.drawOpeningPreview(this.editingTool, point)) {
          this.callbacks.current.onEdit({ tool: this.editingTool, position: point });
        }
      } else if (this.editingTool === "erase") {
        this.callbacks.current.onEdit({ tool: this.editingTool, position: point });
      } else if (!this.editingTool) {
        this.selectBuildItem(point, event.pointerType === "mouse" ? 0 : this.getTouchTargetWorldSize());
      }
      return;
    }
    const anchor = this.toViewport(event.clientX, event.clientY);
    const touchTargetSize = this.getTouchTargetWorldSize();
    const playerTargetRadius = event.pointerType === "mouse"
      ? 28
      : Math.max(28, touchTargetSize / 2);
    const player = [...this.playerViews.entries()].reverse().find(
      ([userId, view]) => userId !== this.currentUserId
        && Math.hypot(pointerPoint.x - view.container.x, pointerPoint.y - view.container.y) <= playerTargetRadius,
    );
    if (player) {
      this.callbacks.current.onPlayerSelect(player[0], anchor);
      return;
    }
    const target = resolveWorldPointTarget(
      this.layout,
      pointerPoint.x,
      pointerPoint.y,
      event.pointerType === "mouse" ? 0 : touchTargetSize,
    );
    if (target.type === "object") {
      this.callbacks.current.onObjectSelect(target.object, target.interactionId, anchor);
      return;
    }
    this.callbacks.current.onDestination(target.x, target.y);
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (!this.activePointers.has(event.pointerId)) {
      return;
    }
    this.cancelPointerInteraction();
  };

  private readonly handleLostPointerCapture = (event: PointerEvent): void => {
    if (this.activePointers.has(event.pointerId)) {
      this.cancelPointerInteraction();
    }
  };

  private readonly handlePointerLeave = (): void => {
    if (this.activePointers.size === 0 && !this.touchPlacement) {
      delete this.hoverPoint;
      this.hoverPointIsTouch = false;
      this.buildPreview.clear();
      this.updateAssetPreviewState(false, false);
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!Number.isFinite(event.deltaY) || event.deltaY === 0) {
      return;
    }
    event.preventDefault();
    const deltaMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.app.screen.height : 1;
    const nextZoom = clampCameraZoom(this.zoom * Math.exp(-event.deltaY * deltaMultiplier * 0.0015));
    if (nextZoom === this.zoom) {
      return;
    }
    if (this.cameraMode === "follow") {
      this.zoomBy(nextZoom - this.zoom);
      return;
    }
    const screenPoint = this.toScreen(event.clientX, event.clientY);
    const worldPoint = this.toWorldFromScreen(screenPoint);
    this.zoom = nextZoom;
    this.freeCameraX = worldPoint.x - (screenPoint.x - this.app.screen.width / 2) / this.zoom;
    this.freeCameraY = worldPoint.y - (screenPoint.y - this.app.screen.height / 2) / this.zoom;
    this.applyFreeCameraTransform();
    this.refreshPlacementPreview();
  };

  private getPointer(event: PointerEvent): ActivePointer {
    const screenPoint = this.toScreen(event.clientX, event.clientY);
    return {
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: screenPoint.x,
      screenY: screenPoint.y,
      pointerType: event.pointerType,
    };
  }

  private panCamera(deltaX: number, deltaY: number): void {
    if (deltaX === 0 && deltaY === 0) {
      return;
    }
    this.startFreeCameraMovement();
    this.freeCameraX -= deltaX / this.zoom;
    this.freeCameraY -= deltaY / this.zoom;
    this.applyFreeCameraTransform();
  }

  private setPinchReference(): void {
    const [first, second] = [...this.activePointers.values()];
    if (!first || !second) {
      delete this.pinchCenter;
      this.pinchDistance = 0;
      return;
    }
    this.pinchCenter = {
      x: (first.screenX + second.screenX) / 2,
      y: (first.screenY + second.screenY) / 2,
    };
    this.pinchDistance = Math.hypot(second.screenX - first.screenX, second.screenY - first.screenY);
  }

  private updateMultiPointerGesture(): void {
    const [first, second] = [...this.activePointers.values()];
    if (!first || !second || !this.pinchCenter) {
      this.setPinchReference();
      return;
    }
    const center = {
      x: (first.screenX + second.screenX) / 2,
      y: (first.screenY + second.screenY) / 2,
    };
    const distance = Math.hypot(second.screenX - first.screenX, second.screenY - first.screenY);
    const centerMoved = Math.hypot(center.x - this.pinchCenter.x, center.y - this.pinchCenter.y);
    const nextZoom = this.pinchDistance > 0 && distance > 0
      ? clampCameraZoom(this.zoom * distance / this.pinchDistance)
      : this.zoom;
    if (
      centerMoved > MULTI_POINTER_MOVE_THRESHOLD
      || Math.abs(nextZoom - this.zoom) > MULTI_POINTER_ZOOM_THRESHOLD
    ) {
      const worldPoint = this.toWorldFromScreen(this.pinchCenter);
      this.startFreeCameraMovement();
      const previousZoom = this.zoom;
      this.zoom = nextZoom;
      this.freeCameraX = worldPoint.x - (center.x - this.app.screen.width / 2) / this.zoom;
      this.freeCameraY = worldPoint.y - (center.y - this.app.screen.height / 2) / this.zoom;
      this.applyFreeCameraTransform();
      if (this.zoom !== previousZoom) {
        this.refreshPlacementPreview();
      }
      this.panning = true;
    }
    this.pinchCenter = center;
    this.pinchDistance = distance;
  }

  private continueMultiPointerGesture(): void {
    if (this.activePointers.size === 0) {
      this.activePointerId = undefined;
      this.multiPointerGesture = false;
      this.panning = false;
      delete this.pinchCenter;
      this.pinchDistance = 0;
      this.app.canvas.style.removeProperty("cursor");
      return;
    }
    if (this.activePointers.size > 1) {
      this.setPinchReference();
      return;
    }
    const [pointerId, pointer] = [...this.activePointers.entries()][0]!;
    this.activePointerId = pointerId;
    this.pointerStart.x = pointer.clientX;
    this.pointerStart.y = pointer.clientY;
    this.lastPointer.x = pointer.screenX;
    this.lastPointer.y = pointer.screenY;
    this.panning = true;
    delete this.pinchCenter;
    this.pinchDistance = 0;
  }

  private cancelPointerInteraction(): void {
    const pointerIds = [...this.activePointers.keys()];
    this.activePointers.clear();
    for (const pointerId of pointerIds) {
      if (this.app.canvas.hasPointerCapture(pointerId)) {
        this.app.canvas.releasePointerCapture(pointerId);
      }
    }
    this.activePointerId = undefined;
    this.multiPointerGesture = false;
    this.panning = false;
    delete this.pinchCenter;
    this.pinchDistance = 0;
    delete this.buildStart;
    delete this.buildOrientation;
    delete this.hoverPoint;
    this.hoverPointIsTouch = false;
    this.buildPreview.clear();
    this.touchPlacement = false;
    this.updateAssetPreviewState(false, false);
    this.app.canvas.style.removeProperty("cursor");
  }

  private startFreeCameraMovement(): void {
    if (this.cameraMode === "free") {
      return;
    }
    const center = this.constrainCameraCenter({
      x: (this.app.screen.width / 2 - this.world.position.x) / this.zoom,
      y: (this.app.screen.height / 2 - this.world.position.y) / this.zoom,
    });
    this.freeCameraX = center.x;
    this.freeCameraY = center.y;
    this.updateCameraMode("free");
  }

  private applyFreeCameraTransform(): void {
    const center = this.constrainCameraCenter({ x: this.freeCameraX, y: this.freeCameraY });
    this.freeCameraX = center.x;
    this.freeCameraY = center.y;
    this.world.scale.set(this.zoom);
    this.world.position.set(
      this.app.screen.width / 2 - center.x * this.zoom,
      this.app.screen.height / 2 - center.y * this.zoom,
    );
  }

  private constrainCameraCenter(center: { x: number; y: number }): { x: number; y: number } {
    if (!this.floor) {
      return center;
    }
    const bounds = getOutdoorBounds(this.floor);
    return {
      x: constrainCameraAxis(center.x, bounds.x, bounds.width, this.app.screen.width / this.zoom),
      y: constrainCameraAxis(center.y, bounds.y, bounds.height, this.app.screen.height / this.zoom),
    };
  }

  private refreshPlacementPreview(): void {
    if (this.editing && this.hoverPoint) {
      this.drawPlacementPreview(this.hoverPoint);
    }
  }

  private updateCameraMode(mode: CameraMode): void {
    if (this.cameraMode === mode) {
      return;
    }
    this.cameraMode = mode;
    this.callbacks.current.onCameraModeChange(mode);
  }

  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    return this.toWorldFromScreen(this.toScreen(clientX, clientY));
  }

  private toScreen(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (rect.width > 0 ? this.app.screen.width / rect.width : 1),
      y: (clientY - rect.top) * (rect.height > 0 ? this.app.screen.height / rect.height : 1),
    };
  }

  private toWorldFromScreen(screenPoint: { x: number; y: number }): { x: number; y: number } {
    return {
      x: (screenPoint.x - this.world.position.x) / this.zoom,
      y: (screenPoint.y - this.world.position.y) / this.zoom,
    };
  }

  private getTouchTargetWorldSize(): number {
    const rect = this.app.canvas.getBoundingClientRect();
    const horizontalScale = this.app.screen.width > 0 ? rect.width / this.app.screen.width : 1;
    const verticalScale = this.app.screen.height > 0 ? rect.height / this.app.screen.height : 1;
    return MIN_TOUCH_TARGET_SIZE / this.zoom / Math.max(Number.EPSILON, Math.min(horizontalScale, verticalScale));
  }

  private toViewport(clientX: number, clientY: number): ContextAnchor {
    const rect = this.app.canvas.getBoundingClientRect();
    const horizontalMargin = Math.min(230, rect.width / 2);
    return {
      x: Math.max(horizontalMargin, Math.min(rect.width - horizontalMargin, clientX - rect.left)),
      y: Math.max(84, Math.min(rect.height - 16, clientY - rect.top)),
    };
  }

  private drawPlacementPreview(point: { x: number; y: number }): void {
    if (!this.editing) {
      this.buildPreview.clear();
      this.updateAssetPreviewState(false, false);
      return;
    }
    if (this.movingBuildItem?.type === "asset") {
      const candidate = this.createAssetCandidate(point);
      if (candidate) {
        this.drawAssetPreview(candidate);
      } else {
        this.updateAssetPreviewState(false, false);
      }
      return;
    }
    if (this.movingBuildItem?.type === "wall") {
      const candidate = this.createMovingWall(point);
      if (candidate) {
        this.drawWallCandidate(candidate, new Set([this.movingBuildItem.id]));
      }
      return;
    }
    if (this.movingBuildItem?.type === "opening") {
      const opening = this.layout?.openings.find((candidate) => candidate.id === this.movingBuildItem?.id);
      if (opening) {
        this.drawOpeningPreview(opening.type, point, new Set([opening.id]));
      }
      return;
    }
    if (this.editingTool === "asset") {
      const candidate = this.createAssetCandidate(point);
      if (candidate) {
        this.drawAssetPreview(candidate);
      } else {
        this.updateAssetPreviewState(false, false);
      }
      return;
    }
    if (this.editingTool === "door" || this.editingTool === "window") {
      this.drawOpeningPreview(this.editingTool, point);
      return;
    }
    if (this.editingTool === "wall") {
      this.updateAssetPreviewState(false, false);
      if (this.buildStart) {
        const deltaX = point.x - this.buildStart.x;
        const deltaY = point.y - this.buildStart.y;
        if (!this.buildOrientation && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 4) {
          this.buildOrientation = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
        }
        this.drawWallPreview(wallEdit(this.buildStart, point, this.buildOrientation));
        return;
      }
      this.buildPreview.clear()
        .circle(snapToBuildGrid(point.x), snapToBuildGrid(point.y), 6)
        .fill({ color: "#5143bd", alpha: 0.75 })
        .stroke({ color: "#ffffff", width: 2, alpha: 0.95 });
      return;
    }
    this.buildPreview.clear();
    this.updateAssetPreviewState(false, false);
  }

  private createAssetCandidate(point: { x: number; y: number }): WorldObject | undefined {
    if (!this.layout || !this.floor) {
      return undefined;
    }
    const movingObject = this.movingBuildItem?.type === "asset"
      ? this.layout.objects.find((object) => object.id === this.movingBuildItem?.id)
      : undefined;
    const assetId = movingObject?.assetId ?? this.editingAssetId;
    const definition = getAssetDefinition(assetId);
    if (!definition) {
      return undefined;
    }
    const position = getCenteredAssetPosition(definition, this.editingAssetRotation, point);
    return {
      ...(movingObject ?? { id: "preview", floorId: this.floor.id, assetId }),
      x: position.x,
      y: position.y,
      variantId: this.editingAssetVariantId,
      rotation: this.editingAssetRotation,
    };
  }

  private drawAssetPreview(candidate: WorldObject): boolean {
    if (!this.layout || !this.floor) {
      this.buildPreview.clear();
      this.updateAssetPreviewState(false, false);
      return false;
    }
    const cells = getPlacedAssetCells(candidate);
    const blocked = Boolean(getAssetPlacementError(this.placementLayout ?? this.layout, getOutdoorBounds(this.floor), candidate))
      || Boolean(this.playerAssetPlacement && getPlayerAssetRoomError(
        this.placementLayout ?? this.layout,
        candidate,
        this.playerAssetPlacement.userId,
        this.playerAssetPlacement.settings,
      ))
      || this.placementOverlapsPlayers(cells.filter((cell) => cell.solid).map((cell) => ({
        x: cell.worldX,
        y: cell.worldY,
        width: ASSET_RASTER_SIZE,
        height: ASSET_RASTER_SIZE,
      })), candidate.id === "preview" ? undefined : candidate.id);
    this.buildPreview.clear();
    const definition = requireAssetDefinition(candidate.assetId);
    const variant = requireAssetVariant(definition, candidate.variantId);
    const bounds = getPlacedAssetBounds(candidate);
    const indicatorColor = blocked ? "#b12f2f" : "#5143bd";
    if (definition.radius) {
      drawAssetRadius(this.buildPreview, bounds, definition.radius, indicatorColor, 0.06, 0.62);
    }
    if (definition.kind === "floor-tile") {
      this.buildPreview
        .roundRect(bounds.x + 1, bounds.y + 1, bounds.width - 2, bounds.height - 2, 3)
        .fill({ color: blocked ? "#d95555" : variant.color, alpha: blocked ? 0.44 : 0.76 })
        .stroke({ color: indicatorColor, width: 2, alpha: 0.94 });
      if (!blocked) {
        drawFloorSurfacePattern(this.buildPreview, bounds, variant, candidate.rotation);
      }
    } else {
      for (const cell of cells) {
        this.buildPreview
          .roundRect(cell.worldX + 1, cell.worldY + 1, ASSET_RASTER_SIZE - 2, ASSET_RASTER_SIZE - 2, cell.type === "foliage" ? 5 : 2)
          .fill({ color: blocked ? "#d95555" : variant.color, alpha: blocked ? 0.4 : 0.62 })
          .stroke({ color: indicatorColor, width: 1.5, alpha: 0.9 });
      }
    }
    drawAssetDirectionIndicators(this.buildPreview, getAssetDirectionIndicators(candidate, this.zoom), indicatorColor);
    this.updateAssetPreviewState(true, !blocked);
    return !blocked;
  }

  private updateAssetPreviewState(hasPoint: boolean, canPlace: boolean): void {
    if (this.assetPreviewState.hasPoint === hasPoint && this.assetPreviewState.canPlace === canPlace) {
      return;
    }
    this.assetPreviewState = { hasPoint, canPlace };
    this.callbacks.current.onAssetPreviewStateChange(this.assetPreviewState);
  }

  private drawWallPreview(edit: Extract<LayoutEdit, { tool: "wall" }>): boolean {
    return this.drawWallCandidate({ id: "preview", start: edit.start, end: edit.end });
  }

  private drawWallCandidate(wall: Wall, ignoredWallIds: ReadonlySet<string> = new Set()): boolean {
    if (!this.layout || !this.placementLayout || !this.floor) {
      this.buildPreview.clear();
      return false;
    }
    const wallOpenings = wall.id === "preview"
      ? []
      : this.placementLayout.openings.filter((opening) => opening.wallId === wall.id);
    const candidateLayout: FloorLayout = {
      ...this.placementLayout,
      walls: [...this.placementLayout.walls.filter((candidate) => candidate.id !== wall.id), wall],
    };
    const ignoredOpeningIds = new Set(wallOpenings.map((opening) => opening.id));
    const openingIsInvalid = wallOpenings.some((opening) => getWallOpeningPlacement(
      candidateLayout,
      opening.type,
      getOpeningCenter(wall, opening),
      ignoredOpeningIds,
    ).error);
    const solidRects = getWallSolidRects(wall, wallOpenings);
    const blocked = Boolean(getWallPlacementError(this.placementLayout, getOutdoorBounds(this.floor), wall, ignoredWallIds))
      || openingIsInvalid
      || this.placementOverlapsPlayers(solidRects);
    const color = blocked ? "#c93636" : "#5143bd";
    this.buildPreview.clear();
    for (const rect of solidRects) {
      this.buildPreview
        .rect(rect.x, rect.y, rect.width, rect.height)
        .fill({ color, alpha: 0.42 })
        .stroke({ color, width: 2, alpha: 0.92 });
    }
    this.buildPreview
      .circle(wall.start.x, wall.start.y, 7)
      .fill({ color: "#ffffff", alpha: 0.96 })
      .stroke({ color, width: 3, alpha: 1 })
      .circle(wall.end.x, wall.end.y, 5)
      .fill({ color, alpha: 0.95 });
    return !blocked;
  }

  private drawOpeningPreview(
    type: OpeningType,
    point: { x: number; y: number },
    ignoredOpeningIds: ReadonlySet<string> = new Set(),
  ): boolean {
    if (!this.placementLayout) {
      this.buildPreview.clear();
      return false;
    }
    const placement = getWallOpeningPlacement(this.placementLayout, type, point, ignoredOpeningIds);
    let blocked = Boolean(placement.error);
    const movingOpeningId = ignoredOpeningIds.values().next().value;
    const movingOpening = typeof movingOpeningId === "string"
      ? this.placementLayout.openings.find((opening) => opening.id === movingOpeningId)
      : undefined;
    if (movingOpening && placement.opening) {
      const replacedIds = new Set([...placement.replacedOpeningIds, movingOpening.id]);
      const nextOpenings = [
        ...this.placementLayout.openings.filter((opening) => !replacedIds.has(opening.id)),
        { ...placement.opening, id: movingOpening.id },
      ];
      const impactedWallIds = new Set([movingOpening.wallId, placement.opening.wallId]);
      const solidRects = this.placementLayout.walls
        .filter((wall) => impactedWallIds.has(wall.id))
        .flatMap((wall) => getWallSolidRects(wall, nextOpenings));
      blocked ||= this.placementOverlapsPlayers(solidRects);
    }
    const color = blocked ? "#c93636" : "#5143bd";
    this.buildPreview.clear();
    if (!placement.wall || !placement.opening) {
      const x = snapToBuildGrid(point.x);
      const y = snapToBuildGrid(point.y);
      this.buildPreview
        .rect(x - BUILD_GRID_SIZE / 2, y - BUILD_GRID_SIZE / 2, BUILD_GRID_SIZE, BUILD_GRID_SIZE)
        .fill({ color, alpha: 0.32 })
        .stroke({ color, width: 2, alpha: 0.95 });
      return false;
    }
    const clearance = getOpeningRect(placement.wall, placement.opening, BUILD_GRID_SIZE * 2);
    const openingRect = getOpeningRect(placement.wall, placement.opening, WALL_THICKNESS + 4);
    this.buildPreview
      .rect(clearance.x, clearance.y, clearance.width, clearance.height)
      .fill({ color, alpha: 0.13 })
      .rect(openingRect.x, openingRect.y, openingRect.width, openingRect.height)
      .fill({ color, alpha: 0.48 })
      .stroke({ color, width: 2, alpha: 0.96 });
    return !blocked;
  }

  private createMovingWall(point: { x: number; y: number }): Wall | undefined {
    if (!this.placementLayout || this.movingBuildItem?.type !== "wall") {
      return undefined;
    }
    const source = this.placementLayout.walls.find((wall) => wall.id === this.movingBuildItem?.id);
    if (!source) {
      return undefined;
    }
    const wall = normalizeWall(source);
    const start = { x: snapToBuildGrid(point.x), y: snapToBuildGrid(point.y) };
    return {
      id: wall.id,
      start,
      end: {
        x: start.x + wall.end.x - wall.start.x,
        y: start.y + wall.end.y - wall.start.y,
      },
    };
  }

  private placeMovingItem(point: { x: number; y: number }): void {
    if (!this.movingBuildItem) {
      return;
    }
    if (this.movingBuildItem.type === "asset") {
      const candidate = this.createAssetCandidate(point);
      if (candidate && this.drawAssetPreview(candidate)) {
        this.callbacks.current.onEdit({
          tool: "asset.move",
          objectId: candidate.id,
          position: { x: candidate.x, y: candidate.y },
          variantId: candidate.variantId,
          rotation: candidate.rotation,
        });
      }
      return;
    }
    if (this.movingBuildItem.type === "wall") {
      const wall = this.createMovingWall(point);
      if (wall && this.drawWallCandidate(wall, new Set([wall.id]))) {
        this.callbacks.current.onEdit({ tool: "wall.move", wallId: wall.id, start: wall.start, end: wall.end });
      }
      return;
    }
    const opening = this.placementLayout?.openings.find((candidate) => candidate.id === this.movingBuildItem?.id);
    if (opening && this.drawOpeningPreview(opening.type, point, new Set([opening.id]))) {
      this.callbacks.current.onEdit({ tool: "opening.move", openingId: opening.id, position: point });
    }
  }

  private resolveTouchBuildPoint(point: { x: number; y: number }): { x: number; y: number } {
    if (!this.placementLayout) {
      return point;
    }
    const minimumTargetSize = this.getTouchTargetWorldSize();
    if (
      this.editingTool === "door"
      || this.editingTool === "window"
      || this.movingBuildItem?.type === "opening"
    ) {
      const nearestWall = this.placementLayout.walls
        .map((wall) => closestPointOnWall(wall, point))
        .sort((left, right) => left.distance - right.distance)[0];
      return nearestWall && nearestWall.distance <= Math.max(BUILD_GRID_SIZE / 2, minimumTargetSize / 2)
        ? nearestWall.point
        : point;
    }
    if (this.editingTool !== "erase") {
      return point;
    }
    for (const opening of [...this.placementLayout.openings].reverse()) {
      const wall = this.placementLayout.walls.find((candidate) => candidate.id === opening.wallId);
      if (!wall) {
        continue;
      }
      const bounds = getOpeningRect(wall, opening, BUILD_GRID_SIZE);
      if (pointInRect(point.x, point.y, bounds)) {
        return point;
      }
      if (isPointInWorldTarget(point.x, point.y, bounds, minimumTargetSize)) {
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      }
    }
    for (const object of getBuildSelectionCandidates(this.placementLayout.objects)) {
      if (isPointInPlacedAsset(point.x, point.y, object)) {
        return point;
      }
      const cell = getPlacedAssetCells(object).find((candidate) => isPointInWorldTarget(
        point.x,
        point.y,
        {
          x: candidate.worldX,
          y: candidate.worldY,
          width: ASSET_RASTER_SIZE,
          height: ASSET_RASTER_SIZE,
        },
        minimumTargetSize,
      ));
      if (cell) {
        return { x: cell.worldX, y: cell.worldY };
      }
    }
    for (const wall of [...this.placementLayout.walls].reverse()) {
      const bounds = getWallRect(wall, BUILD_GRID_SIZE);
      if (pointInRect(point.x, point.y, bounds)) {
        return point;
      }
      if (isPointInWorldTarget(point.x, point.y, bounds, minimumTargetSize)) {
        return closestPointOnWall(wall, point).point;
      }
    }
    return point;
  }

  private selectBuildItem(point: { x: number; y: number }, minimumTargetSize: number): void {
    if (!this.placementLayout) {
      return;
    }
    if (this.playerAssetPlacement) {
      const ownedObject = getBuildSelectionCandidates(this.placementLayout.objects).find((candidate) =>
        candidate.ownerUserId === this.playerAssetPlacement?.userId
        && (
          isPointInPlacedAsset(point.x, point.y, candidate)
          || (minimumTargetSize > 0
            && isPointInWorldTarget(point.x, point.y, getPlacedAssetBounds(candidate), minimumTargetSize))
        ),
      );
      this.callbacks.current.onBuildItemSelect(ownedObject ? { type: "asset", id: ownedObject.id } : undefined);
      return;
    }
    const opening = [...this.placementLayout.openings].reverse().find((candidate) => {
      const wall = this.placementLayout?.walls.find((item) => item.id === candidate.wallId);
      return wall && isPointInWorldTarget(
        point.x,
        point.y,
        getOpeningRect(wall, candidate, BUILD_GRID_SIZE),
        minimumTargetSize,
      );
    });
    if (opening) {
      this.callbacks.current.onBuildItemSelect({ type: "opening", id: opening.id });
      return;
    }
    const object = getBuildSelectionCandidates(this.placementLayout.objects)
      .find((candidate) => (
        isPointInPlacedAsset(point.x, point.y, candidate)
        || (minimumTargetSize > 0
          && isPointInWorldTarget(point.x, point.y, getPlacedAssetBounds(candidate), minimumTargetSize))
      ));
    if (object) {
      this.callbacks.current.onBuildItemSelect({ type: "asset", id: object.id });
      return;
    }
    const wall = [...this.placementLayout.walls].reverse().find((candidate) => isPointInWorldTarget(
      point.x,
      point.y,
      getWallRect(candidate, BUILD_GRID_SIZE),
      minimumTargetSize,
    ));
    this.callbacks.current.onBuildItemSelect(wall ? { type: "wall", id: wall.id } : undefined);
  }

  private drawBuildSelection(): void {
    this.selectionOverlay.clear();
    if (!this.editing || !this.placementLayout || !this.selectedBuildItem) {
      return;
    }
    if (this.selectedBuildItem.type === "asset") {
      const object = this.placementLayout.objects.find((candidate) => candidate.id === this.selectedBuildItem?.id);
      if (!object) {
        return;
      }
      const definition = requireAssetDefinition(object.assetId);
      const bounds = getPlacedAssetBounds(object);
      if (definition.radius) {
        drawAssetRadius(this.selectionOverlay, bounds, definition.radius, "#5143bd", 0.04, 0.5);
      }
      for (const cell of getPlacedAssetCells(object)) {
        this.selectionOverlay
          .rect(cell.worldX - 1, cell.worldY - 1, ASSET_RASTER_SIZE + 2, ASSET_RASTER_SIZE + 2)
          .fill({ color: "#5143bd", alpha: 0.1 })
          .stroke({ color: "#5143bd", width: 2, alpha: 0.9 });
      }
      drawAssetDirectionIndicators(this.selectionOverlay, getAssetDirectionIndicators(object), "#5143bd");
      return;
    }
    if (this.selectedBuildItem.type === "wall") {
      const wall = this.placementLayout.walls.find((candidate) => candidate.id === this.selectedBuildItem?.id);
      if (wall) {
        const rect = getWallRect(wall, WALL_THICKNESS + 8);
        this.selectionOverlay.rect(rect.x, rect.y, rect.width, rect.height).stroke({ color: "#5143bd", width: 3, alpha: 0.9 });
      }
      return;
    }
    const opening = this.placementLayout.openings.find((candidate) => candidate.id === this.selectedBuildItem?.id);
    const wall = opening ? this.placementLayout.walls.find((candidate) => candidate.id === opening.wallId) : undefined;
    if (opening && wall) {
      const rect = getOpeningRect(wall, opening, BUILD_GRID_SIZE);
      this.selectionOverlay.rect(rect.x, rect.y, rect.width, rect.height).stroke({ color: "#5143bd", width: 3, alpha: 0.9 });
    }
  }

  private placementOverlapsPlayers(rects: Rect[], ignoredSeatObjectId?: string): boolean {
    return this.players.some((player) => (
      player.connected
      && player.seat?.objectId !== ignoredSeatObjectId
      && rects.some((rect) => pointInRect(player.x, player.y, {
        x: rect.x - 16,
        y: rect.y - 16,
        width: rect.width + 32,
        height: rect.height + 32,
      }))
    ));
  }
}

function clampCameraZoom(zoom: number): number {
  return Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, zoom));
}

function constrainCameraAxis(center: number, start: number, length: number, viewportLength: number): number {
  if (viewportLength >= length) {
    return start + length / 2;
  }
  const halfViewport = viewportLength / 2;
  return Math.max(start + halfViewport, Math.min(start + length - halfViewport, center));
}

function closestPointOnWall(wallInput: Wall, point: { x: number; y: number }): {
  point: { x: number; y: number };
  distance: number;
} {
  const wall = normalizeWall(wallInput);
  const horizontal = wall.start.y === wall.end.y;
  const closest = horizontal
    ? {
        x: Math.max(wall.start.x, Math.min(wall.end.x, point.x)),
        y: wall.start.y,
      }
    : {
        x: wall.start.x,
        y: Math.max(wall.start.y, Math.min(wall.end.y, point.y)),
      };
  return { point: closest, distance: Math.hypot(point.x - closest.x, point.y - closest.y) };
}

function drawFloorSurfacePattern(
  graphics: Graphics,
  bounds: Rect,
  variant: AssetVariantDefinition,
  rotation: AssetRotation,
): void {
  if (variant.pattern === "wood") {
    const horizontal = rotation === 0 || rotation === 180;
    const plankSize = 16;
    if (horizontal) {
      for (let y = bounds.y + plankSize; y < bounds.y + bounds.height; y += plankSize) {
        graphics.moveTo(bounds.x + 2, y).lineTo(bounds.x + bounds.width - 2, y);
      }
      for (let row = 0, y = bounds.y; y < bounds.y + bounds.height; y += plankSize, row += 1) {
        const offset = row % 2 === 0 ? bounds.width * 0.36 : bounds.width * 0.68;
        graphics.moveTo(bounds.x + offset, y + 2).lineTo(bounds.x + offset, Math.min(y + plankSize - 2, bounds.y + bounds.height - 2));
      }
    } else {
      for (let x = bounds.x + plankSize; x < bounds.x + bounds.width; x += plankSize) {
        graphics.moveTo(x, bounds.y + 2).lineTo(x, bounds.y + bounds.height - 2);
      }
      for (let column = 0, x = bounds.x; x < bounds.x + bounds.width; x += plankSize, column += 1) {
        const offset = column % 2 === 0 ? bounds.height * 0.36 : bounds.height * 0.68;
        graphics.moveTo(x + 2, bounds.y + offset).lineTo(Math.min(x + plankSize - 2, bounds.x + bounds.width - 2), bounds.y + offset);
      }
    }
    graphics.stroke({ color: variant.accentColor, width: 1.25, alpha: 0.58 });
    return;
  }
  if (variant.pattern === "stone") {
    const slab = 24;
    for (let row = 0, y = bounds.y + slab; y < bounds.y + bounds.height; y += slab, row += 1) {
      graphics.moveTo(bounds.x + 2, y).lineTo(bounds.x + bounds.width - 2, y);
      const seamX = bounds.x + (row % 2 === 0 ? bounds.width * 0.38 : bounds.width * 0.64);
      graphics.moveTo(seamX, y - slab + 2).lineTo(seamX, y - 2);
    }
    graphics
      .stroke({ color: variant.accentColor, width: 1.5, alpha: 0.62 })
      .circle(bounds.x + bounds.width * 0.22, bounds.y + bounds.height * 0.24, 2.5)
      .fill({ color: variant.secondaryColor, alpha: 0.55 })
      .circle(bounds.x + bounds.width * 0.73, bounds.y + bounds.height * 0.67, 3)
      .fill({ color: variant.secondaryColor, alpha: 0.5 });
    return;
  }
  if (variant.pattern === "grass") {
    for (let y = bounds.y + 10, row = 0; y < bounds.y + bounds.height - 4; y += 14, row += 1) {
      for (let x = bounds.x + 9 + row % 2 * 6; x < bounds.x + bounds.width - 5; x += 18) {
        graphics
          .moveTo(x, y + 4)
          .lineTo(x - 3, y - 3)
          .moveTo(x, y + 4)
          .lineTo(x + 3, y - 4);
      }
    }
    graphics.stroke({ color: variant.accentColor, width: 1.5, alpha: 0.68 });
  }
}

function getBuildSelectionCandidates(objects: WorldObject[]): WorldObject[] {
  const layerPriority = { ground: 0, floor: 1, surface: 2 } as const;
  return objects
    .map((object, index) => ({ object, index }))
    .sort((left, right) => (
      layerPriority[requireAssetDefinition(right.object.assetId).placement.layer]
      - layerPriority[requireAssetDefinition(left.object.assetId).placement.layer]
      || right.index - left.index
    ))
    .map(({ object }) => object);
}

function drawAssetDirectionIndicators(
  graphics: Graphics,
  indicators: ReturnType<typeof getAssetDirectionIndicators>,
  color: string,
): void {
  for (const indicator of indicators) {
    if (indicator.origin) {
      const vector = directionVector(indicator.direction);
      graphics
        .moveTo(indicator.origin.x + vector.x * 9, indicator.origin.y + vector.y * 9)
        .lineTo(indicator.center.x - vector.x * 11, indicator.center.y - vector.y * 11)
        .stroke({ color, width: 2, alpha: 0.72 });
    }
    drawAssetDirection(graphics, indicator.center, indicator.bounds, indicator.direction, color);
  }
}

function drawAssetDirection(
  graphics: Graphics,
  center: { x: number; y: number },
  bounds: Rect,
  direction: PlacedAssetInteraction["direction"],
  color: string,
): void {
  const vector = directionVector(direction);
  const perpendicular = { x: -vector.y, y: vector.x };
  const axisSize = vector.x === 0 ? bounds.height : bounds.width;
  const length = Math.max(18, Math.min(34, axisSize / 2 - 4));
  const tipX = center.x + vector.x * length;
  const tipY = center.y + vector.y * length;
  graphics
    .circle(center.x, center.y, 10)
    .fill({ color: "#ffffff", alpha: 0.92 })
    .stroke({ color, width: 2, alpha: 1 })
    .moveTo(center.x - vector.x * 3, center.y - vector.y * 3)
    .lineTo(tipX - vector.x * 3, tipY - vector.y * 3)
    .stroke({ color, width: 3, alpha: 1 })
    .poly([
      tipX,
      tipY,
      tipX - vector.x * 9 + perpendicular.x * 5,
      tipY - vector.y * 9 + perpendicular.y * 5,
      tipX - vector.x * 9 - perpendicular.x * 5,
      tipY - vector.y * 9 - perpendicular.y * 5,
    ])
    .fill({ color, alpha: 1 });
}

function drawAssetRadius(
  graphics: Graphics,
  bounds: Rect,
  radius: number,
  color: string,
  fillAlpha: number,
  strokeAlpha: number,
): void {
  graphics
    .circle(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, radius)
    .fill({ color, alpha: fillAlpha })
    .stroke({ color, width: 2, alpha: strokeAlpha });
}

function drawCellOutline(cells: PlacedAssetCell[]): Graphics {
  const occupied = new Set(cells.map((cell) => `${cell.worldX}:${cell.worldY}`));
  const outline = new Graphics();
  for (const cell of cells) {
    const left = cell.worldX;
    const top = cell.worldY;
    const right = left + ASSET_RASTER_SIZE;
    const bottom = top + ASSET_RASTER_SIZE;
    if (!occupied.has(`${left}:${top - ASSET_RASTER_SIZE}`)) {
      outline.moveTo(left, top).lineTo(right, top);
    }
    if (!occupied.has(`${left + ASSET_RASTER_SIZE}:${top}`)) {
      outline.moveTo(right, top).lineTo(right, bottom);
    }
    if (!occupied.has(`${left}:${top + ASSET_RASTER_SIZE}`)) {
      outline.moveTo(right, bottom).lineTo(left, bottom);
    }
    if (!occupied.has(`${left - ASSET_RASTER_SIZE}:${top}`)) {
      outline.moveTo(left, bottom).lineTo(left, top);
    }
  }
  return outline.stroke({ color: "#ffffff", width: 1.25, alpha: 0.24 });
}

function wallEdit(
  rawStart: { x: number; y: number },
  rawEnd: { x: number; y: number },
  orientation?: "horizontal" | "vertical",
): Extract<LayoutEdit, { tool: "wall" }> {
  const start = { x: snapToBuildGrid(rawStart.x), y: snapToBuildGrid(rawStart.y) };
  const horizontal = orientation ? orientation === "horizontal" : Math.abs(rawEnd.x - rawStart.x) >= Math.abs(rawEnd.y - rawStart.y);
  const end = horizontal
    ? { x: snapToBuildGrid(rawEnd.x), y: start.y }
    : { x: start.x, y: snapToBuildGrid(rawEnd.y) };
  if (start.x === end.x && start.y === end.y) {
    end.x += BUILD_GRID_SIZE;
  }
  return { tool: "wall", start, end };
}

function itemKey(item?: LayoutItemReference): string {
  return item ? `${item.type}:${item.id}` : "";
}

function mixHex(source: string, target: string, targetWeight: number): string {
  const expand = (color: string) => color.length === 4
    ? `${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color.slice(1);
  const sourceValue = Number.parseInt(expand(source), 16);
  const targetValue = Number.parseInt(expand(target), 16);
  const channel = (shift: number) => Math.round(
    ((sourceValue >> shift) & 0xff) * (1 - targetWeight)
    + ((targetValue >> shift) & 0xff) * targetWeight,
  ).toString(16).padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function directionVector(direction: WorldPlayer["facing"]): { x: number; y: number } {
  switch (direction) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}

function facingRotation(direction: WorldPlayer["facing"]): number {
  switch (direction) {
    case "up":
      return 0;
    case "right":
      return Math.PI / 2;
    case "down":
      return Math.PI;
    case "left":
      return -Math.PI / 2;
  }
}
