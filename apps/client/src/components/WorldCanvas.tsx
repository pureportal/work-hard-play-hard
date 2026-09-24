import type { CharacterSeatedPose, OrganisationState } from "@workhard/shared";
import { ArrowUp, Check, LocateFixed, Minus, Plus, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import "pixi.js/unsafe-eval";
import { CharacterSprite } from "../character-sprite";
import { reloadUpdatedClient } from "../client-update";
import { MusicIndicator } from "../spotify/music-indicator";
import type { SpotifyActivity } from "@workhard/shared";
import { CharacterSeatOcclusion, getCharacterSeatLayout } from "../character-seat";
import { createWorldAssetView } from "../world-asset-view";
import { WorldAssetFocus } from "../world-asset-focus";
import { WorldAssetTextures } from "../world-asset-textures";
import { getPlacedWorldAssetArtwork, getPlacedWorldAssetBounds, getWorldAssetPlacementPosition, getWorldAssetSurfaceOffset } from "../world-asset-placement";
import { createWorldArchitecture } from "../world-architecture";
import { createPersonalSpaceOverlay } from "../world-personal-spaces";
import { getWorldAssetDepth, WorldDepth } from "../world-depth";
import "../world-asset.css";
import {
  ASSET_PLACEMENT_MESSAGES,
  ASSET_RASTER_SIZE,
  BUILD_GRID_SIZE,
  CHARACTER_WORLD_SIZE,
  CHARACTER_CANVAS_SIZE,
  CHARACTER_FOOT_ANCHOR,
  CHARACTER_SEAT_ANCHOR,
  CHARACTER_SEATED_FOOT_Y,
  characterAppearanceKey,
  getCharacterMotion,
  WALL_THICKNESS,
  getAssetDefinition,
  getAssetPlacementError,
  getAssetsSupportedBy,
  getFlooringVisibleRects,
  getOpeningCenter,
  getOpeningRect,
  getOutdoorBounds,
  getOutdoorWindowLights,
  getPlacedAssetBounds,
  getPlacedAssetCells,
  getPlacedAssetCellRects,
  getPlacedAssetInteraction,
  getPlayerAssetRoomError,
  getSpawnPlacementError,
  getWallOpeningPlacement,
  getWallPlacementError,
  getWallRect,
  getWallSectionRange,
  getWallSolidRects,
  isPointInPlacedAsset,
  mergeWallSegments,
  normalizeWall,
  pointInRect,
  requireAssetDefinition,
  snapToAssetRaster,
  snapToBuildGrid,
} from "@workhard/shared";
import type {
  AssetPlacementBlockReason,
  AssetRotation,
  CharacterAppearance,
  Floor,
  FloorLayout,
  GameSettings,
  LayoutEdit,
  LayoutItemReference,
  LayoutTool,
  Member,
  OpeningType,
  PlacedAssetInteraction,
  PlayerRoomAccessibility,
  Rect,
  Wall,
  WorldObject,
  WorldPlayer,
} from "@workhard/shared";
import type { DisplayGongRing } from "../gong";
import type { DisplaySpecialPropUse } from "../special-props";
import { createSpecialPropEffect, type SpecialPropView } from "../world-special-props";
import { renderCharacter } from "../character-renderer";
import { getAssetOrientationLabel, rotateAssetClockwise } from "../asset-orientation";
import { projectPreviewMarks } from "../project-preview";
import { getAssetDirectionIndicators } from "../asset-direction-indicators";
import { REACTION_EMOJI, type DisplayHighFive, type DisplayReaction } from "../reactions";
import type { ColorTheme } from "../theme";
import { isPointInWorldTarget, resolveWorldPointTarget } from "../world-point-target";
import { IconButton } from "./IconButton";
import { roomEntryAppearance } from "../room-accessibility";
import type { InteractionHighlight } from "../hooks/useInteractionAreas";

export type WorldFocusTarget = { requestId: string } & (
  | { userId: string }
  | { floorId: string; objectId: string }
  | { floorId: string; bounds: Rect }
);

export interface WorldCanvasProps {
  projectPreview?: { savedLayout: FloorLayout; status: string; removing: boolean } | undefined;
  listeningActivities?: Readonly<Record<string, SpotifyActivity>>;
  activeInteraction?: InteractionHighlight | undefined;
  floor: Floor;
  layout: FloorLayout;
  members: Member[];
  players: WorldPlayer[];
  reactions: DisplayReaction[];
  highFives: DisplayHighFive[];
  gongRings: DisplayGongRing[];
  specialPropUses?: DisplaySpecialPropUse[];
  currentUserId: string;
  editingTool: LayoutTool | null;
  editingAssetId: string;
  editingAssetVariantId: string;
  editingAssetRotation: AssetRotation;
  selectedBuildItem?: LayoutItemReference | undefined;
  movingBuildItem?: LayoutItemReference | undefined;
  playerAssetPlacement?: { userId: string; settings: GameSettings; organisation: OrganisationState; officeBuilder: boolean } | undefined;
  roomAccessibility?: PlayerRoomAccessibility | undefined;
  colorTheme: ColorTheme;
  editing: boolean;
  inputEnabled: boolean;
  focusTarget?: WorldFocusTarget | undefined;
  onDestination: (x: number, y: number) => void;
  onPlayerSelect: (userId: string, anchor: ContextAnchor) => void;
  onEdit: (edit: LayoutEdit) => void;
  onObjectSelect: (object: WorldObject, interactionId: string | undefined, anchor: ContextAnchor) => void;
  onBuildItemSelect: (item?: LayoutItemReference) => void;
  onAssetRotationChange: (rotation: AssetRotation) => void;
  onPlacementCancel: () => void;
  onPlacementBlocked: (message: string) => void;
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
  onPlacementBlocked: WorldCanvasProps["onPlacementBlocked"];
  onPlacementPreviewStateChange: (state: PlacementPreviewState) => void;
  onCameraModeChange: (mode: CameraMode) => void;
  onArtworkError: (error: Error) => void;
}

interface PlacementPreviewState {
  hasPoint: boolean;
  canPlace: boolean;
  blockedReason?: AssetPlacementBlockReason | undefined;
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
const SEATED_CHARACTER_OFFSET = (CHARACTER_FOOT_ANCHOR.y - CHARACTER_SEAT_ANCHOR.y) / CHARACTER_CANVAS_SIZE * CHARACTER_WORLD_SIZE;
const SEATED_FEET_OFFSET = (CHARACTER_SEATED_FOOT_Y - CHARACTER_SEAT_ANCHOR.y) / CHARACTER_CANVAS_SIZE * CHARACTER_WORLD_SIZE;

interface PlayerView {
  music: MusicIndicator;
  container: Container;
  status: Graphics;
  wave: Graphics;
  avatarImage: Container;
  ground: Container;
  name: Text;
  characterKey: string;
  characterSprite?: CharacterSprite;
  canWalk: boolean;
  seated: boolean;
  seatOffsetY: number;
  seatedPose: CharacterSeatedPose;
  seatShadow: Graphics;
  seatOcclusion: CharacterSeatOcclusion;
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
}

interface HighFiveView {
  container: Container;
  ring: Graphics;
  userIds: [string, string];
  startedAt: number;
  expiresAt: number;
}

interface GongObjectView {
  body: Container;
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

export function WorldCanvas(props: WorldCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<OfficeRenderer | undefined>(undefined);
  const [placementPreviewState, setPlacementPreviewState] = useState<PlacementPreviewState>({ hasPoint: false, canPlace: false });
  const [cameraMode, setCameraMode] = useState<CameraMode>("follow");
  const [artworkFailed, setArtworkFailed] = useState(false);
  const lifecycleRef = useRef<PixiLifecycle | undefined>(undefined);
  const propsRef = useRef(props);
  const callbacksRef = useRef<RendererCallbacks>({
    onDestination: props.onDestination,
    onPlayerSelect: props.onPlayerSelect,
    onEdit: props.onEdit,
    onObjectSelect: props.onObjectSelect,
    onBuildItemSelect: props.onBuildItemSelect,
    onGongOffscreen: props.onGongOffscreen,
    onPlacementBlocked: props.onPlacementBlocked,
    onPlacementPreviewStateChange: setPlacementPreviewState,
    onCameraModeChange: setCameraMode,
    onArtworkError: (error) => {
      console.error("World artwork could not load.", error);
      setArtworkFailed(true);
      void reloadUpdatedClient();
    },
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
    onPlacementBlocked: props.onPlacementBlocked,
    onPlacementPreviewStateChange: setPlacementPreviewState,
    onCameraModeChange: setCameraMode,
    onArtworkError: (error) => {
      console.error("World artwork could not load.", error);
      setArtworkFailed(true);
      void reloadUpdatedClient();
    },
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
        renderer.setRoomAccessibility(current.roomAccessibility);
        renderer.setScene(
          current.floor,
          current.layout,
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
        renderer.setProjectPreview(current.projectPreview?.savedLayout);
        renderer.setListeningActivities(current.listeningActivities ?? {});
        renderer.setActiveInteraction(current.editing ? undefined : current.activeInteraction);
        renderer.setReactions(current.reactions);
        renderer.setHighFives(current.highFives);
        renderer.setGongRings(current.gongRings);
        renderer.setSpecialPropUses(current.specialPropUses ?? []);
        if (current.focusTarget && renderer.focus(current.focusTarget)) {
          handledFocusRequestRef.current = current.focusTarget.requestId;
        }
      }).catch((error: unknown) => {
        if (createdLifecycle.active) {
          console.error("Office renderer could not start.", error);
          setArtworkFailed(true);
        }
      });
    } else {
      lifecycle.active = true;
      if (lifecycle.cleanupTimer !== undefined) {
        window.clearTimeout(lifecycle.cleanupTimer);
        delete lifecycle.cleanupTimer;
      }
    }
    const resizeObserver = new ResizeObserver(() => {
      if (lifecycle.initialized && !lifecycle.destroyed) {
        lifecycle.app.resize();
        const { focusTarget, projectPreview } = propsRef.current;
        if (projectPreview && focusTarget && "bounds" in focusTarget) lifecycle.renderer?.focus(focusTarget);
      }
    });
    resizeObserver.observe(host);
    return () => {
      resizeObserver.disconnect();
      lifecycle.active = false;
      lifecycle.cleanupTimer = window.setTimeout(() => {
        if (lifecycle.active || lifecycle.destroyed) {
          return;
        }
        lifecycle.destroyed = true;
        void lifecycle.initialization.then(() => {
          lifecycle.renderer?.destroy();
          rendererRef.current = undefined;
          if (lifecycle.initialized) {
            if (lifecycle.app.canvas.parentElement === host) {
              host.removeChild(lifecycle.app.canvas);
            }
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
  }, [props.colorTheme, props.editing, props.editingAssetId, props.editingAssetRotation, props.editingAssetVariantId, props.editingTool, props.floor, props.layout, props.movingBuildItem, props.playerAssetPlacement, props.selectedBuildItem]);

  const pointPlacementActive = props.editing
    && (props.editingTool === "asset" || props.editingTool === "spawn" || props.movingBuildItem?.type === "asset");
  const buildActionActive = props.editing && (props.editingTool !== null || Boolean(props.movingBuildItem));

  useEffect(() => {
    rendererRef.current?.setProjectPreview(props.projectPreview?.savedLayout);
  }, [props.layout, props.projectPreview?.savedLayout]);

  useEffect(() => {
    rendererRef.current?.setRoomAccessibility(props.roomAccessibility);
  }, [props.roomAccessibility]);

  useEffect(() => {
    rendererRef.current?.setActiveInteraction(props.editing ? undefined : props.activeInteraction);
  }, [props.activeInteraction, props.editing]);

  useEffect(() => {
    if (!pointPlacementActive) {
      setPlacementPreviewState({ hasPoint: false, canPlace: false });
    }
  }, [pointPlacementActive]);

  useEffect(() => {
    rendererRef.current?.setPlayers(props.players, props.members, props.currentUserId);
  }, [props.currentUserId, props.members, props.players]);

  useEffect(() => {
    rendererRef.current?.setReactions(props.reactions);
  }, [props.reactions]);

  useEffect(() => {
    rendererRef.current?.setListeningActivities(props.listeningActivities ?? {});
  }, [props.listeningActivities]);

  useEffect(() => {
    rendererRef.current?.setHighFives(props.highFives);
  }, [props.highFives]);

  useEffect(() => {
    rendererRef.current?.setGongRings(props.gongRings);
  }, [props.gongRings]);

  useEffect(() => {
    rendererRef.current?.setSpecialPropUses(props.specialPropUses ?? []);
  }, [props.specialPropUses, props.floor.id]);

  useEffect(() => {
    const target = props.focusTarget;
    if (target && handledFocusRequestRef.current !== target.requestId && rendererRef.current?.focus(target)) {
      handledFocusRequestRef.current = target.requestId;
    }
  }, [props.focusTarget, props.players, props.floor, props.layout]);

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

    const isInterfaceTarget = (target: EventTarget | null) =>
      target instanceof Element && target !== document.body && !hostRef.current?.contains(target);

    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!props.inputEnabled || event.defaultPrevented || isInterfaceTarget(event.target) || !keyMap[key] || pressed.has(key)) {
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
    const focusChanged = (event: FocusEvent) => {
      if (isInterfaceTarget(event.target)) reset();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", reset);
    window.addEventListener("focusin", focusChanged);
    return () => {
      reset();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", reset);
      window.removeEventListener("focusin", focusChanged);
    };
  }, [props.inputEnabled]);

  return (
    <div className={`world-viewport ${props.editing ? "editing" : ""}`} data-guide="world">
      <div
        ref={hostRef}
        className="world-canvas"
        role="application"
        tabIndex={0}
        aria-label={props.editing ? `${props.floor.name} build canvas.` : `${props.floor.name} office map. Use arrow keys or WASD to move.`}
      />
      {artworkFailed && (
        <div className="world-artwork-error" role="alert">
          <span>Artwork could not load.</span>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
      {props.projectPreview && <div className="world-project-state" role="status"><span>{props.projectPreview.status}</span>
        {props.projectPreview.removing && <span className="project-removal-key">To remove</span>}</div>}
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
      {buildActionActive && (
        <div className="placement-controls" role="toolbar" aria-label={pointPlacementActive
          ? props.editingTool === "spawn" ? "Start point placement" : "Asset placement" : "Build action"}>
          {pointPlacementActive && props.editingTool !== "spawn" && <>
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
          </>}
          {pointPlacementActive && <button
            className="placement-confirm"
            disabled={!placementPreviewState.hasPoint || !placementPreviewState.canPlace}
            onClick={() => rendererRef.current?.commitPlacement()}
          >
            <Check size={16} aria-hidden="true" />
            {props.movingBuildItem?.type === "asset" || props.editingTool === "spawn" ? "Move here" : "Place"}
          </button>}
          <IconButton label={pointPlacementActive ? "Cancel placement" : "Cancel action"} icon={X} onClick={props.onPlacementCancel} />
        </div>
      )}
    </div>
  );
}

class OfficeRenderer {
  private readonly world = new Container();
  private readonly layoutLayer = new Container();
  private readonly selectionOverlay = new Graphics();
  private readonly hoverOverlay = new Graphics();
  private readonly projectOverlay = new Graphics();
  private readonly personalSpacesLayer = new Container();
  private readonly assetFocus = new WorldAssetFocus();
  private readonly interactionOverlay = new Graphics();
  private readonly accessibilityOverlay = new Graphics();
  private roomAccessibility: PlayerRoomAccessibility | undefined;
  private readonly buildPreview = new Graphics();
  private readonly assetPreviewLayer = new Container();
  private readonly assetTextures = new WorldAssetTextures();
  private assetPreview: { key: string; container: Container } | undefined;
  private readonly depth = new WorldDepth();
  private readonly objectViews = new Map<string, Container>();
  private readonly assetAnimations = new Map<Container, (now: number) => void>();
  private readonly celebrationLayer = new Container();
  private readonly playerViews = new Map<string, PlayerView>();
  private readonly highFiveViews = new Map<string, HighFiveView>();
  private readonly gongViews = new Map<string, GongObjectView>();
  private readonly gongCelebrationViews = new Map<string, GongCelebrationView>();
  private readonly specialPropViews = new Map<string, SpecialPropView>();
  private readonly reactions = new Map<string, DisplayReaction>();
  private readonly pointerStart = { x: 0, y: 0 };
  private memberMap = new Map<string, Member>();
  private members?: Member[];
  private floor?: Floor;
  private layout?: FloorLayout;
  private placementLayout: FloorLayout | undefined;
  private players: WorldPlayer[] = [];
  private editing = false;
  private editingTool: LayoutTool | null = null;
  private editingAssetId = "";
  private editingAssetVariantId = "";
  private editingAssetRotation: AssetRotation = 0;
  private selectedBuildItem: LayoutItemReference | undefined;
  private movingBuildItem: LayoutItemReference | undefined;
  private playerAssetPlacement: { userId: string; settings: GameSettings; organisation: OrganisationState; officeBuilder: boolean } | undefined;
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
  private hoverClientPoint?: { x: number; y: number; pointerType: string };
  private hoverPointIsTouch = false;
  private buildStart?: { x: number; y: number };
  private buildOrientation?: "horizontal" | "vertical";
  private colorTheme: ColorTheme = "light";
  private placementPreviewState: PlacementPreviewState = { hasPoint: false, canPlace: false };
  private touchPlacement = false;

  constructor(
    private readonly app: Application,
    private readonly callbacks: React.MutableRefObject<RendererCallbacks>,
  ) {
    this.app.stage.addChild(this.world);
    this.world.scale.set(this.zoom);
    this.world.addChild(this.layoutLayer, this.accessibilityOverlay, this.interactionOverlay, this.depth.container, this.personalSpacesLayer, this.projectOverlay, this.selectionOverlay, this.hoverOverlay, this.assetFocus.overlay, this.assetPreviewLayer, this.buildPreview, this.celebrationLayer);
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
    editing: boolean,
    editingTool: LayoutTool | null,
    editingAssetId: string,
    editingAssetVariantId: string,
    editingAssetRotation: AssetRotation,
    selectedBuildItem?: LayoutItemReference,
    movingBuildItem?: LayoutItemReference,
    playerAssetPlacement?: { userId: string; settings: GameSettings; organisation: OrganisationState; officeBuilder: boolean },
    colorTheme: ColorTheme = "light",
  ): void {
    const floorChanged = this.floor?.id !== floor.id;
    const structureChanged = this.floor !== floor || this.layout !== layout;
    const editingGridChanged = this.editing !== editing
      || (editing && (this.editingTool === "asset") !== (editingTool === "asset"));
    const themeChanged = this.colorTheme !== colorTheme;
    const layoutChanged = structureChanged
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
      this.clearBuildPreview();
      delete this.buildStart;
      delete this.buildOrientation;
      this.touchPlacement = false;
      this.updatePlacementPreviewState(false, false);
    }
    if (floorChanged) {
      this.cancelPointerInteraction();
      this.cameraUserId = this.currentUserId;
      this.updateCameraMode("follow");
      for (const view of this.gongCelebrationViews.values()) {
        view.container.destroy({ children: true });
      }
      this.gongCelebrationViews.clear();
      for (const view of this.specialPropViews.values()) view.container.destroy({ children: true });
      this.specialPropViews.clear();
    }
    if (layoutChanged) {
      this.drawLayout();
      this.setPlayers(this.players, this.members ?? [], this.currentUserId);
    }
    if (themeChanged) {
      this.applyPlayerTheme();
    }
    this.drawBuildSelection();
    this.drawBuildHover();
    this.drawRoomAccessibility();
    if (this.editing && this.hoverPoint && !this.buildStart && (!this.hoverPointIsTouch || this.touchPlacement)) {
      this.drawPlacementPreview(this.hoverPoint);
    }
  }

  private listeningActivities: Readonly<Record<string, SpotifyActivity>> = {};
  setProjectPreview(savedLayout: FloorLayout | undefined): void {
    this.projectOverlay.clear();
    if (!savedLayout || !this.layout) return;
    for (const { bounds, change } of projectPreviewMarks(savedLayout, this.layout)) {
      const color = change === "added" ? "#edb34f" : "#ef6666";
      const { x, y, width, height } = bounds;
      this.projectOverlay.rect(x, y, width, height).fill({ color, alpha: 0.22 }).stroke({ color, width: 3 });
      if (change === "removed") {
        this.projectOverlay.moveTo(x, y).lineTo(x + width, y + height).moveTo(x + width, y).lineTo(x, y + height).stroke({ color, width: 2, alpha: 0.85 });
      }
    }
  }
  private readonly musicReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  setListeningActivities(activities: Readonly<Record<string, SpotifyActivity>>): void {
    this.listeningActivities = activities;
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
      if (!view) {
        view = this.createPlayerView(member, player.userId === currentUserId);
        view.container.position.set(player.x, player.y);
        this.playerViews.set(player.userId, view);
        this.applyReaction(view, this.reactions.get(player.userId));
      }
      const carrier = player.carriedByUserId ? playerMap.get(player.carriedByUserId) : undefined;
      view.seated = Boolean(player.seat || carrier);
      const seat = player.seat && !carrier ? this.layout?.objects.find((object) => object.id === player.seat!.objectId) : undefined;
      const interaction = seat && player.seat && getPlacedAssetInteraction(seat, player.seat.interactionId);
      const seatLayout = getCharacterSeatLayout(seat, interaction?.id);
      if (view.characterKey !== characterAppearanceKey(member.character) || view.seatedPose !== seatLayout.pose) {
        view.characterKey = characterAppearanceKey(member.character);
        view.seatedPose = seatLayout.pose;
        void this.loadPlayerCharacter(view, member.character);
      }
      view.seatOffsetY = seatLayout.offsetY;
      view.seatOcclusion.setSeat(seat, interaction?.id, seat ? this.objectViews.get(seat.id) : undefined);
      view.avatarImage.position.set(seatLayout.offsetX, view.seatOffsetY);
      view.seatShadow.visible = Boolean(seat);
      const sideFacing = interaction?.direction === "left" || interaction?.direction === "right";
      view.seatShadow.scale.set(sideFacing ? 0.6 : 1, sideFacing ? 1.3 : 1);
      view.music.container.x = seatLayout.offsetX;
      view.reactionBubble.x = seatLayout.offsetX;
      view.canWalk = !view.seated;
      view.ground.visible = view.canWalk;
      view.name.x = (carrier ? -18 - view.name.width / 2 : 0) + seatLayout.offsetX;
      view.name.y = 10 + (view.seated ? Math.max(SEATED_FEET_OFFSET + view.seatOffsetY, ASSET_RASTER_SIZE) : 0);
      view.status.y = view.seated ? SEATED_CHARACTER_OFFSET + view.seatOffsetY : 0;
      view.status.x = seatLayout.offsetX;
      view.targetX = carrier?.x ?? player.x;
      view.targetY = (carrier?.y ?? player.y) - (carrier ? CHARACTER_WORLD_SIZE * 0.7 : 0);
      this.depth.setPosition(view.container, view.container.x, view.container.y);
      view.wavingUntil = player.wavingUntil ?? 0;
      if (view.availability !== player.availability) {
        view.availability = player.availability;
        view.status.clear().circle(10, -CHARACTER_WORLD_SIZE + 8, 4).fill(statusColors[player.availability]).stroke({ color: "#ffffff", width: 2 });
      }
      view.facingDirection = carrier?.facing ?? interaction?.direction ?? player.facing;
    }
    for (const player of players) {
      const view = this.playerViews.get(player.userId);
      if (!view) continue;
      const support = player.carriedByUserId
        ? this.playerViews.get(player.carriedByUserId)?.container
        : player.seat ? this.objectViews.get(player.seat.objectId) : undefined;
      this.depth.attach(view.container, support, Boolean(player.carriedByUserId));
    }
    this.depth.sort();
  }

  setActiveInteraction(area: InteractionHighlight | undefined): void {
    const graphic = this.interactionOverlay.clear();
    if (!area) return;
    if (area.type === "circle") {
      graphic.circle(area.x, area.y, area.radius);
    } else {
      const { x, y, width, height } = area.bounds;
      graphic.roundRect(x, y, width, height, 8);
    }
    graphic.stroke({ color: "#6c5ce7", width: 1.5, alpha: 0.32 });
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

  setSpecialPropUses(uses: DisplaySpecialPropUse[]): void {
    const visible = uses.filter(use => use.floorId === this.floor?.id && this.layout?.objects.some(object => object.id === use.objectId));
    for (const [id, view] of this.specialPropViews) {
      if (visible.some(use => use.id === id)) continue;
      view.container.destroy({ children: true });
      this.specialPropViews.delete(id);
    }
    for (const use of visible) {
      if (this.specialPropViews.has(use.id)) continue;
      const object = this.layout!.objects.find(object => object.id === use.objectId)!;
      const view = createSpecialPropEffect(object, use);
      this.celebrationLayer.addChild(view.container);
      this.specialPropViews.set(use.id, view);
      view.animate(Date.now());
    }
  }

  focus(target: WorldFocusTarget): boolean {
    if ("userId" in target) return this.focusUser(target.userId);
    if (target.floorId !== this.floor?.id || !this.layout) return false;
    if ("bounds" in target) {
      const { bounds } = target;
      this.assetFocus.clear();
      this.freeCameraX = bounds.x + bounds.width / 2;
      this.freeCameraY = bounds.y + bounds.height / 2;
      this.zoom = clampCameraZoom(Math.min(this.zoom,
        this.app.screen.width / (bounds.width + BUILD_GRID_SIZE * 4),
        this.app.screen.height / (bounds.height + BUILD_GRID_SIZE * 4)));
      this.updateCameraMode("free");
      this.applyFreeCameraTransform();
      this.refreshBuildOverlays();
      return true;
    }
    const object = this.layout.objects.find((candidate) => candidate.id === target.objectId);
    const view = this.objectViews.get(target.objectId);
    if (!object || !view) return false;
    const bounds = getPlacedWorldAssetBounds(this.layout, object);
    this.freeCameraX = bounds.x + bounds.width / 2;
    this.freeCameraY = bounds.y + bounds.height / 2;
    this.updateCameraMode("free");
    this.applyFreeCameraTransform();
    this.assetFocus.start(view, bounds, Date.now(), this.musicReducedMotion.matches);
    return true;
  }

  focusUser(userId: string): boolean {
    if (!this.playerViews.has(userId)) {
      return false;
    }
    this.cameraUserId = userId;
    this.assetFocus.clear();
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
    this.refreshBuildOverlays();
  }

  commitPlacement(): boolean {
    const point = this.hoverPoint;
    if (point && this.editing && this.editingTool === "spawn" && this.playerAssetPlacement?.officeBuilder !== false) {
      if (!this.drawSpawnPreview(point)) return false;
      this.callbacks.current.onEdit({ tool: "spawn", position: { x: snapToBuildGrid(point.x), y: snapToBuildGrid(point.y) } });
      return true;
    }
    if (!point || !this.editing || (this.editingTool !== "asset" && this.movingBuildItem?.type !== "asset")) {
      return false;
    }
    const candidate = this.createAssetCandidate(point);
    if (!candidate) return false;
    if (!this.drawAssetPreview(candidate)) {
      if (this.placementPreviewState.blockedReason) {
        this.callbacks.current.onPlacementBlocked(ASSET_PLACEMENT_MESSAGES[this.placementPreviewState.blockedReason]);
      }
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
    this.assetFocus.clear();
    this.app.ticker.remove(this.renderFrame);
    this.app.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.app.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.app.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.app.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.app.canvas.removeEventListener("lostpointercapture", this.handleLostPointerCapture);
    this.app.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.app.canvas.removeEventListener("wheel", this.handleWheel);
    this.cancelPointerInteraction();
    this.assetTextures.destroy();
  }

  private drawLayout(): void {
    if (!this.floor || !this.layout) {
      return;
    }
    this.assetFocus.clear();
    for (const child of this.personalSpacesLayer.removeChildren()) child.destroy({ children: true });
    if (this.editing) this.personalSpacesLayer.addChild(createPersonalSpaceOverlay(this.layout, this.memberMap, this.currentUserId));
    this.gongViews.clear();
    for (const view of this.objectViews.values()) view.destroy({ children: true });
    this.objectViews.clear();
    for (const child of this.layoutLayer.removeChildren()) {
      child.destroy({ children: true });
    }
    const dark = this.colorTheme === "dark";
    const outdoorBounds = getOutdoorBounds(this.floor);
    const outdoors = new Graphics()
      .rect(outdoorBounds.x, outdoorBounds.y, outdoorBounds.width, outdoorBounds.height)
      .fill(dark ? "#1d2925" : "#d8e6dc");
    this.layoutLayer.addChild(outdoors);

    if (this.editing) {
      const grid = new Graphics();
      const gridSize = this.editingTool === "asset" ? ASSET_RASTER_SIZE : BUILD_GRID_SIZE;
      const endX = outdoorBounds.x + outdoorBounds.width;
      const endY = outdoorBounds.y + outdoorBounds.height;
      for (let x = outdoorBounds.x; x <= endX; x += gridSize) {
        grid.moveTo(x, outdoorBounds.y).lineTo(x, endY);
      }
      for (let y = outdoorBounds.y; y <= endY; y += gridSize) {
        grid.moveTo(outdoorBounds.x, y).lineTo(endX, y);
      }
      grid.stroke({ color: dark ? "#d9d2eb25" : "#766f6728", width: 1 });
      this.layoutLayer.addChild(grid);
    }

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
        .fill(dark ? mixHex(room.color, "#20222d", 0.62) : room.color)
        .stroke({ color: "#ffffff", width: 1, alpha: dark ? 0.12 : 0.26 });
      this.layoutLayer.addChild(roomGraphic);
    }

    const groundObjects = this.layout.objects.filter(object => requireAssetDefinition(object.assetId).placement.layer === "ground")
      .sort((left, right) => Number(requireAssetDefinition(left.assetId).kind === "rug") - Number(requireAssetDefinition(right.assetId).kind === "rug"));
    for (const object of groundObjects) this.drawObject(object);

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

    this.layoutLayer.addChild(createWorldArchitecture(this.assetTextures, this.placementLayout ?? this.layout, this.colorTheme, this.callbacks.current.onArtworkError));
    const objects = this.layout.objects.filter((object) => requireAssetDefinition(object.assetId).placement.layer !== "ground").sort((left, right) => {
      const leftDepth = getWorldAssetDepth(left);
      const rightDepth = getWorldAssetDepth(right);
      return leftDepth.y - rightDepth.y || leftDepth.x - rightDepth.x || left.id.localeCompare(right.id);
    });
    for (const object of objects) {
      this.drawObject(object);
    }
    for (const object of objects) {
      for (const supported of getAssetsSupportedBy(this.layout, object)) {
        this.depth.attach(this.objectViews.get(supported.id)!, this.objectViews.get(object.id)!);
      }
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
    const view = createWorldAssetView(this.assetTextures, object, this.layout!, this.colorTheme, this.callbacks.current.onArtworkError);
    this.objectViews.set(object.id, view.container);
    if (view.animate) {
      this.assetAnimations.set(view.container, view.animate);
      view.container.once("destroyed", () => this.assetAnimations.delete(view.container));
    }
    if (definition.placement.layer === "ground" || definition.kind === "portal") {
      this.layoutLayer.addChild(view.container);
    } else {
      const position = getWorldAssetDepth(object);
      this.depth.setPosition(view.container, position.x, position.y);
    }
    if (definition.kind === "gong") {
      this.gongViews.set(object.id, { body: view.body, ringStartedAt: 0, ringUntil: 0 });
    }
  }

  private createPlayerView(member: Member, current: boolean): PlayerView {
    const container = new Container({ label: `world-player:${member.id}` });
    const wave = new Graphics().circle(0, 0, 24).stroke({ color: member.color, width: 3 });
    wave.alpha = 0;
    const shadow = new Graphics().ellipse(0, 1, 10, 3).fill({ color: "#24212d", alpha: 0.22 });
    const square = new Graphics().ellipse(0, 0, 11, 4).stroke({ color: current ? "#ffffff" : member.color, width: 1.5 });
    const ground = new Container();
    ground.addChild(shadow, square);
    const avatarImage = new Container();
    avatarImage.label = "character";
    const seatShadow = new Graphics({ label: "seat-contact" })
      .ellipse(0, 3, 7, 3).fill({ color: "#292331", alpha: 0.08 })
      .ellipse(0, 3, 5, 2).fill({ color: "#292331", alpha: 0.12 });
    seatShadow.visible = false;
    avatarImage.addChild(seatShadow);
    const name = new Text({ text: current ? "You" : member.name.split(" ")[0] ?? member.name, style: { fontFamily: "Inter, Segoe UI, sans-serif", fontSize: 11, fontWeight: "600", fill: this.colorTheme === "dark" ? "#f4f1f8" : "#292731" } });
    name.anchor.set(0.5, 0);
    name.position.set(0, 10);
    const status = new Graphics();
    const reactionBubble = new Container();
    reactionBubble.visible = false;
    reactionBubble.position.set(0, -CHARACTER_WORLD_SIZE - 22);
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
    const music = new MusicIndicator();
    container.addChild(wave, ground, avatarImage, name, status, music.container, reactionBubble);
    const view: PlayerView = {
      music,
      container,
      status,
      wave,
      avatarImage,
      ground,
      name,
      characterKey: characterAppearanceKey(member.character),
      canWalk: true,
      seated: false,
      seatOffsetY: 0,
      seatedPose: "chair",
      seatShadow,
      seatOcclusion: new CharacterSeatOcclusion(avatarImage, this.assetTextures, this.callbacks.current.onArtworkError),
      reactionBubble,
      reactionText,
      reactionStartedAt: 0,
      reactionUntil: 0,
      targetX: 0,
      targetY: 0,
      wavingUntil: 0,
    };
    void this.loadPlayerCharacter(view, member.character);
    return view;
  }

  private applyPlayerTheme(): void {
    const fill = this.colorTheme === "dark" ? "#f4f1f8" : "#292731";
    for (const view of this.playerViews.values()) {
      view.name.style.fill = fill;
    }
  }

  private async loadPlayerCharacter(view: PlayerView, appearance: CharacterAppearance): Promise<void> {
    const pose = view.seatedPose;
    try {
      const image = await renderCharacter(appearance, undefined, pose);
      if (view.container.destroyed || view.characterKey !== characterAppearanceKey(appearance) || view.seatedPose !== pose) return;
      const character = new CharacterSprite(image);
      character.sprite.label = `character-pose:${pose}`;
      const moving = view.canWalk && Math.hypot(view.targetX - view.container.x, view.targetY - view.container.y) > 0.4;
      character.update(Date.now(), getCharacterMotion(view.seated, moving, false), view.facingDirection ?? "down");
      view.characterSprite?.sprite.destroy();
      view.characterSprite = character;
      view.avatarImage.addChild(view.characterSprite.sprite);
    } catch (error) {
      if (!view.container.destroyed && view.characterKey === characterAppearanceKey(appearance) && view.seatedPose === pose) {
        this.callbacks.current.onArtworkError(error instanceof Error ? error : new Error(String(error)));
      }
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
    this.assetFocus.update(now, this.musicReducedMotion.matches);
    for (const animate of this.assetAnimations.values()) animate(this.musicReducedMotion.matches ? 0 : now);
    for (const view of this.specialPropViews.values()) view.animate(now);
    const interpolation = 1 - Math.exp(-Math.min(this.app.ticker.deltaMS, 100) / 67);
    for (const [userId, view] of this.playerViews) {
      const moving = view.canWalk && Math.hypot(view.targetX - view.container.x, view.targetY - view.container.y) > 0.4;
      const listening = (this.listeningActivities[userId]?.expiresAt ?? 0) > now;
      view.characterSprite?.update(this.musicReducedMotion.matches ? 0 : now, getCharacterMotion(view.seated, moving, listening), view.facingDirection ?? "down");
      view.container.x += (view.targetX - view.container.x) * interpolation;
      view.container.y += (view.targetY - view.container.y) * interpolation;
      view.seatOcclusion.update();
      this.depth.setPosition(view.container, view.container.x, view.container.y);
      const waving = view.wavingUntil > now;
      view.wave.alpha = waving ? 0.35 + Math.sin(now / 100) * 0.2 : 0;
      view.wave.scale.set(waving ? 1 + ((now / 700) % 0.4) : 1);
      const reacting = view.reactionUntil > now;
      view.music.update(now, this.listeningActivities[userId]?.expiresAt ?? 0,
        -CHARACTER_WORLD_SIZE + (view.seated ? SEATED_CHARACTER_OFFSET + view.seatOffsetY : 0),
        this.musicReducedMotion.matches, reacting);
      view.reactionBubble.visible = reacting;
      if (reacting) {
        const entrance = Math.min(1, (now - view.reactionStartedAt) / 180);
        const exit = Math.min(1, (view.reactionUntil - now) / 280);
        const scale = 0.72 + 0.28 * (1 - Math.pow(1 - entrance, 3));
        view.reactionBubble.alpha = exit;
        view.reactionBubble.scale.set(scale);
        view.reactionBubble.y = (-CHARACTER_WORLD_SIZE - 22) + (view.seated ? SEATED_CHARACTER_OFFSET + view.seatOffsetY : 0) - entrance * 5;
      }
    }
    this.depth.sort();
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
      const elapsed = now - view.ringStartedAt;
      const decay = now >= view.ringUntil ? 0 : Math.max(0, 1 - elapsed / 1_650);
      view.body.x = Math.sin(elapsed / 72) * decay * 3;
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
    if (this.editing && this.activePointers.size === 0 && !this.movingBuildItem
      && (this.editingTool === null || this.editingTool === "erase") && this.hoverClientPoint) {
      const rawPoint = this.toWorld(this.hoverClientPoint.x, this.hoverClientPoint.y);
      const point = this.hoverClientPoint.pointerType === "mouse" ? rawPoint : this.resolveTouchBuildPoint(rawPoint);
      if (point.x !== this.hoverPoint?.x || point.y !== this.hoverPoint?.y) {
        this.hoverPoint = point;
        this.drawBuildHover();
      }
    }
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
      this.hoverOverlay.clear();
      return;
    }
    if (event.pointerType === "mouse") {
      this.touchPlacement = false;
      this.hoverPointIsTouch = false;
      this.hoverClientPoint = { x: event.clientX, y: event.clientY, pointerType: event.pointerType };
      this.hoverPoint = this.toWorld(event.clientX, event.clientY);
      if (this.editing) {
        this.drawPlacementPreview(this.hoverPoint);
      }
    } else {
      delete this.hoverClientPoint;
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const trackedPointer = this.activePointers.get(event.pointerId);
    if (!trackedPointer) {
      if (this.activePointers.size === 0 && event.pointerType !== "touch") {
        this.touchPlacement = false;
        this.hoverPointIsTouch = false;
        this.hoverClientPoint = { x: event.clientX, y: event.clientY, pointerType: event.pointerType };
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
    if (event.pointerType !== "touch") this.hoverClientPoint = { x: event.clientX, y: event.clientY, pointerType: event.pointerType };
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
      this.hoverOverlay.clear();
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
    this.hoverClientPoint = { x: event.clientX, y: event.clientY, pointerType: event.pointerType };
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
    if (event.pointerType !== "touch") this.hoverClientPoint = { x: event.clientX, y: event.clientY, pointerType: event.pointerType };
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
      this.clearBuildPreview();
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
      if (event.pointerType !== "touch") this.hoverClientPoint = { x: event.clientX, y: event.clientY, pointerType: event.pointerType };
      const point = event.pointerType === "mouse" ? pointerPoint : this.resolveTouchBuildPoint(pointerPoint);
      this.hoverPoint = point;
      this.hoverPointIsTouch = event.pointerType === "touch";
      this.drawPlacementPreview(point);
      if (event.pointerType !== "mouse" && this.placementPreviewState.blockedReason) {
        this.callbacks.current.onPlacementBlocked(ASSET_PLACEMENT_MESSAGES[this.placementPreviewState.blockedReason]);
      }
      if (this.movingBuildItem) {
        if (this.movingBuildItem.type === "asset" && event.pointerType !== "mouse") {
          this.touchPlacement = true;
          return;
        }
        this.touchPlacement = false;
        this.placeMovingItem(point);
        return;
      }
      if (this.editingTool === "asset" || this.editingTool === "spawn") {
        if (event.pointerType !== "mouse") {
          this.touchPlacement = true;
          return;
        }
        this.touchPlacement = false;
        this.commitPlacement();
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
        const target = this.getBuildTarget(point, event.pointerType === "mouse" ? 0 : this.getTouchTargetWorldSize(), true);
        if (target?.type === "wall") {
          this.callbacks.current.onEdit({ tool: "erase", position: point });
        } else if (target) {
          this.callbacks.current.onEdit({ tool: "item.remove", item: target });
        }
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
        ([userId, view]) => userId !== this.currentUserId && isPointInWorldTarget(pointerPoint.x, pointerPoint.y, { x: view.container.x - 14, y: view.container.y - CHARACTER_WORLD_SIZE, width: 28, height: CHARACTER_WORLD_SIZE + 4 }, playerTargetRadius * 2),
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
      object => this.hitAssetArtwork(object, pointerPoint),
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
      delete this.hoverClientPoint;
      this.hoverPointIsTouch = false;
      this.clearBuildPreview();
      this.hoverOverlay.clear();
      this.updatePlacementPreviewState(false, false);
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
    this.refreshBuildOverlays();
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
        this.refreshBuildOverlays();
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
    delete this.hoverClientPoint;
    this.hoverPointIsTouch = false;
    this.clearBuildPreview();
    this.hoverOverlay.clear();
    this.touchPlacement = false;
    this.updatePlacementPreviewState(false, false);
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

  private refreshBuildOverlays(): void {
    this.drawBuildSelection();
    if (this.hoverClientPoint) {
      const point = this.toWorld(this.hoverClientPoint.x, this.hoverClientPoint.y);
      this.hoverPoint = this.hoverClientPoint.pointerType === "mouse" ? point : this.resolveTouchBuildPoint(point);
    }
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
    if (!this.movingBuildItem && (this.editingTool === null || this.editingTool === "erase")) {
      this.clearBuildPreview();
      this.updatePlacementPreviewState(false, false);
      this.drawBuildHover();
      return;
    }
    this.hoverOverlay.clear();
    if (!this.editing) {
      this.clearBuildPreview();
      this.updatePlacementPreviewState(false, false);
      return;
    }
    if (this.editingTool === "spawn") {
      this.drawSpawnPreview(point);
      return;
    }
    if (this.movingBuildItem?.type === "asset") {
      const candidate = this.createAssetCandidate(point);
      if (candidate) {
        this.drawAssetPreview(candidate);
      } else {
        this.updatePlacementPreviewState(false, false);
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
        this.updatePlacementPreviewState(false, false);
      }
      return;
    }
    if (this.editingTool === "door" || this.editingTool === "window") {
      this.drawOpeningPreview(this.editingTool, point);
      return;
    }
    if (this.editingTool === "wall") {
      this.updatePlacementPreviewState(false, false);
      if (this.buildStart) {
        const deltaX = point.x - this.buildStart.x;
        const deltaY = point.y - this.buildStart.y;
        if (!this.buildOrientation && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 4) {
          this.buildOrientation = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" : "vertical";
        }
        this.drawWallPreview(wallEdit(this.buildStart, point, this.buildOrientation));
        return;
      }
      this.clearBuildPreview()
        .circle(snapToBuildGrid(point.x), snapToBuildGrid(point.y), 6)
        .fill({ color: "#5143bd", alpha: 0.75 })
        .stroke({ color: "#ffffff", width: 2, alpha: 0.95 });
      return;
    }
    this.clearBuildPreview();
    this.updatePlacementPreviewState(false, false);
  }

  private drawSpawnPreview(point: { x: number; y: number }): boolean {
    if (!this.layout || !this.floor || this.playerAssetPlacement?.officeBuilder === false) return false;
    const position = { x: snapToBuildGrid(point.x), y: snapToBuildGrid(point.y) };
    const blocked = Boolean(getSpawnPlacementError(this.layout, getOutdoorBounds(this.floor), position, this.players, this.playerAssetPlacement?.settings.roomAccess.mode));
    const color = blocked ? "#c93636" : "#5143bd";
    const { x, y } = position;
    this.clearBuildPreview()
      .circle(x, y, 13).fill({ color, alpha: 0.15 }).stroke({ color, width: 2 })
      .moveTo(x, y - 8).lineTo(x + 8, y).lineTo(x, y + 8).lineTo(x - 8, y)
      .closePath().fill({ color, alpha: 0.8 });
    this.updatePlacementPreviewState(true, !blocked);
    return !blocked;
  }

  setRoomAccessibility(accessibility: PlayerRoomAccessibility | undefined): void {
    this.roomAccessibility = accessibility;
    this.drawRoomAccessibility();
  }

  private drawRoomAccessibility(): void {
    this.accessibilityOverlay.clear();
    const result = this.roomAccessibility?.floors.find((floor) => floor.floorId === this.floor?.id);
    if (!result || !this.floor || !this.layout) return;
    for (const room of this.layout.rooms) {
      const entry = result.rooms.find((item) => item.roomId === room.id);
      if (!entry) continue;
      const { color } = roomEntryAppearance[entry.status];
      for (const rect of room.footprint) {
        this.accessibilityOverlay.rect(rect.x, rect.y, rect.width, rect.height)
          .fill({ color, alpha: 0.22 }).stroke({ color, width: 2, alpha: 0.8 });
      }
    }
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
    const position = getWorldAssetPlacementPosition(this.layout, definition, this.editingAssetRotation, point);
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
      this.clearBuildPreview();
      this.updatePlacementPreviewState(false, false);
      return false;
    }
    const cells = getPlacedAssetCells(candidate);
    const blockedReason = getAssetPlacementError(this.placementLayout ?? this.layout, getOutdoorBounds(this.floor), candidate)
      ?? (this.playerAssetPlacement && getPlayerAssetRoomError(
        this.placementLayout ?? this.layout,
        candidate,
        this.playerAssetPlacement.userId,
        this.playerAssetPlacement.settings,
        this.playerAssetPlacement.organisation,
        this.playerAssetPlacement.officeBuilder,
      ))
      ?? (this.placementOverlapsPlayers(cells.filter((cell) => cell.solid).map((cell) => ({
        x: cell.worldX,
        y: cell.worldY,
        width: ASSET_RASTER_SIZE,
        height: ASSET_RASTER_SIZE,
      })), candidate.id === "preview" ? undefined : candidate.id) ? "PLAYER_IN_THE_WAY" : undefined);
    const blocked = Boolean(blockedReason);
    this.buildPreview.clear();
    const definition = requireAssetDefinition(candidate.assetId);
    const bounds = getPlacedAssetBounds(candidate);
    const indicatorColor = blocked ? "#b12f2f" : "#5143bd";
    if (definition.radius) {
      drawAssetRadius(this.buildPreview, bounds, definition.radius, indicatorColor, 0.06, 0.62);
    }
    const key = [candidate.assetId, candidate.variantId, candidate.rotation, this.colorTheme, getWorldAssetSurfaceOffset(this.layout, candidate),
      ...(definition.kind === "floor-tile" ? [candidate.x, candidate.y, this.layout.revision] : [])].join(":");
    if (this.assetPreview?.key !== key) {
      this.assetPreview?.container.destroy({ children: true });
      const view = createWorldAssetView(this.assetTextures, candidate, this.layout, this.colorTheme, this.callbacks.current.onArtworkError);
      this.assetPreviewLayer.addChild(view.container);
      this.assetPreview = { key, container: view.container };
    }
    this.assetPreview.container.position.set(candidate.x, candidate.y);
    this.assetPreview.container.alpha = blocked ? 0.4 : 0.76;
    if (definition.placement.layer === "surface") {
      const artworkBounds = getPlacedWorldAssetBounds(this.layout, candidate);
      this.buildPreview
        .rect(artworkBounds.x - 1, artworkBounds.y - 1, artworkBounds.width + 2, artworkBounds.height + 2)
        .fill({ color: indicatorColor, alpha: blocked ? 0.18 : 0.04 })
        .stroke({ color: indicatorColor, width: 1.5, alpha: 0.9 });
    } else {
      const cellRects = getPlacedAssetCellRects(candidate);
      const previewRects = definition.kind === "floor-tile" ? getFlooringVisibleRects(this.layout, cellRects) : cellRects;
      for (const rect of previewRects) {
        this.buildPreview
          .roundRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2, 2)
          .fill({ color: indicatorColor, alpha: blocked ? 0.18 : 0.04 })
          .stroke({ color: indicatorColor, width: 1.5, alpha: 0.9 });
      }
    }
    drawAssetDirectionIndicators(this.buildPreview, getAssetDirectionIndicators(candidate, this.layout, this.zoom), indicatorColor);
    this.updatePlacementPreviewState(true, !blocked, blockedReason);
    return !blocked;
  }

  private clearBuildPreview(): Graphics {
    this.assetPreview?.container.destroy({ children: true });
    this.assetPreview = undefined;
    return this.buildPreview.clear();
  }

  private updatePlacementPreviewState(hasPoint: boolean, canPlace: boolean, blockedReason?: AssetPlacementBlockReason): void {
    if (this.placementPreviewState.hasPoint === hasPoint && this.placementPreviewState.canPlace === canPlace
      && this.placementPreviewState.blockedReason === blockedReason) {
      return;
    }
    this.placementPreviewState = { hasPoint, canPlace, blockedReason };
    this.callbacks.current.onPlacementPreviewStateChange(this.placementPreviewState);
  }

  private drawWallPreview(edit: Extract<LayoutEdit, { tool: "wall" }>): boolean {
    return this.drawWallCandidate({ id: "preview", start: edit.start, end: edit.end });
  }

  private drawWallCandidate(wall: Wall, ignoredWallIds: ReadonlySet<string> = new Set()): boolean {
    if (!this.layout || !this.placementLayout || !this.floor) {
      this.clearBuildPreview();
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
    this.clearBuildPreview();
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
      this.clearBuildPreview();
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
    this.clearBuildPreview();
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
      this.commitPlacement();
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

  private hitAssetArtwork(object: WorldObject, point: { x: number; y: number }): boolean {
    if (!this.layout) return false;
    return this.assetTextures.isPointVisible(getPlacedWorldAssetArtwork(this.layout, object), point.x - object.x, point.y - object.y);
  }

  private hitBuildAsset(object: WorldObject, point: { x: number; y: number }, minimumTargetSize: number): boolean {
    if (this.layout && requireAssetDefinition(object.assetId).kind === "floor-tile") {
      return getFlooringVisibleRects(this.layout, [getPlacedAssetBounds(object)]).some((rect) => pointInRect(point.x, point.y, rect));
    }
    if (this.hitAssetArtwork(object, point)) return true;
    const surface = requireAssetDefinition(object.assetId).placement.layer === "surface";
    if (surface && this.layout && pointInRect(point.x, point.y, getPlacedWorldAssetBounds(this.layout, object))) return true;
    if (!surface && isPointInPlacedAsset(point.x, point.y, object)) return true;
    if (minimumTargetSize <= 0 || !this.layout) return false;
    const bounds = surface ? getPlacedWorldAssetBounds(this.layout, object) : getPlacedAssetBounds(object);
    return isPointInWorldTarget(point.x, point.y, bounds, minimumTargetSize);
  }

  private selectBuildItem(point: { x: number; y: number }, minimumTargetSize: number): void {
    this.callbacks.current.onBuildItemSelect(this.getBuildTarget(point, minimumTargetSize, false));
  }

  private getBuildTarget(point: { x: number; y: number }, minimumTargetSize: number, removing: boolean): LayoutItemReference | undefined {
    if (!this.placementLayout) return undefined;
    const personalOnly = this.playerAssetPlacement && !this.playerAssetPlacement.officeBuilder;
    if (!personalOnly) {
      const opening = [...this.placementLayout.openings].reverse().find((candidate) => {
        const wall = this.placementLayout?.walls.find((item) => item.id === candidate.wallId);
        return wall && isPointInWorldTarget(point.x, point.y, getOpeningRect(wall, candidate, BUILD_GRID_SIZE), minimumTargetSize);
      });
      if (opening) return { type: "opening", id: opening.id };
    }
    const object = getBuildSelectionCandidates(this.placementLayout.objects)
      .find((candidate) => this.hitBuildAsset(candidate, point, minimumTargetSize));
    if (object) {
      if (this.playerAssetPlacement && (
        personalOnly && object.ownerUserId !== this.playerAssetPlacement.userId
        || object.ownerUserId && object.ownerUserId !== this.playerAssetPlacement.userId
      )) return undefined;
      return removing && requireAssetDefinition(object.assetId).kind === "portal" ? undefined : { type: "asset", id: object.id };
    }
    if (personalOnly) return undefined;
    const wallPoint = removing ? { x: snapToAssetRaster(point.x), y: snapToAssetRaster(point.y) } : point;
    if (removing && (
      this.placementLayout.openings.some((candidate) => {
        const wall = this.placementLayout?.walls.find((item) => item.id === candidate.wallId);
        return wall && pointInRect(wallPoint.x, wallPoint.y, getOpeningRect(wall, candidate, BUILD_GRID_SIZE));
      }) || this.placementLayout.objects.some((candidate) => isPointInPlacedAsset(wallPoint.x, wallPoint.y, candidate))
    )) return undefined;
    const wall = [...this.placementLayout.walls].reverse().find((candidate) => isPointInWorldTarget(
      wallPoint.x, wallPoint.y, getWallRect(candidate, BUILD_GRID_SIZE), minimumTargetSize,
    ));
    return wall ? { type: "wall", id: wall.id } : undefined;
  }

  private drawBuildHover(): void {
    this.hoverOverlay.clear();
    if (!this.editing || !this.hoverPoint || this.movingBuildItem || (this.editingTool !== null && this.editingTool !== "erase")) return;
    const removing = this.editingTool === "erase";
    const target = this.getBuildTarget(this.hoverPoint, this.hoverClientPoint?.pointerType === "pen" ? this.getTouchTargetWorldSize() : 0, removing);
    if (target) this.drawBuildItem(this.hoverOverlay, target, removing ? "#c93636" : "#2986b8", removing ? this.hoverPoint : undefined);
  }

  private drawBuildSelection(): void {
    this.selectionOverlay.clear();
    if (this.editing && this.selectedBuildItem) this.drawBuildItem(this.selectionOverlay, this.selectedBuildItem, "#5143bd");
  }

  private drawBuildItem(graphics: Graphics, item: LayoutItemReference, color: string, erasePoint?: { x: number; y: number }): void {
    if (!this.placementLayout) return;
    if (item.type === "asset") {
      const object = this.placementLayout.objects.find((candidate) => candidate.id === item.id);
      if (!object) {
        return;
      }
      const definition = requireAssetDefinition(object.assetId);
      const bounds = getPlacedAssetBounds(object);
      if (definition.radius) {
        drawAssetRadius(graphics, bounds, definition.radius, color, 0.04, 0.5);
      }
      const artworkBounds = getPlacedWorldAssetBounds(this.placementLayout, object);
      const flooring = definition.kind === "floor-tile";
      const selectionRects = flooring ? getFlooringVisibleRects(this.placementLayout, [artworkBounds]) : [artworkBounds];
      const inset = flooring ? 1 : -1;
      for (const rect of selectionRects) {
        graphics
          .rect(rect.x + inset, rect.y + inset, rect.width - inset * 2, rect.height - inset * 2)
          .stroke({ color, width: 2, alpha: 0.9 });
      }
      drawAssetDirectionIndicators(graphics, getAssetDirectionIndicators(object, this.placementLayout, this.zoom), color);
      return;
    }
    if (item.type === "wall") {
      const wall = this.placementLayout.walls.find((candidate) => candidate.id === item.id);
      if (wall) {
        let highlightedWall = wall;
        if (erasePoint) {
          const snappedX = snapToAssetRaster(erasePoint.x);
          const snappedY = snapToAssetRaster(erasePoint.y);
          const normalized = normalizeWall(wall);
          const { start, end } = getWallSectionRange(normalized, this.placementLayout.walls, snappedX, snappedY);
          highlightedWall = normalized.start.y === normalized.end.y
            ? { ...normalized, start: { x: normalized.start.x + start, y: normalized.start.y }, end: { x: normalized.start.x + end, y: normalized.end.y } }
            : { ...normalized, start: { x: normalized.start.x, y: normalized.start.y + start }, end: { x: normalized.end.x, y: normalized.start.y + end } };
        }
        const rect = getWallRect(highlightedWall, WALL_THICKNESS + 8);
        graphics.rect(rect.x, rect.y, rect.width, rect.height).stroke({ color, width: 3, alpha: 0.9 });
      }
      return;
    }
    const opening = this.placementLayout.openings.find((candidate) => candidate.id === item.id);
    const wall = opening ? this.placementLayout.walls.find((candidate) => candidate.id === opening.wallId) : undefined;
    if (opening && wall) {
      const rect = getOpeningRect(wall, opening, BUILD_GRID_SIZE);
      graphics.rect(rect.x, rect.y, rect.width, rect.height).stroke({ color, width: 3, alpha: 0.9 });
    }
  }

  private placementOverlapsPlayers(rects: Rect[], ignoredSeatObjectId?: string): boolean {
    return this.players.some((player) => (
      player.connected
      && (!ignoredSeatObjectId || player.seat?.objectId !== ignoredSeatObjectId)
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

function getBuildSelectionCandidates(objects: WorldObject[]): WorldObject[] {
  const layerPriority = { ground: 0, floor: 1, surface: 2 } as const;
  return objects
    .map((object, index) => ({ object, index }))
    .sort((left, right) => (
      layerPriority[requireAssetDefinition(right.object.assetId).placement.layer]
      - layerPriority[requireAssetDefinition(left.object.assetId).placement.layer]
      || Number(requireAssetDefinition(right.object.assetId).kind === "rug") - Number(requireAssetDefinition(left.object.assetId).kind === "rug")
      || getWorldAssetDepth(right.object).y - getWorldAssetDepth(left.object).y
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
