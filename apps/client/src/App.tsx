import {
  ArrowRight,
  BellRing,
  DoorOpen,
  Hand,
  LockKeyhole,
  Minimize2,
  Phone,
  Play,
  Radio,
  RotateCw,
  ServerCog,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ASSET_CATALOG,
  GONG_INTERACTION_RANGE,
  getAssetDefinition,
  getDefaultAssetVariantId,
  getCenteredAssetPosition,
  getCorrespondingFloorPortals,
  getFloorPortals,
  getPlacedAssetBounds,
  getPlacedAssetInteraction,
  getPlacedAssetInteractions,
  getRoomDoorPosition,
  getWallLength,
  getWallOrientation,
  mergeWallSegments,
  normalizeWall,
  hasMemberPermission,
  kidnappingPolicyAllows,
  requireAssetVariant,
  TETRIS_DEFINITION_ID,
} from "@workhard/shared";
import type {
  AssignableMemberPermission,
  AssetRotation,
  Room,
  RoomKnock,
  RoomSettings,
  BootstrapData,
  ClientCommand,
  Door,
  GameLobbyState,
  GameRoundState,
  GameState,
  LayoutEdit,
  LayoutTool,
  LayoutItemReference,
  Meeting,
  MemberRole,
  PlayerGameStatistics,
  ReactionKind,
  RegistrationAvailability,
  RegistrationSettings,
  ServerEvent,
  WorldObject,
  WorldPlayer,
} from "@workhard/shared";
import { acceptInvitation, ApiError, changeMemberAccess, createDirectConversation, fetchBootstrap, fetchSession, inviteMember, isConnectionError, logout, removePlayerAvatar, revokeInvitation, updateRegistrationSettings, uploadChatImage, uploadPlayerAvatar, verifyMagicLink } from "./api";
import { Avatar } from "./components/Avatar";
import { AvatarDialog } from "./components/AvatarDialog";
import { RoomKnockNotice } from "./components/RoomKnockNotice";
import { AuthScreen } from "./components/AuthScreen";
import { BuildPanel } from "./components/BuildPanel";
import { PlayerBuildPanel } from "./components/PlayerBuildPanel";
import { CallNotice, type ActiveCall } from "./components/CallNotice";
import { ChatPanel } from "./components/ChatPanel";
import { Dock } from "./components/Dock";
import { IconButton } from "./components/IconButton";
import { MeetingOverlay } from "./components/MeetingOverlay";
import { MeetingSwitchDialog } from "./components/MeetingSwitchDialog";
import { MeetingsPanel } from "./components/MeetingsPanel";
import { NavRail, type WorkspacePanel } from "./components/NavRail";
import { PeoplePanel } from "./components/PeoplePanel";
import { KidnappingSettingsPanel } from "./components/KidnappingSettingsPanel";
import { ProximityCallNotice } from "./components/ProximityCallNotice";
import { ProximityMedia } from "./components/ProximityMedia";
import { TetrisGame } from "./components/TetrisGame";
import { TetrisLobby } from "./components/TetrisLobby";
import { TopBar } from "./components/TopBar";
import type { ContextAnchor } from "./components/WorldCanvas";
import { preloadWorldCanvas, WorldCanvas } from "./components/WorldCanvasLoader";
import { playGongChime, prepareGongChime } from "./gong-audio";
import { GONG_EFFECT_DURATION_MS, type DisplayGongRing } from "./gong";
import { useRealtime } from "./hooks/useRealtime";
import { REACTION_LABEL, REACTION_OPTIONS, type DisplayHighFive, type DisplayReaction } from "./reactions";
import { mergeWorkspaceSnapshot } from "./workspace-state";
import { applyColorTheme, getInitialColorTheme, type ColorTheme } from "./theme";
import { rotateAssetClockwise } from "./asset-orientation";

type WorldSelection =
  | { type: "object"; object: WorldObject; interactionId?: string; anchor?: ContextAnchor }
  | { type: "player"; userId: string; anchor?: ContextAnchor };

interface WorldFocusTarget {
  userId: string;
  requestId: string;
}

type PendingEconomyRequest =
  | { id: string; type: "daily" }
  | { id: string; type: "purchase"; assetId: string };

type MeetingView = "full" | "small";

const REACTION_DURATION_MS = 3_200;
const HIGH_FIVE_DURATION_MS = 2_200;
const OFFLINE_RECOVERY_PROBE_MS = 30_000;
const DEFAULT_ASSET = ASSET_CATALOG.assets.find((asset) => asset.buildable)!;
const DEFAULT_ASSET_ID = DEFAULT_ASSET.id;
const DEFAULT_ASSET_VARIANT_ID = getDefaultAssetVariantId(DEFAULT_ASSET);
const AUTH_TOKENS_HISTORY_KEY = "northstarAuthTokens";

interface AuthTokens {
  magic?: string;
  invitation?: string;
}

interface InitialWorkspaceState {
  data: BootstrapData | undefined;
  registration: RegistrationAvailability;
  setupRequired: boolean;
}

let initialWorkspacePromise: Promise<InitialWorkspaceState> | undefined;
let initialMagicToken: string | undefined;
let initialInvitationToken: string | undefined;
let initialAuthTokensRead = false;

function restoreInitialWorkspace(): Promise<InitialWorkspaceState> {
  if (!initialAuthTokensRead) {
    const tokens = takeAuthTokens();
    initialMagicToken = tokens.magic;
    initialInvitationToken = tokens.invitation;
    initialAuthTokensRead = true;
  }
  if (!initialWorkspacePromise) {
    const pending = (async () => {
      const magicToken = initialMagicToken;
      if (magicToken) {
        await verifyMagicLink(magicToken);
      }
      const session = await fetchSession();
      if (session.user) {
        preloadWorldCanvas();
      }
      if (magicToken) {
        discardInitialMagicToken();
      }
      if (session.user && initialInvitationToken) {
        await acceptInvitation(initialInvitationToken);
        clearInitialInvitationToken();
      }
      return {
        data: session.user ? await fetchBootstrap() : undefined,
        registration: session.registration,
        setupRequired: session.setupRequired,
      };
    })();
    initialWorkspacePromise = pending;
    void pending.then(
      () => clearInitialWorkspacePromise(pending),
      () => clearInitialWorkspacePromise(pending),
    );
  }
  return initialWorkspacePromise!;
}

function clearInitialWorkspacePromise(pending: Promise<InitialWorkspaceState>): void {
  if (initialWorkspacePromise === pending) {
    initialWorkspacePromise = undefined;
  }
}

function discardInitialMagicToken(): void {
  initialMagicToken = undefined;
  synchronizeAuthTokenHistory();
}

function discardInitialInvitationToken(reason: unknown): void {
  if (
    reason instanceof ApiError
    && reason.code?.startsWith("INVITATION_")
    && reason.code !== "INVITATION_EMAIL_MISMATCH"
  ) {
    clearInitialInvitationToken();
  }
}

function clearInitialInvitationToken(): void {
  initialInvitationToken = undefined;
  synchronizeAuthTokenHistory();
}

export function App() {
  const [colorTheme, setColorTheme] = useState<ColorTheme>(getInitialColorTheme);
  const [bootstrap, setBootstrap] = useState<BootstrapData>();
  const [authState, setAuthState] = useState<"loading" | "signed-out" | "signed-in">("loading");
  const [registration, setRegistration] = useState<RegistrationAvailability>({
    enabled: false,
    invitationRequired: true,
  });
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState<string>();
  const [invitationEmailMismatch, setInvitationEmailMismatch] = useState(false);
  const [restoreVersion, setRestoreVersion] = useState(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const recoveryAttempt = useRef(0);
  const recoveryPending = useRef(false);

  useLayoutEffect(() => {
    applyColorTheme(colorTheme);
  }, [colorTheme]);

  const finishRecovery = useCallback(() => {
    recoveryPending.current = false;
    recoveryAttempt.current = 0;
    if (retryTimer.current !== undefined) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = undefined;
    }
  }, []);

  const scheduleRecovery = useCallback(() => {
    recoveryPending.current = true;
    if (retryTimer.current !== undefined) {
      return;
    }
    const browserReportsOnline = navigator.onLine;
    const backoff = Math.min(8_000, 1_000 * 2 ** Math.min(recoveryAttempt.current, 3));
    const delay = browserReportsOnline
      ? Math.round(backoff * (0.8 + Math.random() * 0.4))
      : OFFLINE_RECOVERY_PROBE_MS;
    if (browserReportsOnline) {
      recoveryAttempt.current += 1;
    }
    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = undefined;
      setRestoreVersion((current) => current + 1);
    }, delay);
  }, []);

  const retryRecovery = useCallback(() => {
    if (!recoveryPending.current) {
      return;
    }
    if (retryTimer.current !== undefined) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = undefined;
    }
    recoveryAttempt.current = 0;
    setRestoreVersion((current) => current + 1);
  }, []);

  const loadWorkspace = useCallback(async (invitationAccepted = false) => {
    setAuthState("loading");
    setError(undefined);
    setInvitationEmailMismatch(false);
    try {
      preloadWorldCanvas();
      if (invitationAccepted) {
        clearInitialInvitationToken();
      }
      if (initialInvitationToken) {
        await acceptInvitation(initialInvitationToken);
        clearInitialInvitationToken();
      }
      const data = await fetchBootstrap();
      finishRecovery();
      setSetupRequired(false);
      setBootstrap(data);
      setAuthState("signed-in");
    } catch (reason) {
      discardInitialInvitationToken(reason);
      setInvitationEmailMismatch(reason instanceof ApiError && reason.code === "INVITATION_EMAIL_MISMATCH");
      setError(reason instanceof Error ? reason.message : "Office could not be loaded.");
      if (isConnectionError(reason)) {
        scheduleRecovery();
      }
    }
  }, [finishRecovery, scheduleRecovery]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const restored = await restoreInitialWorkspace();
        if (!active) {
          return;
        }
        finishRecovery();
        setInvitationEmailMismatch(false);
        setError(undefined);
        setRegistration(restored.registration);
        setSetupRequired(restored.setupRequired);
        if (!restored.data) {
          setAuthState("signed-out");
          return;
        }
        setBootstrap(restored.data);
        setAuthState("signed-in");
      } catch (reason) {
        if (!active) {
          return;
        }
        setError(reason instanceof Error ? reason.message : "Authentication failed.");
        if (isConnectionError(reason)) {
          scheduleRecovery();
          return;
        }
        finishRecovery();
        discardInitialInvitationToken(reason);
        setInvitationEmailMismatch(reason instanceof ApiError && reason.code === "INVITATION_EMAIL_MISMATCH");
        const authenticationFailed = initialMagicToken !== undefined
          || (reason instanceof ApiError && reason.status === 401);
        discardInitialMagicToken();
        setAuthState(authenticationFailed ? "signed-out" : "loading");
      }
    };
    void restore();
    return () => {
      active = false;
    };
  }, [finishRecovery, restoreVersion, scheduleRecovery]);

  useEffect(() => {
    const handleOnline = () => retryRecovery();
    const handleResume = () => retryRecovery();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        retryRecovery();
      }
    };
    const handleOffline = () => {
      if (retryTimer.current !== undefined) {
        window.clearTimeout(retryTimer.current);
        retryTimer.current = undefined;
      }
      if (recoveryPending.current) {
        scheduleRecovery();
      }
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pageshow", handleResume);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pageshow", handleResume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (retryTimer.current !== undefined) {
        window.clearTimeout(retryTimer.current);
        retryTimer.current = undefined;
      }
    };
  }, [retryRecovery, scheduleRecovery]);

  if (authState === "signed-out") {
    return (
      <AuthScreen
        initialError={error}
        invitationToken={initialInvitationToken}
        registrationsEnabled={registration.enabled}
        invitationRequired={registration.invitationRequired}
        setupRequired={setupRequired}
        onAuthenticated={loadWorkspace}
        onServerChanged={() => {
          finishRecovery();
          setError(undefined);
          setSetupRequired(false);
          setAuthState("loading");
          setRestoreVersion((current) => current + 1);
        }}
      />
    );
  }

  const switchInvitationAccount = async () => {
    try {
      await logout();
      setBootstrap(undefined);
      setSetupRequired(false);
      setError(undefined);
      setInvitationEmailMismatch(false);
      setAuthState("signed-out");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out.");
    }
  };

  if (error) {
    return (
      <main className="load-state error-state">
        <span className="load-mark"><X size={22} /></span>
        <h1>{error}</h1>
        {invitationEmailMismatch
          ? <button onClick={() => void switchInvitationAccount()}><DoorOpen size={16} />Sign out</button>
          : (
            <>
              <button onClick={() => recoveryPending.current ? retryRecovery() : window.location.reload()}><RotateCw size={16} />Retry</button>
              <button onClick={() => {
                finishRecovery();
                setAuthState("signed-out");
              }}><ServerCog size={16} />Server</button>
            </>
          )}
      </main>
    );
  }

  if (!bootstrap) {
    return (
      <main className="load-state" aria-label="Loading office">
        <span className="load-mark"><Radio size={22} /></span>
      </main>
    );
  }

  const signOut = async () => {
    await logout();
    setBootstrap(undefined);
    setSetupRequired(false);
    setAuthState("signed-out");
  };

  const handleSessionExpired = () => {
    setBootstrap(undefined);
    setSetupRequired(false);
    setError("Session expired. Sign in again.");
    setAuthState("signed-out");
  };

  return (
    <Workspace
      key={bootstrap.currentUserId}
      initialData={bootstrap}
      colorTheme={colorTheme}
      onColorThemeChange={setColorTheme}
      onRegistrationSettingsChange={({ enabled, invitationRequired }) => {
        setRegistration({ enabled, invitationRequired });
      }}
      onSignOut={signOut}
      onSessionExpired={handleSessionExpired}
    />
  );
}

export function Workspace({
  initialData,
  colorTheme = "light",
  onColorThemeChange = () => undefined,
  onRegistrationSettingsChange = () => undefined,
  onSignOut,
  onSessionExpired,
}: {
  initialData: BootstrapData;
  colorTheme?: ColorTheme;
  onColorThemeChange?: (theme: ColorTheme) => void;
  onRegistrationSettingsChange?: (settings: RegistrationSettings) => void;
  onSignOut: () => Promise<void>;
  onSessionExpired: () => void;
}) {
  const [data, setData] = useState(initialData);
  const [floorId, setFloorId] = useState(initialData.members.find((member) => member.id === initialData.currentUserId)?.floorId ?? initialData.floors[0]!.id);
  const [activePanel, setActivePanel] = useState<WorkspacePanel>(() => window.innerWidth > 980 ? "people" : null);
  const [conversationId, setConversationId] = useState(initialData.conversations[0]!.id);
  const [editingTool, setEditingTool] = useState<LayoutTool | null>(null);
  const [editingAssetId, setEditingAssetId] = useState(DEFAULT_ASSET_ID);
  const [editingAssetVariantId, setEditingAssetVariantId] = useState(DEFAULT_ASSET_VARIANT_ID);
  const [editingAssetRotation, setEditingAssetRotation] = useState<AssetRotation>(0);
  const [selection, setSelection] = useState<WorldSelection>();
  const [buildSelection, setBuildSelection] = useState<LayoutItemReference>();
  const [movingBuildItem, setMovingBuildItem] = useState<LayoutItemReference>();
  const [placingOwnedAssetId, setPlacingOwnedAssetId] = useState<string>();
  const [pendingEconomyRequest, setPendingEconomyRequest] = useState<PendingEconomyRequest>();
  const [meetingId, setMeetingId] = useState<string>();
  const [meetingView, setMeetingView] = useState<MeetingView>("full");
  const [gameOpen, setGameOpen] = useState(false);
  const [gameLobby, setGameLobby] = useState<GameLobbyState>();
  const [gameRound, setGameRound] = useState<GameRoundState>();
  const [gameState, setGameState] = useState<GameState>();
  const [muted, setMuted] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [capturedProximityMedia, setCapturedProximityMedia] = useState({ microphone: false, camera: false });
  const [activeCall, setActiveCall] = useState<ActiveCall>();
  const [reactions, setReactions] = useState<DisplayReaction[]>([]);
  const [highFives, setHighFives] = useState<DisplayHighFive[]>([]);
  const [gongRings, setGongRings] = useState<DisplayGongRing[]>([]);
  const [gongCooldowns, setGongCooldowns] = useState<Record<string, number>>({});
  const [gongClock, setGongClock] = useState(() => Date.now());
  const [reactionAnnouncement, setReactionAnnouncement] = useState("");
  const [incomingKnocks, setIncomingKnocks] = useState<RoomKnock[]>([]);
  const [pendingRoomIds, setPendingRoomIds] = useState<Set<string>>(() => new Set());
  const [grantedRoomIds, setGrantedRoomIds] = useState<Set<string>>(() => new Set());
  const [dismissedDoorEntryId, setDismissedDoorEntryId] = useState<string>();
  const [openingMeeting, setOpeningMeeting] = useState<{ meetingId: string; view: MeetingView }>();
  const [leavingMeetingId, setLeavingMeetingId] = useState<string>();
  const [meetingSwitch, setMeetingSwitch] = useState<{ meeting: Meeting; view: MeetingView; consequence: string }>();
  const [focusTarget, setFocusTarget] = useState<WorldFocusTarget>();
  const [toast, setToast] = useState<string>();
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [invitationLinks, setInvitationLinks] = useState<Record<string, string>>({});
  const toastTimer = useRef<number | undefined>(undefined);
  const callDismissTimer = useRef<number | undefined>(undefined);
  const reactionTimers = useRef(new Map<string, number>());
  const highFiveTimers = useRef(new Map<string, number>());
  const gongTimers = useRef(new Map<string, number>());
  const announcedGongIds = useRef(new Set<string>());
  const connectionWasOnline = useRef(false);
  const activeFloorIdRef = useRef(floorId);
  const pendingTravelFocus = useRef<{ requestId: string; floorId: string; focusUserId?: string } | undefined>(undefined);
  const pendingDoorEntryRequestId = useRef<string | undefined>(undefined);
  const pendingKnockRequest = useRef<{ requestId: string; roomId: string } | undefined>(undefined);
  const pendingMeetingOpen = useRef<{ requestId: string; meetingId: string; view: MeetingView } | undefined>(undefined);
  const activeMeetingId = useRef<string | undefined>(undefined);
  const pendingLayoutMove = useRef<string | undefined>(undefined);
  const pendingMeetingLeave = useRef<{ requestId: string; meetingId: string } | undefined>(undefined);
  const pendingEconomyRequestRef = useRef<PendingEconomyRequest | undefined>(undefined);
  const pendingPlayerAssetRequest = useRef<{ requestId: string; type: "place" | "move" | "remove" } | undefined>(undefined);

  const currentUser = data.members.find((member) => member.id === data.currentUserId)!;
  const canBuild = hasMemberPermission(currentUser, "build");
  const canManageMembers = hasMemberPermission(currentUser, "manage_members");
  const floor = data.floors.find((item) => item.id === floorId) ?? data.floors[0]!;
  const layout = data.layouts.find((item) => item.floorId === floor.id) ?? data.layouts[0]!;
  const allRooms = useMemo(() => data.layouts.flatMap((item) => item.rooms), [data.layouts]);
  const floorPortals = useMemo(() => getFloorPortals(data.floors, data.layouts), [data.floors, data.layouts]);
  const playerAssetPlacement = useMemo(() => canBuild ? undefined : {
    userId: data.currentUserId,
    settings: data.gameSettings,
  }, [canBuild, data.currentUserId, data.gameSettings]);
  const currentMeeting = data.meetings.find((meeting) => meeting.id === meetingId);
  const visibleRoomIds = useMemo(() => new Set(allRooms.map((room) => room.id)), [allRooms]);
  const visibleMeetings = useMemo(
    () => data.meetings.filter((meeting) => meeting.location.type === "public" || visibleRoomIds.has(meeting.location.roomId)),
    [data.meetings, visibleRoomIds],
  );
  const visibleMeetingIds = useMemo(() => new Set(visibleMeetings.map((meeting) => meeting.id)), [visibleMeetings]);
  const visibleConversations = useMemo(() => data.conversations.filter((conversation) => {
    if (conversation.type === "room") {
      return Boolean(conversation.roomId && visibleRoomIds.has(conversation.roomId));
    }
    if (conversation.type === "meeting") {
      return Boolean(conversation.meetingId && visibleMeetingIds.has(conversation.meetingId));
    }
    return true;
  }), [data.conversations, visibleMeetingIds, visibleRoomIds]);
  const activeConversationId = visibleConversations.some((conversation) => conversation.id === conversationId)
    ? conversationId
    : visibleConversations[0]?.id;

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToast(undefined), 2_800);
  }, []);

  const displayReaction = useCallback((reaction: Omit<DisplayReaction, "expiresAt">) => {
    const previousTimer = reactionTimers.current.get(reaction.userId);
    if (previousTimer) {
      window.clearTimeout(previousTimer);
    }
    const expiresAt = Date.now() + REACTION_DURATION_MS;
    setReactions((current) => [
      ...current.filter((candidate) => candidate.userId !== reaction.userId),
      { ...reaction, expiresAt },
    ]);
    const member = data.members.find((candidate) => candidate.id === reaction.userId);
    setReactionAnnouncement(`${member?.name ?? "Someone"}: ${REACTION_LABEL[reaction.reaction]}`);
    const timer = window.setTimeout(() => {
      setReactions((current) => current.filter((candidate) => candidate.id !== reaction.id));
      if (reactionTimers.current.get(reaction.userId) === timer) {
        reactionTimers.current.delete(reaction.userId);
      }
    }, REACTION_DURATION_MS);
    reactionTimers.current.set(reaction.userId, timer);
  }, [data.members]);

  const displayHighFive = useCallback((highFive: Omit<DisplayHighFive, "expiresAt">) => {
    const previousTimer = highFiveTimers.current.get(highFive.id);
    if (previousTimer) {
      window.clearTimeout(previousTimer);
    }
    const expiresAt = Date.now() + HIGH_FIVE_DURATION_MS;
    setHighFives((current) => [...current.filter((candidate) => candidate.id !== highFive.id), { ...highFive, expiresAt }]);
    const timer = window.setTimeout(() => {
      setHighFives((current) => current.filter((candidate) => candidate.id !== highFive.id));
      if (highFiveTimers.current.get(highFive.id) === timer) {
        highFiveTimers.current.delete(highFive.id);
      }
    }, HIGH_FIVE_DURATION_MS);
    highFiveTimers.current.set(highFive.id, timer);
  }, []);

  const displayGongRing = useCallback((ring: DisplayGongRing) => {
    const previousTimer = gongTimers.current.get(ring.id);
    if (previousTimer) {
      window.clearTimeout(previousTimer);
    }
    setGongRings((current) => [...current.filter((candidate) => candidate.id !== ring.id), ring]);
    const timer = window.setTimeout(() => {
      setGongRings((current) => current.filter((candidate) => candidate.id !== ring.id));
      announcedGongIds.current.delete(ring.id);
      if (gongTimers.current.get(ring.id) === timer) {
        gongTimers.current.delete(ring.id);
      }
    }, Math.max(0, ring.expiresAt - Date.now()));
    gongTimers.current.set(ring.id, timer);
  }, []);

  const announceOffscreenGong = useCallback((ring: DisplayGongRing) => {
    if (
      ring.userId === data.currentUserId
      || currentUser.availability === "dnd"
      || currentMeeting
      || announcedGongIds.current.has(ring.id)
    ) {
      return;
    }
    announcedGongIds.current.add(ring.id);
    const ringer = data.members.find((member) => member.id === ring.userId);
    showToast(`${ringer?.name ?? "Someone"} rang the gong.`);
  }, [currentMeeting, currentUser.availability, data.currentUserId, data.members, showToast]);

  useEffect(() => {
    let prepared = false;
    const prepare = () => {
      if (prepared) {
        return;
      }
      prepared = true;
      window.removeEventListener("pointerdown", prepare);
      window.removeEventListener("keydown", prepare);
      void prepareGongChime().catch(() => undefined);
    };
    window.addEventListener("pointerdown", prepare);
    window.addEventListener("keydown", prepare);
    return () => {
      window.removeEventListener("pointerdown", prepare);
      window.removeEventListener("keydown", prepare);
    };
  }, []);

  useEffect(() => {
    const cooldowns = Object.values(gongCooldowns);
    if (cooldowns.every((cooldownUntil) => cooldownUntil <= Date.now())) {
      return;
    }
    const updateClock = () => {
      const now = Date.now();
      setGongClock(now);
      if (cooldowns.every((cooldownUntil) => cooldownUntil <= now)) {
        window.clearInterval(timer);
      }
    };
    const timer = window.setInterval(updateClock, 500);
    updateClock();
    return () => window.clearInterval(timer);
  }, [gongCooldowns]);

  useEffect(() => () => {
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }
    if (callDismissTimer.current) {
      window.clearTimeout(callDismissTimer.current);
    }
    for (const timer of reactionTimers.current.values()) {
      window.clearTimeout(timer);
    }
    for (const timer of highFiveTimers.current.values()) {
      window.clearTimeout(timer);
    }
    for (const timer of gongTimers.current.values()) {
      window.clearTimeout(timer);
    }
  }, []);

  const handleRealtimeEvent = useCallback((event: ServerEvent) => {
    if (event.type === "session.ready") {
      const floorChanged = event.floorId !== activeFloorIdRef.current;
      activeFloorIdRef.current = event.floorId;
      if (floorChanged) {
        setFloorId(event.floorId);
        setSelection(undefined);
        setBuildSelection(undefined);
        setMovingBuildItem(undefined);
        setPlacingOwnedAssetId(undefined);
        setGameLobby(undefined);
        setIncomingKnocks([]);
        setPendingRoomIds(new Set());
        setGrantedRoomIds(new Set());
        pendingKnockRequest.current = undefined;
      }
      const pending = pendingTravelFocus.current;
      if (pending?.floorId === event.floorId) {
        setFocusTarget(pending.focusUserId ? { userId: pending.focusUserId, requestId: pending.requestId } : undefined);
        pendingTravelFocus.current = undefined;
      } else if (floorChanged) {
        setFocusTarget(undefined);
      }
    } else if (event.type === "workspace.snapshot") {
      setData((current) => mergeWorkspaceSnapshot(
        current,
        event.data,
        activePanel === "chat" ? activeConversationId : undefined,
      ));
    } else if (event.type === "presence.changed") {
      setData((current) => ({
        ...current,
        members: current.members.some((member) => member.id === event.member.id)
          ? current.members.map((member) => member.id === event.member.id ? event.member : member)
          : [...current.members, event.member],
      }));
    } else if (event.type === "conversation.created") {
      setData((current) => current.conversations.some((conversation) => conversation.id === event.conversation.id)
        ? current
        : { ...current, conversations: [...current.conversations, event.conversation] });
    } else if (event.type === "chat.message_created") {
      setData((current) => {
        if (current.messages.some((message) => message.id === event.message.id)) {
          return current;
        }
        const shouldIncrement = event.message.userId !== current.currentUserId
          && (activePanel !== "chat" || activeConversationId !== event.message.conversationId);
        return {
          ...current,
          conversations: shouldIncrement
            ? current.conversations.map((conversation) => conversation.id === event.message.conversationId
              ? { ...conversation, unread: conversation.unread + 1 }
              : conversation)
            : current.conversations,
          messages: [...current.messages, event.message],
        };
      });
    } else if (event.type === "layout.updated") {
      setData((current) => ({ ...current, layouts: current.layouts.map((item) => item.floorId === event.layout.floorId ? event.layout : item) }));
      if (
        pendingLayoutMove.current
        && event.requestId === pendingLayoutMove.current
        && event.layout.floorId === activeFloorIdRef.current
      ) {
        pendingLayoutMove.current = undefined;
        setMovingBuildItem(undefined);
      }
    } else if (event.type === "workspace.access_updated") {
      setData((current) => {
        const unread = new Map(current.conversations.map((conversation) => [conversation.id, conversation.unread]));
        return {
          ...current,
          ...event.access,
          conversations: event.access.conversations.map((conversation) => ({
            ...conversation,
            unread: unread.get(conversation.id) ?? conversation.unread,
          })),
        };
      });
    } else if (event.type === "economy.updated") {
      setData((current) => ({ ...current, economy: event.economy }));
      const pendingEconomy = pendingEconomyRequestRef.current;
      if (event.requestId && pendingEconomy?.id === event.requestId) {
        pendingEconomyRequestRef.current = undefined;
        setPendingEconomyRequest(undefined);
        if (pendingEconomy.type === "daily") {
          const reward = event.transaction?.kind === "daily_bonus" ? event.transaction : undefined;
          if (reward) {
            showToast(`Daily bonus: +${reward.amount} coins.`);
          }
        } else {
          const purchasedAssetId = event.transaction?.kind === "shop_purchase" && event.transaction.assetId
            ? event.transaction.assetId
            : pendingEconomy.assetId;
          const assetName = getAssetDefinition(purchasedAssetId)?.name ?? "Asset";
          showToast(`${assetName} added to inventory.`);
        }
      }
      if (event.requestId && pendingPlayerAssetRequest.current?.requestId === event.requestId) {
        const completed = pendingPlayerAssetRequest.current;
        pendingPlayerAssetRequest.current = undefined;
        pendingLayoutMove.current = undefined;
        setMovingBuildItem(undefined);
        if (completed.type === "place") {
          setPlacingOwnedAssetId(undefined);
          setEditingTool(null);
        }
      }
    } else if (event.type === "game.settings_updated") {
      setData((current) => ({ ...current, gameSettings: event.settings }));
    } else if (event.type === "kidnapping.global_settings_updated") {
      setData((current) => ({
        ...current,
        kidnapping: { ...current.kidnapping, global: event.settings },
      }));
    } else if (event.type === "kidnapping.player_settings_updated") {
      setData((current) => ({
        ...current,
        kidnapping: { ...current.kidnapping, player: event.settings },
      }));
    } else if (event.type === "room.access_snapshot") {
      setGrantedRoomIds(new Set(event.roomIds));
    } else if (event.type === "room.access_revoked") {
      setGrantedRoomIds((current) => {
        const next = new Set(current);
        next.delete(event.roomId);
        return next;
      });
    } else if (event.type === "room.knock_requested") {
      setIncomingKnocks((current) => current.some((knock) => knock.id === event.knock.id) ? current : [...current, event.knock]);
    } else if (event.type === "room.knock_state") {
      setIncomingKnocks((current) => current.filter((knock) => knock.id !== event.knock.id));
      if (event.knock.requesterUserId === data.currentUserId) {
        if (pendingKnockRequest.current?.roomId === event.knock.roomId && event.state !== "pending") {
          pendingKnockRequest.current = undefined;
        }
        setPendingRoomIds((current) => {
          const next = new Set(current);
          if (event.state === "pending") {
            next.add(event.knock.roomId);
          } else {
            next.delete(event.knock.roomId);
          }
          return next;
        });
        if (event.state === "accepted") {
          setGrantedRoomIds((current) => new Set(current).add(event.knock.roomId));
          if (event.responderUserId) {
            const responder = data.members.find((member) => member.id === event.responderUserId);
            showToast(`${responder?.name ?? "Someone"} let you in.`);
          }
        } else if (event.state === "declined") {
          showToast("Entry declined.");
        } else if (event.state === "expired") {
          showToast("No answer.");
        }
      }
    } else if (event.type === "meeting.updated") {
      setData((current) => ({ ...current, meetings: current.meetings.map((meeting) => meeting.id === event.meeting.id ? event.meeting : meeting) }));
    } else if (event.type === "meeting.joined") {
      setData((current) => ({ ...current, meetings: current.meetings.map((meeting) => meeting.id === event.meeting.id ? event.meeting : meeting) }));
      const pending = pendingMeetingOpen.current;
      if (pending?.meetingId === event.meeting.id) {
        pendingMeetingOpen.current = undefined;
        setOpeningMeeting(undefined);
        setMuted(true);
        setCameraOn(false);
        setMeetingView(pending.view);
        if (pending.view === "small") {
          setActivePanel(null);
        }
        activeMeetingId.current = event.meeting.id;
        setMeetingId(event.meeting.id);
      }
    } else if (event.type === "meeting.left") {
      if (pendingMeetingOpen.current?.meetingId === event.meetingId) {
        pendingMeetingOpen.current = undefined;
        setOpeningMeeting(undefined);
      }
      if (pendingMeetingLeave.current?.meetingId === event.meetingId) {
        pendingMeetingLeave.current = undefined;
        setLeavingMeetingId(undefined);
      }
      if (activeMeetingId.current === event.meetingId) {
        activeMeetingId.current = undefined;
        setMuted(true);
        setCameraOn(false);
      }
      setMeetingId((current) => current === event.meetingId ? undefined : current);
    } else if (event.type === "interaction.wave") {
      const personId = event.fromUserId === data.currentUserId ? event.toUserId : event.fromUserId;
      const person = data.members.find((member) => member.id === personId);
      displayReaction({
        id: crypto.randomUUID(),
        userId: event.fromUserId,
        reaction: "wave",
        scope: { type: "floor", floorId: event.floorId },
      });
      showToast(event.fromUserId === data.currentUserId ? `Wave sent to ${person?.name}.` : `${person?.name} waved.`);
    } else if (event.type === "interaction.reaction") {
      displayReaction({
        id: event.id,
        userId: event.userId,
        reaction: event.reaction,
        scope: event.scope,
      });
    } else if (event.type === "interaction.high_five") {
      displayHighFive({ id: event.id, userIds: event.userIds, floorId: event.floorId });
      if (event.userIds.includes(data.currentUserId)) {
        const peerId = event.userIds.find((userId) => userId !== data.currentUserId);
        const peer = data.members.find((member) => member.id === peerId);
        showToast(`High five with ${peer?.name ?? "a teammate"}!`);
      }
    } else if (event.type === "interaction.gong_cooldown") {
      setGongCooldowns((current) => ({
        ...current,
        [event.objectId]: Math.max(current[event.objectId] ?? 0, event.cooldownUntil),
      }));
      setGongClock(Date.now());
    } else if (event.type === "interaction.gong_rang") {
      const startedAt = Date.now();
      const ring: DisplayGongRing = {
        ...event.ring,
        startedAt,
        expiresAt: startedAt + GONG_EFFECT_DURATION_MS,
      };
      setGongCooldowns((current) => ({
        ...current,
        [ring.objectId]: Math.max(current[ring.objectId] ?? 0, ring.cooldownUntil),
      }));
      setGongClock(startedAt);
      displayGongRing(ring);
      if (
        currentUser.availability !== "dnd"
        && !currentMeeting
        && !activeCall
        && document.visibilityState === "visible"
      ) {
        playGongChime();
      }
      if (ring.floorId !== floorId) {
        announceOffscreenGong(ring);
      }
    } else if (event.type === "call.state") {
      if (callDismissTimer.current) {
        window.clearTimeout(callDismissTimer.current);
        callDismissTimer.current = undefined;
      }
      setActiveCall({ callId: event.callId, peerUserId: event.peerUserId, direction: event.direction, state: event.state });
      if (event.state === "declined" && event.direction === "outgoing") {
        showToast("Call declined.");
      }
      if (event.state === "missed") {
        const peer = data.members.find((member) => member.id === event.peerUserId);
        showToast(event.direction === "outgoing" ? "No answer." : `Missed call from ${peer?.name ?? "a coworker"}.`);
      }
      if (event.state === "ended" || event.state === "declined" || event.state === "missed") {
        callDismissTimer.current = window.setTimeout(() => {
          setActiveCall((current) => current?.callId === event.callId ? undefined : current);
          callDismissTimer.current = undefined;
        }, 500);
      }
    } else if (event.type === "game.lobby_updated") {
      setGameLobby(event.lobby);
    } else if (event.type === "game.round_started") {
      if (event.round.participants.some((participant) => participant.userId === data.currentUserId)) {
        setGameRound(event.round);
        setGameState(undefined);
        setGameOpen(true);
      }
    } else if (event.type === "game.round_updated") {
      setGameRound((current) => current?.id === event.round.id ? event.round : current);
    } else if (event.type === "game.state") {
      setGameState(event);
    } else if (event.type === "game.round_completed") {
      setData((current) => ({
        ...current,
        scores: [
          ...event.scores,
          ...current.scores.filter((score) => !event.scores.some((recorded) => recorded.id === score.id)),
        ].sort((left, right) => right.score - left.score),
        gameStatistics: mergeGameStatistics(current.gameStatistics, event.statistics),
      }));
      setGameRound((current) => current?.id === event.round.id ? event.round : current);
      const playerScore = event.scores.find((score) => score.userId === data.currentUserId);
      if (playerScore) {
        const coinReward = event.coinRewards.find((reward) => reward.userId === data.currentUserId)?.amount ?? 0;
        const reward = coinReward > 0 ? ` +${coinReward} coins.` : "";
        showToast(playerScore.won
          ? `You won with ${playerScore.score.toLocaleString()}.${reward}`
          : `Score saved: ${playerScore.score.toLocaleString()}.${reward}`);
      }
    } else if (event.type === "layout.conflict") {
      if (event.requestId === pendingLayoutMove.current) {
        pendingLayoutMove.current = undefined;
        setMovingBuildItem(undefined);
      }
      if (event.requestId === pendingPlayerAssetRequest.current?.requestId) {
        pendingPlayerAssetRequest.current = undefined;
        setMovingBuildItem(undefined);
      }
      showToast("The layout changed. Try again.");
    } else if (event.type === "command.error") {
      if (event.requestId && pendingTravelFocus.current?.requestId === event.requestId) {
        pendingTravelFocus.current = undefined;
      }
      if (event.requestId && pendingDoorEntryRequestId.current === event.requestId) {
        pendingDoorEntryRequestId.current = undefined;
        setDismissedDoorEntryId(undefined);
      }
      if (event.requestId && pendingKnockRequest.current?.requestId === event.requestId) {
        const { roomId } = pendingKnockRequest.current;
        pendingKnockRequest.current = undefined;
        setPendingRoomIds((current) => {
          const next = new Set(current);
          next.delete(roomId);
          return next;
        });
      }
      if (event.requestId && pendingMeetingOpen.current?.requestId === event.requestId) {
        pendingMeetingOpen.current = undefined;
        setOpeningMeeting(undefined);
      }
      if (event.requestId && pendingMeetingLeave.current?.requestId === event.requestId) {
        pendingMeetingLeave.current = undefined;
        setLeavingMeetingId(undefined);
      }
      if (event.requestId === pendingLayoutMove.current) {
        pendingLayoutMove.current = undefined;
      }
      if (event.requestId && pendingEconomyRequestRef.current?.id === event.requestId) {
        pendingEconomyRequestRef.current = undefined;
        setPendingEconomyRequest(undefined);
      }
      if (event.requestId && pendingPlayerAssetRequest.current?.requestId === event.requestId) {
        pendingPlayerAssetRequest.current = undefined;
        setMovingBuildItem(undefined);
      }
      showToast(event.message);
    }
  }, [activeCall, activeConversationId, activePanel, announceOffscreenGong, currentMeeting, currentUser.availability, data.currentUserId, data.members, displayGongRing, displayHighFive, displayReaction, floorId, showToast]);

  const { connection, snapshot, send } = useRealtime({
    floorId,
    onEvent: handleRealtimeEvent,
    onUnauthorized: onSessionExpired,
  });

  useEffect(() => {
    if (connection === "online") {
      connectionWasOnline.current = true;
      return;
    }
    if (!connectionWasOnline.current) {
      return;
    }
    setActiveCall(undefined);
    activeMeetingId.current = undefined;
    if (callDismissTimer.current) {
      window.clearTimeout(callDismissTimer.current);
      callDismissTimer.current = undefined;
    }
    setMeetingId(undefined);
    setMuted(true);
    setCameraOn(false);
    setGameOpen(false);
    setGameLobby(undefined);
    setGameRound(undefined);
    setGameState(undefined);
    setReactions([]);
    setHighFives([]);
    setGongRings([]);
    setGongCooldowns({});
    setReactionAnnouncement("");
    for (const timer of reactionTimers.current.values()) {
      window.clearTimeout(timer);
    }
    reactionTimers.current.clear();
    for (const timer of highFiveTimers.current.values()) {
      window.clearTimeout(timer);
    }
    highFiveTimers.current.clear();
    for (const timer of gongTimers.current.values()) {
      window.clearTimeout(timer);
    }
    gongTimers.current.clear();
    announcedGongIds.current.clear();
    setIncomingKnocks([]);
    setPendingRoomIds(new Set());
    setGrantedRoomIds(new Set());
    setFocusTarget(undefined);
    setBuildSelection(undefined);
    setMovingBuildItem(undefined);
    setPlacingOwnedAssetId(undefined);
    setPendingEconomyRequest(undefined);
    pendingEconomyRequestRef.current = undefined;
    pendingPlayerAssetRequest.current = undefined;
    pendingLayoutMove.current = undefined;
    setOpeningMeeting(undefined);
    setLeavingMeetingId(undefined);
    setMeetingSwitch(undefined);
    pendingTravelFocus.current = undefined;
    pendingDoorEntryRequestId.current = undefined;
    pendingKnockRequest.current = undefined;
    pendingMeetingOpen.current = undefined;
    pendingMeetingLeave.current = undefined;
  }, [connection]);

  useEffect(() => {
    setSelection((current) => {
      if (current?.type === "object" && !layout.objects.some((object) => object.id === current.object.id)) {
        return undefined;
      }
      return current;
    });
  }, [layout.objects]);

  useEffect(() => {
    if (!placingOwnedAssetId) {
      return;
    }
    const ownedAsset = data.economy.inventory.find((asset) => asset.id === placingOwnedAssetId);
    if (ownedAsset && !ownedAsset.placement) {
      return;
    }
    setPlacingOwnedAssetId(undefined);
    setEditingTool((current) => current === "asset" ? null : current);
  }, [data.economy.inventory, placingOwnedAssetId]);

  useEffect(() => {
    const exists = (item?: LayoutItemReference) => !item
      || (item.type === "asset" && layout.objects.some((object) => object.id === item.id))
      || (item.type === "wall" && layout.walls.some((wall) => wall.id === item.id))
      || (item.type === "opening" && layout.openings.some((opening) => opening.id === item.id));
    setBuildSelection((current) => exists(current) ? current : undefined);
    setMovingBuildItem((current) => exists(current) ? current : undefined);
  }, [layout.objects, layout.openings, layout.walls]);

  useEffect(() => {
    if (!meetingId || (currentMeeting && currentMeeting.status !== "ended" && currentMeeting.participantIds.includes(data.currentUserId))) {
      return;
    }
    activeMeetingId.current = undefined;
    setMeetingId(undefined);
    setMuted(true);
    setCameraOn(false);
  }, [currentMeeting, data.currentUserId, meetingId]);

  useEffect(() => {
    if (!activeConversationId || activeConversationId === conversationId) {
      return;
    }
    setConversationId(activeConversationId);
    if (activePanel === "chat") {
      setData((current) => ({
        ...current,
        conversations: current.conversations.map((conversation) => conversation.id === activeConversationId
          ? { ...conversation, unread: 0 }
          : conversation),
      }));
    }
  }, [activeConversationId, activePanel, conversationId]);

  const request = useCallback(<T extends ClientCommand>(command: T): boolean => {
    const sent = send(command);
    if (!sent && command.type !== "movement.input") {
      showToast("Connection unavailable.");
    }
    return sent;
  }, [send, showToast]);
  const requestId = () => crypto.randomUUID();

  const claimDailyReward = () => {
    if (pendingEconomyRequestRef.current) {
      return;
    }
    const pending: PendingEconomyRequest = { id: requestId(), type: "daily" };
    if (request({ type: "economy.claim_daily", requestId: pending.id })) {
      pendingEconomyRequestRef.current = pending;
      setPendingEconomyRequest(pending);
    }
  };

  const purchaseAsset = (assetId: string) => {
    if (pendingEconomyRequestRef.current) {
      return;
    }
    const pending: PendingEconomyRequest = { id: requestId(), type: "purchase", assetId };
    if (request({ type: "economy.purchase_asset", requestId: pending.id, assetId })) {
      pendingEconomyRequestRef.current = pending;
      setPendingEconomyRequest(pending);
    }
  };

  const updateProximityMedia = useCallback((microphone: boolean, camera: boolean) => {
    setCapturedProximityMedia((current) => current.microphone === microphone && current.camera === camera
      ? current
      : { microphone, camera });
  }, []);

  useEffect(() => {
    if (connection !== "online") {
      return;
    }
    request({
      type: "proximity.set_media",
      requestId: crypto.randomUUID(),
      ...capturedProximityMedia,
    });
  }, [capturedProximityMedia, connection, request]);

  const sendReaction = useCallback((reaction: ReactionKind) => request({
    type: "interaction.react",
    requestId: crypto.randomUUID(),
    reaction,
  }), [request]);
  const knockAtRoom = (roomId: string) => {
    if (pendingKnockRequest.current || pendingRoomIds.size > 0) {
      return;
    }
    const knockRequestId = requestId();
    pendingKnockRequest.current = { requestId: knockRequestId, roomId };
    setPendingRoomIds((current) => new Set(current).add(roomId));
    if (!request({ type: "room.knock", requestId: knockRequestId, roomId })) {
      pendingKnockRequest.current = undefined;
      setPendingRoomIds((current) => {
        const next = new Set(current);
        next.delete(roomId);
        return next;
      });
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || gameOpen || activePanel === "build") {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select, button"))) {
        return;
      }
      const reaction = REACTION_OPTIONS.find((option) => option.shortcut === event.key)?.kind;
      if (!reaction) {
        return;
      }
      event.preventDefault();
      sendReaction(reaction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePanel, gameOpen, sendReaction]);

  useEffect(() => {
    if (!activePanel) {
      return;
    }
    const closePanel = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape"
        || event.defaultPrevented
        || avatarDialogOpen
        || gameOpen
        || Boolean(currentMeeting)
        || Boolean(meetingSwitch)
      ) {
        return;
      }
      event.preventDefault();
      setActivePanel(null);
    };
    document.addEventListener("keydown", closePanel);
    return () => document.removeEventListener("keydown", closePanel);
  }, [activePanel, avatarDialogOpen, currentMeeting, gameOpen, meetingSwitch]);

  const visiblePlayers = snapshot?.floorId === floorId ? snapshot.players : [];
  const currentPlayer = visiblePlayers.find((player) => player.userId === data.currentUserId);
  const carriedPlayer = visiblePlayers.find((player) => player.carriedByUserId === data.currentUserId);
  const carrierPlayer = currentPlayer?.carriedByUserId
    ? visiblePlayers.find((player) => player.userId === currentPlayer.carriedByUserId)
    : undefined;
  const carriedMember = carriedPlayer ? data.members.find((member) => member.id === carriedPlayer.userId) : undefined;
  const carrierMember = carrierPlayer ? data.members.find((member) => member.id === carrierPlayer.userId) : undefined;
  const currentRoom = layout.rooms.find((room) => room.id === currentPlayer?.roomId);
  const enteredMeeting = currentPlayer && !currentMeeting
    ? visibleMeetings.find((meeting) => meeting.status === "live" && isPlayerInMeetingArea(currentPlayer, meeting))
    : undefined;

  const navigateToDestination = (destinationFloorId: string, x: number, y: number, focusUserId?: string): string | undefined => {
    const movementRequestId = requestId();
    pendingTravelFocus.current = focusUserId
      ? { requestId: movementRequestId, floorId: destinationFloorId, focusUserId }
      : undefined;
    const sent = request({
      type: "movement.set_destination",
      requestId: movementRequestId,
      floorId: destinationFloorId,
      x,
      y,
    });
    if (!sent) {
      if (pendingTravelFocus.current?.requestId === movementRequestId) {
        pendingTravelFocus.current = undefined;
      }
      return undefined;
    }
    if (destinationFloorId !== activeFloorIdRef.current) {
      setFloorId(activeFloorIdRef.current);
      setSelection(undefined);
      setFocusTarget(undefined);
    }
    return movementRequestId;
  };

  const viewFloor = (nextFloorId: string) => {
    setFloorId(nextFloorId);
    setSelection(undefined);
    setBuildSelection(undefined);
    setMovingBuildItem(undefined);
    setPlacingOwnedAssetId(undefined);
    setFocusTarget(undefined);
  };

  const openPanel = (panel: WorkspacePanel) => {
    setActivePanel(panel);
    if (panel === "build") {
      pendingTravelFocus.current = undefined;
      request({ type: "movement.stop", requestId: requestId() });
      setSelection(undefined);
      setMuted(true);
      setCameraOn(false);
    }
    if (panel === "chat") {
      setData((current) => ({
        ...current,
        conversations: current.conversations.map((conversation) => conversation.id === activeConversationId
          ? { ...conversation, unread: 0 }
          : conversation),
      }));
    }
    if (panel !== "build") {
      setEditingTool(null);
      setBuildSelection(undefined);
      setMovingBuildItem(undefined);
      setPlacingOwnedAssetId(undefined);
    } else {
      setEditingTool(null);
    }
  };

  const sendMessage = (targetConversationId: string, body: string): boolean => request({
    type: "chat.send",
    requestId: requestId(),
    conversationId: targetConversationId,
    body,
  });

  const sendImage = async (targetConversationId: string, file: File) => {
    const message = await uploadChatImage(targetConversationId, file);
    setData((current) => current.messages.some((candidate) => candidate.id === message.id)
      ? current
      : { ...current, messages: [...current.messages, message] });
  };

  const selectConversation = (nextConversationId: string) => {
    setConversationId(nextConversationId);
    setData((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) => conversation.id === nextConversationId
        ? { ...conversation, unread: 0 }
        : conversation),
    }));
  };

  const messageMember = async (userId: string) => {
    const existing = data.conversations.find((conversation) =>
      conversation.type === "direct" && conversation.participantIds?.includes(userId) && conversation.participantIds.includes(data.currentUserId),
    );
    try {
      const direct = existing ?? await createDirectConversation(userId);
      setData((current) => current.conversations.some((conversation) => conversation.id === direct.id)
        ? current
        : { ...current, conversations: [...current.conversations, direct] });
      selectConversation(direct.id);
      setActivePanel("chat");
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Conversation could not be opened.");
    }
  };

  const locateMember = (userId: string) => {
    const member = data.members.find((item) => item.id === userId);
    if (!member?.floorId) {
      showToast("They are offline.");
      return;
    }
    if (member.floorId !== activeFloorIdRef.current) {
      const memberFloor = data.floors.find((candidate) => candidate.id === member.floorId);
      const destination = member.position ?? memberFloor?.spawn;
      if (destination) {
        navigateToDestination(member.floorId, destination.x, destination.y, userId);
      }
      return;
    }
    if (floorId !== activeFloorIdRef.current) {
      setFloorId(activeFloorIdRef.current);
    }
    setFocusTarget({ userId, requestId: requestId() });
  };

  const addInvitation = async (
    email: string,
    role: Exclude<MemberRole, "owner">,
    permissions: AssignableMemberPermission[],
  ): Promise<boolean> => {
    try {
      const invitation = await inviteMember(data.team.id, email, role, permissions);
      setData((current) => ({
        ...current,
        invitations: [
          ...current.invitations
            .filter((item) => item.id !== invitation.id)
            .map((item) => item.email === invitation.email && item.status === "pending"
              ? { ...item, status: "revoked" as const }
              : item),
          invitation,
        ],
      }));
      if (invitation.inviteLink) {
        setInvitationLinks((current) => ({ ...current, [invitation.id]: invitation.inviteLink! }));
      }
      showToast(`Invited ${invitation.email}.`);
      return true;
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Invitation could not be sent.");
      return false;
    }
  };

  const removeInvitation = async (invitationId: string) => {
    try {
      const invitation = await revokeInvitation(data.team.id, invitationId);
      setData((current) => ({ ...current, invitations: current.invitations.map((item) => item.id === invitation.id ? invitation : item) }));
      setInvitationLinks((current) => {
        const next = { ...current };
        delete next[invitationId];
        return next;
      });
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Invitation could not be revoked.");
    }
  };

  const copyInvitationLink = async (invitationId: string) => {
    const link = invitationLinks[invitationId];
    if (!link) {
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast("Invite link copied.");
    } catch {
      showToast("Invite link could not be copied.");
    }
  };

  const updateMemberAccess = async (
    memberId: string,
    role: Exclude<MemberRole, "owner">,
    permissions: AssignableMemberPermission[],
  ) => {
    try {
      const member = await changeMemberAccess(data.team.id, memberId, role, permissions);
      setData((current) => ({ ...current, members: current.members.map((item) => item.id === member.id ? member : item) }));
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Access could not be changed.");
    }
  };

  const saveRegistrationSettings = async (settings: RegistrationSettings) => {
    const updated = await updateRegistrationSettings(settings);
    setData((current) => ({ ...current, registrationSettings: updated }));
    onRegistrationSettingsChange(updated);
  };

  const updateAvatar = async (file: File) => {
    const member = await uploadPlayerAvatar(file);
    setData((current) => ({
      ...current,
      members: current.members.map((item) => item.id === member.id ? member : item),
    }));
  };

  const removeAvatar = async () => {
    const member = await removePlayerAvatar();
    setData((current) => ({
      ...current,
      members: current.members.map((item) => item.id === member.id ? member : item),
    }));
  };

  const startOpeningMeeting = (meeting: Meeting, view: MeetingView) => {
    if (pendingMeetingOpen.current) {
      return;
    }
    const meetingRequestId = requestId();
    pendingMeetingOpen.current = { requestId: meetingRequestId, meetingId: meeting.id, view };
    setOpeningMeeting({ meetingId: meeting.id, view });
    if (!request({ type: "meeting.join", requestId: meetingRequestId, meetingId: meeting.id })) {
      pendingMeetingOpen.current = undefined;
      setOpeningMeeting(undefined);
    }
  };

  const openMeeting = (meeting: Meeting, view: MeetingView) => {
    if (currentMeeting?.id === meeting.id) {
      setMeetingView(view);
      return;
    }
    if (currentMeeting) {
      setMeetingSwitch({ meeting, view, consequence: `This will leave ${currentMeeting.title}.` });
      return;
    }
    if (activeCall && (activeCall.state === "ringing" || activeCall.state === "accepted")) {
      const peer = data.members.find((member) => member.id === activeCall.peerUserId);
      setMeetingSwitch({
        meeting,
        view,
        consequence: peer ? `This will end your call with ${peer.name}.` : "This will end your current call.",
      });
      return;
    }
    startOpeningMeeting(meeting, view);
  };

  const leaveMeeting = () => {
    if (!currentMeeting || pendingMeetingLeave.current) {
      return;
    }
    const leaveRequestId = requestId();
    pendingMeetingLeave.current = { requestId: leaveRequestId, meetingId: currentMeeting.id };
    setLeavingMeetingId(currentMeeting.id);
    if (!request({ type: "meeting.leave", requestId: leaveRequestId, meetingId: currentMeeting.id })) {
      pendingMeetingLeave.current = undefined;
      setLeavingMeetingId(undefined);
    }
  };

  const closeGame = () => {
    request({ type: "game.end", requestId: requestId() });
    setGameOpen(false);
    setGameRound(undefined);
    setGameState(undefined);
  };

  const gatherAtGame = (object: WorldObject) => {
    if (!currentPlayer) {
      showToast("Connection unavailable.");
      return;
    }
    const destination = closestGameGatheringPoint(object, currentPlayer);
    navigateToDestination(object.floorId, destination.x, destination.y);
  };

  const signOut = async () => {
    try {
      await onSignOut();
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Could not sign out.");
    }
  };

  const selectedObject = selection?.type === "object"
    ? layout.objects.find((object) => object.id === selection.object.id)
    : undefined;
  const selectedPlayer = selection?.type === "player"
    ? visiblePlayers.find((player) => player.userId === selection.userId)
    : undefined;
  const selectedPlayerMember = selectedPlayer
    ? data.members.find((member) => member.id === selectedPlayer.userId)
    : undefined;
  const selectedObjectDefinition = selectedObject ? getAssetDefinition(selectedObject.assetId) : undefined;
  const selectedObjectVariant = selectedObject && selectedObjectDefinition
    ? requireAssetVariant(selectedObjectDefinition, selectedObject.variantId)
    : undefined;
  const selectedObjectCategory = selectedObjectDefinition
    ? ASSET_CATALOG.categories.find((category) => category.id === selectedObjectDefinition.category)
    : undefined;
  const selectedSeat = selectedObject
    ? (selection?.type === "object" && selection.interactionId
      ? getPlacedAssetInteraction(selectedObject, selection.interactionId)
      : getPlacedAssetInteractions(selectedObject)[0])
    : undefined;
  const selectedSeatOccupied = selectedSeat && visiblePlayers.some((player) => (
    player.userId !== data.currentUserId
    && player.seat?.objectId === selectedObject?.id
    && player.seat?.interactionId === selectedSeat.id
  ));
  const currentPlayerUsesSelectedSeat = Boolean(
    selectedSeat
    && currentPlayer?.seat?.objectId === selectedObject?.id
    && currentPlayer?.seat?.interactionId === selectedSeat.id,
  );
  const hasVisibleSelection = Boolean(selectedObject || selectedPlayerMember);
  const selectedGameDefinition = selectedObject
    ? data.miniGames.find((definition) => definition.objectId === selectedObject.id)
    : undefined;
  const selectedGong = selectedObjectDefinition?.kind === "gong" ? selectedObject : undefined;
  const selectedGongInRange = Boolean(
    selectedGong
    && currentPlayer?.floorId === selectedGong.floorId
    && distanceToBounds(currentPlayer.x, currentPlayer.y, getPlacedAssetBounds(selectedGong)) <= GONG_INTERACTION_RANGE,
  );
  const selectedGongCooldownSeconds = selectedGong
    ? Math.max(0, Math.ceil(((gongCooldowns[selectedGong.id] ?? 0) - gongClock) / 1_000))
    : 0;
  const selectedPortal = selectedObjectDefinition?.kind === "portal"
    ? floorPortals.find((portal) => portal.floorId === floorId && portal.object.id === selectedObject?.id)
    : undefined;
  const selectedPortalDestination = selectedPortal
    ? getCorrespondingFloorPortals(floorPortals, selectedPortal)[0]
    : undefined;
  const hasRoomAccess = (room: Room) => room.access.mode === "open"
    || room.access.assignedPersonIds.includes(data.currentUserId)
    || grantedRoomIds.has(room.id);
  const nearbyDoor = currentPlayer
    ? layout.rooms
      .filter((room) => room.access.mode === "assigned" && currentRoom?.id !== room.id)
      .flatMap((room) => layout.openings
        .filter((opening): opening is Door => opening.type === "door" && room.doorIds.includes(opening.id))
        .map((door) => {
        const position = getRoomDoorPosition(layout, room, door);
        return { room, door, distance: Math.hypot(currentPlayer.x - position.x, currentPlayer.y - position.y) };
      }))
      .filter((candidate) => hasRoomAccess(candidate.room) || candidate.room.access.knockable)
      .filter((candidate) => candidate.distance <= 84)
      .sort((left, right) => left.distance - right.distance)[0]
    : undefined;
  const visibleNearbyDoor = nearbyDoor?.door.id === dismissedDoorEntryId ? undefined : nearbyDoor;

  useEffect(() => {
    if (dismissedDoorEntryId && nearbyDoor?.door.id !== dismissedDoorEntryId) {
      pendingDoorEntryRequestId.current = undefined;
      setDismissedDoorEntryId(undefined);
    }
  }, [dismissedDoorEntryId, nearbyDoor?.door.id]);

  const visibleMeetingEntry = openingMeeting || meetingSwitch ? undefined : enteredMeeting;
  const meetingConversation = currentMeeting
    ? data.conversations.find((conversation) => conversation.meetingId === currentMeeting.id && conversation.type === "meeting")
    : undefined;
  const callPeer = activeCall ? data.members.find((member) => member.id === activeCall.peerUserId) : undefined;
  const proximityCallParticipants = currentPlayer?.proximity?.callId
    ? visiblePlayers
      .filter((player) => player.userId !== data.currentUserId && player.proximity?.callId === currentPlayer.proximity?.callId)
      .flatMap((player) => data.members.find((member) => member.id === player.userId) ?? [])
    : [];
  const floorReactions = useMemo(
    () => reactions.filter((reaction) => reaction.scope.type === "floor" && reaction.scope.floorId === floorId),
    [floorId, reactions],
  );
  const meetingReactions = useMemo(
    () => currentMeeting
      ? reactions.filter((reaction) => reaction.scope.type === "meeting" && reaction.scope.meetingId === currentMeeting.id)
      : [],
    [currentMeeting, reactions],
  );
  const floorHighFives = useMemo(
    () => highFives.filter((highFive) => highFive.floorId === floorId),
    [floorId, highFives],
  );
  const floorGongRings = useMemo(
    () => gongRings.filter((ring) => ring.floorId === floorId),
    [floorId, gongRings],
  );
  const visibleGameLobby = gameLobby?.floorId === floorId
    && gameLobby.participantIds.includes(data.currentUserId)
    && !gameRound
    ? gameLobby
    : undefined;
  const visibleIncomingKnocks = useMemo(() => incomingKnocks.flatMap((knock) => {
    const room = allRooms.find((item) => item.id === knock.roomId);
    const requester = data.members.find((member) => member.id === knock.requesterUserId);
    return room && requester ? [{ knock, room, requester }] : [];
  }), [allRooms, data.members, incomingKnocks]);

  const applyBuildEdit = (edit: LayoutEdit, moving = false): boolean => {
    if (!canBuild && pendingPlayerAssetRequest.current) {
      return false;
    }
    const editRequestId = requestId();
    let sent: boolean;
    let playerEditType: "place" | "move" | "remove" | undefined;
    if (canBuild) {
      sent = request({ type: "layout.apply", requestId: editRequestId, baseRevision: layout.revision, edit });
    } else if (edit.tool === "asset" && placingOwnedAssetId) {
      playerEditType = "place";
      sent = request({
        type: "player_asset.place",
        requestId: editRequestId,
        baseRevision: layout.revision,
        ownedAssetId: placingOwnedAssetId,
        position: edit.position,
        variantId: edit.variantId,
        rotation: edit.rotation,
      });
    } else if (edit.tool === "asset.move") {
      playerEditType = "move";
      sent = request({
        type: "player_asset.move",
        requestId: editRequestId,
        baseRevision: layout.revision,
        objectId: edit.objectId,
        position: edit.position,
        variantId: edit.variantId,
        rotation: edit.rotation,
      });
    } else if (edit.tool === "item.remove" && edit.item.type === "asset") {
      playerEditType = "remove";
      sent = request({
        type: "player_asset.remove",
        requestId: editRequestId,
        baseRevision: layout.revision,
        objectId: edit.item.id,
      });
    } else {
      return false;
    }
    if (sent && playerEditType) {
      pendingPlayerAssetRequest.current = { requestId: editRequestId, type: playerEditType };
    }
    if (sent && moving) {
      pendingLayoutMove.current = editRequestId;
    }
    return sent;
  };

  const changeEditingTool = (tool: LayoutTool | null) => {
    setEditingTool(tool);
    setMovingBuildItem(undefined);
    if (tool !== "asset") {
      setPlacingOwnedAssetId(undefined);
    }
    if (tool) {
      setBuildSelection(undefined);
    }
  };

  const changeEditingAsset = (assetId: string) => {
    const definition = getAssetDefinition(assetId);
    if (!definition) {
      return;
    }
    if (assetId !== editingAssetId) {
      setEditingAssetVariantId(getDefaultAssetVariantId(definition));
    }
    setEditingAssetId(assetId);
  };

  const cancelBuildPlacement = () => {
    setMovingBuildItem(undefined);
    if (editingTool === "asset") {
      setEditingTool(null);
      setPlacingOwnedAssetId(undefined);
    }
  };

  const moveSelectedBuildItem = () => {
    if (!buildSelection) {
      return;
    }
    if (buildSelection.type === "asset") {
      const object = layout.objects.find((candidate) => candidate.id === buildSelection.id);
      if (object) {
        setEditingAssetId(object.assetId);
        setEditingAssetVariantId(object.variantId);
        setEditingAssetRotation(object.rotation);
      }
    }
    setMovingBuildItem(buildSelection);
  };

  const rotateSelectedBuildItem = () => {
    if (!buildSelection) {
      return;
    }
    if (buildSelection.type === "asset") {
      if (movingBuildItem?.type === "asset" && movingBuildItem.id === buildSelection.id) {
        setEditingAssetRotation(rotateAssetClockwise);
        return;
      }
      const object = layout.objects.find((candidate) => candidate.id === buildSelection.id);
      if (!object) {
        return;
      }
      const rotation = rotateAssetClockwise(object.rotation);
      const definition = getAssetDefinition(object.assetId);
      if (!definition) {
        return;
      }
      const bounds = getPlacedAssetBounds(object);
      const position = getCenteredAssetPosition(definition, rotation, {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      });
      applyBuildEdit({ tool: "asset.move", objectId: object.id, position, variantId: object.variantId, rotation });
      return;
    }
    if (buildSelection.type === "wall") {
      const source = mergeWallSegments(layout.walls, layout.openings).walls.find((candidate) => candidate.id === buildSelection.id);
      if (!source) {
        return;
      }
      const wall = normalizeWall(source);
      const length = getWallLength(wall);
      const end = getWallOrientation(wall) === "horizontal"
        ? { x: wall.start.x, y: wall.start.y + length }
        : { x: wall.start.x + length, y: wall.start.y };
      applyBuildEdit({ tool: "wall.move", wallId: wall.id, start: wall.start, end });
    }
  };

  const removeSelectedBuildItem = () => {
    if (!buildSelection || !applyBuildEdit({ tool: "item.remove", item: buildSelection })) {
      return;
    }
    setBuildSelection(undefined);
    setMovingBuildItem(undefined);
  };

  useEffect(() => {
    const rotate = (event: KeyboardEvent) => {
      if (activePanel !== "build" || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== "r") {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"))) {
        return;
      }
      if (movingBuildItem?.type === "asset" || (!movingBuildItem && editingTool === "asset")) {
        event.preventDefault();
        setEditingAssetRotation(rotateAssetClockwise);
      } else if (!movingBuildItem && buildSelection && buildSelection.type !== "opening") {
        event.preventDefault();
        rotateSelectedBuildItem();
      }
    };
    window.addEventListener("keydown", rotate);
    return () => window.removeEventListener("keydown", rotate);
  }, [activePanel, buildSelection, editingTool, layout.objects, layout.openings, layout.revision, layout.walls, movingBuildItem]);

  return (
    <main className="workspace-shell">
      <NavRail
        activePanel={activePanel}
        canUseBuild
        currentUser={currentUser}
        unreadMessages={data.conversations.reduce((total, conversation) => total + conversation.unread, 0)}
        onChange={openPanel}
        onAvatarClick={() => {
          if (currentPlayer?.carriedByUserId || carriedPlayer) {
            request({ type: "kidnapping.stop", requestId: requestId() });
          }
          setAvatarDialogOpen(true);
        }}
        onSignOut={signOut}
      />
      <section className="workspace-main">
        <TopBar
          officeName={data.office.name}
          floors={data.floors}
          floorId={floorId}
          roomName={currentRoom?.name}
          connection={connection}
          coinBalance={canBuild ? undefined : data.economy.coinBalance}
          colorTheme={colorTheme}
          onColorThemeChange={onColorThemeChange}
          onFloorChange={viewFloor}
        />
        <WorldCanvas
          floor={floor}
          layout={layout}
          members={data.members}
          meetings={visibleMeetings}
          players={visiblePlayers}
          reactions={floorReactions}
          highFives={floorHighFives}
          gongRings={floorGongRings}
          currentUserId={data.currentUserId}
          editing={activePanel === "build"}
          editingTool={editingTool}
          editingAssetId={editingAssetId}
          editingAssetVariantId={editingAssetVariantId}
          editingAssetRotation={editingAssetRotation}
          selectedBuildItem={buildSelection}
          movingBuildItem={movingBuildItem}
          playerAssetPlacement={playerAssetPlacement}
          colorTheme={colorTheme}
          inputEnabled={floorId === activeFloorIdRef.current && activePanel !== "build" && !avatarDialogOpen && !gameOpen && (!currentMeeting || meetingView === "small")}
          focusTarget={focusTarget}
          onDestination={(x, y) => {
            setSelection(undefined);
            navigateToDestination(floorId, x, y);
          }}
          onPlayerSelect={(userId, anchor) => setSelection({ type: "player", userId, anchor })}
          onEdit={(edit) => applyBuildEdit(edit, edit.tool === "asset.move" || edit.tool === "wall.move" || edit.tool === "opening.move")}
          onObjectSelect={(object, interactionId, anchor) => setSelection(interactionId
            ? { type: "object", object, interactionId, anchor }
            : { type: "object", object, anchor })}
          onBuildItemSelect={(item) => {
            const selectableItem = canBuild
              ? item
              : item?.type === "asset"
                && layout.objects.some((object) => object.id === item.id && object.ownerUserId === data.currentUserId)
                ? item
                : undefined;
            setBuildSelection(selectableItem);
            setMovingBuildItem(undefined);
          }}
          onAssetRotationChange={setEditingAssetRotation}
          onPlacementCancel={cancelBuildPlacement}
          onGongOffscreen={announceOffscreenGong}
          onDirectionalInput={(sequence, dx, dy) => {
            if (dx !== 0 || dy !== 0) {
              pendingTravelFocus.current = undefined;
            }
            request({ type: "movement.input", sequence, dx, dy });
          }}
        />

        {activePanel !== "build" && visibleGameLobby && (
          <TetrisLobby
            lobby={visibleGameLobby}
            members={data.members}
            scores={data.scores}
            statistics={data.gameStatistics}
            currentUserId={data.currentUserId}
            onStart={() => request({ type: "game.start", requestId: requestId(), definitionId: TETRIS_DEFINITION_ID })}
          />
        )}

        {activePanel !== "build" && (visibleMeetingEntry || hasVisibleSelection || visibleNearbyDoor) && (
          <div
            className={`world-actions ${hasVisibleSelection && selection?.anchor ? "contextual" : ""}`}
            style={hasVisibleSelection && selection?.anchor ? { left: selection.anchor.x, top: selection.anchor.y } : undefined}
          >
          {visibleMeetingEntry && (
            <div className="context-action meeting-entry-action" role="region" aria-label={`${visibleMeetingEntry.title} meeting`}>
              <Video size={18} />
              <div><strong>{visibleMeetingEntry.title}</strong></div>
              <button className="primary-button" onClick={() => openMeeting(visibleMeetingEntry, "full")}>
                <Video size={16} />Open
              </button>
              <button className="secondary-button" onClick={() => openMeeting(visibleMeetingEntry, "small")}>
                <Minimize2 size={16} />Open Small
              </button>
            </div>
          )}
          {hasVisibleSelection && (
            <div
              className="context-action"
              role="region"
              aria-label={selectedPlayerMember ? `Selected ${selectedPlayerMember.name}` : "Selected place"}
              onClick={(event) => {
                const target = event.target;
                if (target instanceof Element && target.closest("button:not(:disabled)")) {
                  setSelection(undefined);
                }
              }}
            >
            {selectedPlayerMember ? (
              <>
                <Avatar member={selectedPlayerMember} className="person-avatar" />
                <div>
                  <strong>{selectedPlayerMember.name}</strong>
                  <span>{selectedPlayerMember.title}</span>
                </div>
                <button
                  className="primary-button"
                  aria-label={`Call ${selectedPlayerMember.name}`}
                  disabled={Boolean(activeCall) || selectedPlayerMember.availability === "dnd"}
                  onClick={() => {
                    pendingTravelFocus.current = undefined;
                    request({ type: "movement.approach_user", requestId: requestId(), targetUserId: selectedPlayerMember.id });
                  }}
                >
                  <Phone size={16} />Call
                </button>
                {data.kidnapping.global.enabled
                  && kidnappingPolicyAllows(data.kidnapping.global.targetPolicy, selectedPlayerMember.id) && (
                  <button
                    className="secondary-button"
                    aria-label={`Kidnap ${selectedPlayerMember.name}`}
                    disabled={Boolean(currentPlayer?.carriedByUserId || carriedPlayer || selectedPlayer?.carriedByUserId)}
                    onClick={() => {
                      pendingTravelFocus.current = undefined;
                      request({ type: "kidnapping.start", requestId: requestId(), targetUserId: selectedPlayerMember.id });
                    }}
                  >
                    <Hand size={16} />Kidnap
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="context-swatch" style={{ background: selectedObjectVariant?.color }} />
                <div>
                  <strong>{selectedObject?.label ?? selectedObjectDefinition?.name}</strong>
                  <span>{selectedObjectCategory?.name}</span>
                </div>
              </>
            )}
            {selectedGameDefinition && !visibleGameLobby && (
              <button className="primary-button" onClick={() => gatherAtGame(selectedObject!)}>
                <Play size={16} fill="currentColor" />Join lobby
              </button>
            )}
            {selectedGong && (selectedGongCooldownSeconds > 0 ? (
              <button className="secondary-button gong-action" disabled>
                <BellRing size={16} />Ready in {selectedGongCooldownSeconds}s
              </button>
            ) : currentMeeting ? (
              <button className="secondary-button gong-action" disabled>
                <BellRing size={16} />In meeting
              </button>
            ) : selectedGongInRange ? (
              <button
                className="primary-button gong-action"
                onClick={() => {
                  void prepareGongChime().catch(() => undefined);
                  request({ type: "interaction.ring_gong", requestId: requestId(), objectId: selectedGong.id });
                }}
              >
                <BellRing size={16} />Ring gong
              </button>
            ) : (
              <button
                className="primary-button gong-action"
                onClick={() => {
                  const destination = closestObjectApproachPoint(selectedGong, currentPlayer ?? floor.spawn);
                  navigateToDestination(selectedGong.floorId, destination.x, destination.y);
                }}
              >
                <BellRing size={16} />Walk to gong
              </button>
            ))}
            {selectedPortalDestination && currentPlayer && (
              <button
                className="primary-button"
                onClick={() => navigateToDestination(
                  selectedPortalDestination.floorId,
                  selectedPortalDestination.position.x,
                  selectedPortalDestination.position.y,
                )}
              >
                <ArrowRight size={16} />Go
              </button>
            )}
            {selectedSeat && selectedObject && (currentPlayerUsesSelectedSeat ? (
              <button className="secondary-button" onClick={() => request({ type: "seat.leave", requestId: requestId() })}>Stand</button>
            ) : (
              <button
                className="primary-button"
                disabled={selectedSeatOccupied}
                onClick={() => {
                  pendingTravelFocus.current = undefined;
                  request({
                    type: "asset.interact",
                    requestId: requestId(),
                    objectId: selectedObject.id,
                    interactionId: selectedSeat.id,
                  });
                }}
              >
                {selectedSeatOccupied ? "Occupied" : selectedSeat.name}
              </button>
            ))}
            <IconButton label="Clear selection" icon={X} onClick={() => setSelection(undefined)} />
            </div>
          )}

          {visibleNearbyDoor && (
            <div className="door-interaction" role="region" aria-label={`${visibleNearbyDoor.room.name} door`}>
            <LockKeyhole size={16} />
            <strong>{visibleNearbyDoor.room.name}</strong>
            {hasRoomAccess(visibleNearbyDoor.room) ? (
              <button
                className="primary-button"
                onClick={() => {
                  const destination = getRoomDoorPosition(layout, visibleNearbyDoor.room, visibleNearbyDoor.door, "inside");
                  const movementRequestId = navigateToDestination(floorId, destination.x, destination.y);
                  if (movementRequestId) {
                    pendingDoorEntryRequestId.current = movementRequestId;
                    setDismissedDoorEntryId(visibleNearbyDoor.door.id);
                  }
                }}
              >
                <DoorOpen size={16} />Enter
              </button>
            ) : (
              <button
                className="secondary-button"
                disabled={pendingRoomIds.size > 0}
                onClick={() => knockAtRoom(visibleNearbyDoor.room.id)}
              >
                <Hand size={16} />{pendingRoomIds.size > 0 ? "Waiting" : "Knock"}
              </button>
            )}
            </div>
          )}
          </div>
        )}

        {activePanel !== "build" && <ProximityMedia
          active={!currentMeeting}
          microphone={!muted}
          camera={cameraOn}
          onMediaChange={updateProximityMedia}
          onUnavailable={() => {
            showToast(cameraOn && !muted
              ? "Allow camera and microphone access."
              : cameraOn ? "Allow camera access." : "Allow microphone access.");
            setMuted(true);
            setCameraOn(false);
          }}
        />}

        {activePanel !== "build" && (carriedMember || carrierMember) && (
          <div className="kidnapping-status" role="status">
            <Hand size={17} />
            <strong>{carriedMember ? `Carrying ${carriedMember.name}` : `Carried by ${carrierMember!.name}`}</strong>
            <button
              className="secondary-button"
              onClick={() => request({ type: "kidnapping.stop", requestId: requestId() })}
            >
              {carriedMember ? "Put down" : "Get down"}
            </button>
          </div>
        )}

        {activePanel !== "build" && <Dock
          currentUser={currentUser}
          muted={muted}
          cameraOn={cameraOn}
          onMutedChange={setMuted}
          onCameraChange={setCameraOn}
          onAvailabilityChange={(availability) => request({ type: "presence.set_availability", requestId: requestId(), availability })}
          onReact={sendReaction}
          reactionsDisabled={connection !== "online"}
        />}

        {activePanel !== "build" && activeCall && (activeCall.state === "ringing" || activeCall.state === "accepted") && (
          <CallNotice
            call={activeCall}
            peer={callPeer}
            onRespond={(callId, accept) => request({ type: "call.respond", requestId: requestId(), callId, accept })}
            onEnd={(callId) => request({ type: "call.end", requestId: requestId(), callId })}
          />
        )}

        {activePanel !== "build" && !activeCall && proximityCallParticipants.length > 0 && (
          <ProximityCallNotice participants={proximityCallParticipants} />
        )}

        {activePanel !== "build" && visibleIncomingKnocks.length > 0 && (
          <div className={`knock-stack ${
            (activeCall && (activeCall.state === "ringing" || activeCall.state === "accepted")) || proximityCallParticipants.length > 0
              ? "with-call"
              : ""
          }`}>
            {visibleIncomingKnocks.map(({ knock, room, requester }) => (
              <RoomKnockNotice
                key={knock.id}
                knock={knock}
                room={room}
                requester={requester}
                onRespond={(knockId, accept) => request({ type: "room.knock_respond", requestId: requestId(), knockId, accept })}
              />
            ))}
          </div>
        )}

        {toast && <div className="toast" role="status">{toast}</div>}
        <div className="sr-only" role="status">{reactionAnnouncement}</div>

        {activePanel !== "build" && currentMeeting && (
          <MeetingOverlay
            small={meetingView === "small"}
            meeting={currentMeeting}
            members={data.members}
            currentUserId={data.currentUserId}
            messages={meetingConversation ? data.messages.filter((message) => message.conversationId === meetingConversation.id) : []}
            muted={muted}
            cameraOn={cameraOn}
            leaving={leavingMeetingId === currentMeeting.id}
            reactions={meetingReactions}
            onMutedChange={setMuted}
            onCameraChange={setCameraOn}
            onReact={sendReaction}
            onSendMessage={(body) => Boolean(meetingConversation && sendMessage(meetingConversation.id, body))}
            onViewChange={(small) => {
              setMeetingView(small ? "small" : "full");
              if (small) {
                setActivePanel(null);
              }
            }}
            onLeave={leaveMeeting}
          />
        )}
      </section>

      {activePanel === "people" && (
        <PeoplePanel
          members={data.members}
          invitations={data.invitations}
          invitationLinks={invitationLinks}
          currentUser={currentUser}
          canManageMembers={canManageMembers}
          onClose={() => setActivePanel(null)}
          onWave={(targetUserId) => request({ type: "interaction.wave", requestId: requestId(), targetUserId })}
          onMessage={messageMember}
          onCall={(targetUserId) => request({ type: "call.request", requestId: requestId(), targetUserId })}
          onLocate={locateMember}
          onInvite={addInvitation}
          onRevokeInvite={removeInvitation}
          onCopyInvite={copyInvitationLink}
          onAccessChange={updateMemberAccess}
        />
      )}
      {activePanel === "chat" && (
        <ChatPanel
          conversations={visibleConversations}
          messages={data.messages}
          members={data.members}
          currentUserId={data.currentUserId}
          selectedConversationId={activeConversationId}
          onConversationChange={selectConversation}
          onSend={sendMessage}
          onSendImage={sendImage}
          onClose={() => setActivePanel(null)}
        />
      )}
      {activePanel === "meetings" && (
        <MeetingsPanel meetings={visibleMeetings} rooms={allRooms} floors={data.floors} members={data.members} openingMeetingId={openingMeeting?.meetingId} onJoin={(meeting) => openMeeting(meeting, "full")} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "settings" && (
        <KidnappingSettingsPanel
          members={data.members}
          currentUserId={data.currentUserId}
          globalSettings={data.kidnapping.global}
          playerSettings={data.kidnapping.player}
          canManage={canManageMembers}
          registrationSettings={data.registrationSettings}
          onRegistrationSettingsSave={saveRegistrationSettings}
          onGlobalChange={(settings) => request({
            type: "kidnapping.global_settings_update",
            requestId: requestId(),
            settings,
          })}
          onPlayerChange={(settings) => request({
            type: "kidnapping.player_settings_update",
            requestId: requestId(),
            settings,
          })}
          onClose={() => setActivePanel(null)}
        />
      )}
      {activePanel === "build" && canBuild && (
        <BuildPanel
          layout={layout}
          members={data.members}
          tool={editingTool}
          assetId={editingAssetId}
          assetVariantId={editingAssetVariantId}
          assetRotation={editingAssetRotation}
          selectedItem={buildSelection}
          movingItem={movingBuildItem}
          gameSettings={data.gameSettings}
          canManageGameSettings={canManageMembers}
          onToolChange={changeEditingTool}
          onAssetChange={changeEditingAsset}
          onAssetVariantChange={setEditingAssetVariantId}
          onAssetRotationChange={setEditingAssetRotation}
          onMoveSelected={moveSelectedBuildItem}
          onRotateSelected={rotateSelectedBuildItem}
          onRemoveSelected={removeSelectedBuildItem}
          onUpdateRoom={(roomId, settings: RoomSettings) => request({
            type: "room.update_settings",
            requestId: requestId(),
            baseRevision: layout.revision,
            roomId,
            settings,
          })}
          onUpdateGameSettings={(settings) => request({ type: "game.settings_update", requestId: requestId(), settings })}
          onClose={() => openPanel(null)}
        />
      )}
      {activePanel === "build" && !canBuild && (
        <PlayerBuildPanel
          currentUserId={data.currentUserId}
          economy={data.economy}
          gameSettings={data.gameSettings}
          layout={layout}
          tool={editingTool}
          assetId={editingAssetId}
          assetVariantId={editingAssetVariantId}
          assetRotation={editingAssetRotation}
          placingOwnedAssetId={placingOwnedAssetId}
          selectedItem={buildSelection}
          movingItem={movingBuildItem}
          pendingEconomyRequest={pendingEconomyRequest}
          onClaimDaily={claimDailyReward}
          onPurchase={purchaseAsset}
          onPlace={(ownedAssetId, selectedAssetId) => {
            setPlacingOwnedAssetId(ownedAssetId);
            setEditingAssetId(selectedAssetId);
            const definition = getAssetDefinition(selectedAssetId);
            if (definition) {
              setEditingAssetVariantId(getDefaultAssetVariantId(definition));
            }
            setEditingAssetRotation(0);
            setBuildSelection(undefined);
            setMovingBuildItem(undefined);
            setEditingTool("asset");
          }}
          onAssetVariantChange={setEditingAssetVariantId}
          onAssetRotationChange={setEditingAssetRotation}
          onMoveSelected={moveSelectedBuildItem}
          onRotateSelected={rotateSelectedBuildItem}
          onRemoveSelected={removeSelectedBuildItem}
          onClose={() => openPanel(null)}
        />
      )}

      {activePanel !== "build" && meetingSwitch && (
        <MeetingSwitchDialog
          meetingTitle={meetingSwitch.meeting.title}
          consequence={meetingSwitch.consequence}
          actionLabel={meetingSwitch.view === "small" ? "Open Small" : "Open"}
          onCancel={() => setMeetingSwitch(undefined)}
          onConfirm={() => {
            const next = meetingSwitch;
            setMeetingSwitch(undefined);
            startOpeningMeeting(next.meeting, next.view);
          }}
        />
      )}

      {avatarDialogOpen && (
        <AvatarDialog
          currentUser={currentUser}
          onClose={() => setAvatarDialogOpen(false)}
          onUpload={updateAvatar}
          onRemove={removeAvatar}
        />
      )}
      {activePanel !== "build" && gameOpen && gameRound && (
        <TetrisGame
          state={gameState}
          round={gameRound}
          members={data.members}
          currentUserId={data.currentUserId}
          onCommand={(command) => request({ type: "game.command", requestId: requestId(), command })}
          onClose={closeGame}
        />
      )}
    </main>
  );
}

function takeAuthTokens(): AuthTokens {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const hashMagic = parameters.get("magic") ?? undefined;
  const hashInvitation = parameters.get("invite") ?? undefined;
  const fromHash = Boolean(hashMagic || hashInvitation);
  const saved = readAuthTokenHistory();
  const tokens: AuthTokens = fromHash
    ? {
      ...(hashMagic ? { magic: hashMagic } : {}),
      ...(hashInvitation ? { invitation: hashInvitation } : {}),
    }
    : saved;
  if (fromHash) {
    writeAuthTokenHistory(tokens, "/");
  }
  return tokens;
}

function synchronizeAuthTokenHistory(): void {
  writeAuthTokenHistory({
    ...(initialMagicToken ? { magic: initialMagicToken } : {}),
    ...(initialInvitationToken ? { invitation: initialInvitationToken } : {}),
  });
}

function readAuthTokenHistory(): AuthTokens {
  const state = window.history.state;
  if (typeof state !== "object" || state === null) {
    return {};
  }
  const candidate = (state as Record<string, unknown>)[AUTH_TOKENS_HISTORY_KEY];
  if (typeof candidate !== "object" || candidate === null) {
    return {};
  }
  const source = candidate as Record<string, unknown>;
  return {
    ...(typeof source.magic === "string" ? { magic: source.magic } : {}),
    ...(typeof source.invitation === "string" ? { invitation: source.invitation } : {}),
  };
}

function writeAuthTokenHistory(tokens: AuthTokens, url?: string): void {
  const state = typeof window.history.state === "object" && window.history.state !== null
    ? { ...window.history.state as Record<string, unknown> }
    : {};
  if (tokens.magic || tokens.invitation) {
    state[AUTH_TOKENS_HISTORY_KEY] = tokens;
  } else {
    delete state[AUTH_TOKENS_HISTORY_KEY];
  }
  if (url) {
    window.history.replaceState(state, "", url);
  } else {
    window.history.replaceState(state, "");
  }
}

function mergeGameStatistics(
  current: PlayerGameStatistics[],
  updates: PlayerGameStatistics[],
): PlayerGameStatistics[] {
  const byPlayerAndGame = new Map(
    updates.map((statistics) => [`${statistics.definitionId}:${statistics.userId}`, statistics]),
  );
  const merged = current.map((statistics) =>
    byPlayerAndGame.get(`${statistics.definitionId}:${statistics.userId}`) ?? statistics,
  );
  for (const statistics of updates) {
    if (!current.some((candidate) =>
      candidate.definitionId === statistics.definitionId && candidate.userId === statistics.userId,
    )) {
      merged.push(statistics);
    }
  }
  return merged;
}

function isPlayerInMeetingArea(player: WorldPlayer, meeting: Meeting): boolean {
  if (meeting.location.type === "room") {
    return player.roomId === meeting.location.roomId;
  }
  return player.floorId === meeting.location.floorId
    && Math.hypot(player.x - meeting.location.x, player.y - meeting.location.y) <= meeting.location.radius;
}

function closestGameGatheringPoint(
  object: WorldObject,
  player: { x: number; y: number },
): { x: number; y: number } {
  return closestObjectApproachPoint(object, player, 42);
}

function closestObjectApproachPoint(
  object: WorldObject,
  player: { x: number; y: number },
  margin = 48,
): { x: number; y: number } {
  const bounds = getPlacedAssetBounds(object);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const candidates = [
    { x: bounds.x - margin, y: centerY },
    { x: bounds.x + bounds.width + margin, y: centerY },
    { x: centerX, y: bounds.y - margin },
    { x: centerX, y: bounds.y + bounds.height + margin },
  ];
  return candidates.sort((left, right) =>
    Math.hypot(left.x - player.x, left.y - player.y) - Math.hypot(right.x - player.x, right.y - player.y),
  )[0]!;
}

function distanceToBounds(x: number, y: number, bounds: { x: number; y: number; width: number; height: number }): number {
  const distanceX = Math.max(bounds.x - x, 0, x - bounds.x - bounds.width);
  const distanceY = Math.max(bounds.y - y, 0, y - bounds.y - bounds.height);
  return Math.hypot(distanceX, distanceY);
}
