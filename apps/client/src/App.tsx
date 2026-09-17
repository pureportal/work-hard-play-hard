import { BuildEconomyNavigation, type BuildView } from "./components/economy/BuildEconomyNavigation";
import { ProjectToolbar } from "./components/economy/ProjectToolbar";
import type { BuildProject } from "@workhard/shared";
import { publicFundForUnit, roomAccessAllows } from "@workhard/shared";
import { useWorkspaceCommand } from "./hooks/useWorkspaceCommand";
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
import { lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ASSET_CATALOG,
  DEFAULT_CORPORATE_IDENTITY,
  GONG_INTERACTION_RANGE,
  getAssetDefinition,
  getGameArea,
  PROXIMITY_INTERACTION_RADIUS,
  getDefaultAssetVariantId,
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
  CHESS_DEFINITION_ID,
  FALLING_BLOCKS_DEFINITION_ID,
  TIC_TAC_TOE_DEFINITION_ID,
} from "@workhard/shared";
import type {
  AssignableMemberPermission,
  AssetRotation,
  Room,
  RoomKnock,
  BootstrapData,
  CharacterAppearance,
  ClientCommand,
  ChessLobbyState,
  ChessMatchSettings,
  ChessMatchView,
  ChessMoveInput,
  CorporateIdentity,
  CorporateIdentitySettings,
  Door,
  GameLobbyState,
  GameRoundState,
  GameState,
  FallingBlocksSettings,
  GameBot,
  TicTacToeVariantId,
  LayoutEdit,
  LayoutTool,
  LayoutItemReference,
  Meeting,
  MemberRole,
  PlayerGameStatistics,
  PlayerRoomAccessibility,
  ReactionKind,
  RegistrationAvailability,
  RegistrationSettings,
  ServerEvent,
  WorldObject,
  WorldPlayer,
} from "@workhard/shared";
import { acceptInvitation, ApiError, changeMemberAccess, createDirectConversation, fetchBootstrap, fetchSession, inviteMember, isConnectionError, logout, removeCorporateLogo, revokeInvitation, updateCorporateIdentity, updatePlayerCharacter, updateRegistrationSettings, uploadChatImage, uploadCorporateLogo, uploadWhiteboardImage, verifyMagicLink, verifyRegistrationLink } from "./api";
import { applyCorporateIdentity } from "./branding";
import { Avatar } from "./components/Avatar";
import { DeferredContent } from "./components/DeferredContent";
import { RoomKnockNotice } from "./components/RoomKnockNotice";
import { AuthScreen } from "./components/AuthScreen";
import { CallNotice, type ActiveCall } from "./components/CallNotice";
import { CallRequestNotice } from "./components/CallRequestNotice";
import { useCallRequest } from "./hooks/useCallRequest";
import { ChatPanel } from "./components/ChatPanel";
import { Dock } from "./components/Dock";
import { IconButton } from "./components/IconButton";
import { MeetingOverlay } from "./components/MeetingOverlay";
import { MeetingInvitationNotice } from "./components/MeetingInvitationNotice";
import { MediaConnection } from "./media-connection";
import type { MeetingInvitation } from "@workhard/shared";
import { ConfirmationDialog } from "./components/ConfirmationDialog";
import { MeetingsPanel } from "./components/MeetingsPanel";
import { NavRail, type WorkspacePanel } from "./components/NavRail";
import { PeoplePanel } from "./components/PeoplePanel";
import { ProximityCall } from "./components/ProximityCall";
import { useProximitySession } from "./hooks/useProximitySession";
import { InteractionPanel } from "./components/InteractionPanel";
import { useWorkObjectUpdates } from "./hooks/useWorkObjectUpdates";
import { canUseWorkObject, getWorkObjectState, GITHUB_TRAY_ASSET_ID } from "@workhard/shared";
import { useInteractionAreas, type InteractionArea } from "./hooks/useInteractionAreas";
import { FallingBlocksLobby } from "./components/FallingBlocksLobby";
import { ChessLobby } from "./components/ChessLobby";
import { TicTacToeLobby } from "./components/TicTacToeLobby";
import { TopBar } from "./components/TopBar";
import type { ContextAnchor, WorldFocusTarget } from "./components/WorldCanvas";
import { WorldActionMenu } from "./components/WorldActionMenu";
import { useSpotifyPresence } from "./spotify/useSpotifyPresence";
import { SpotifySongDetails } from "./spotify/SpotifySongDetails";
import { Music2 } from "lucide-react";
import { preloadWorldCanvas, WorldCanvas } from "./components/WorldCanvasLoader";
import { playGongChime, prepareGongChime } from "./gong-audio";
import { GONG_EFFECT_DURATION_MS, type DisplayGongRing } from "./gong";
import { useSpecialProps } from "./special-props";
import { SpecialPropAction } from "./components/SpecialPropAction";
import { useRealtime } from "./hooks/useRealtime";
import { useGameRequest } from "./hooks/useGameRequest";
import { REACTION_LABEL, REACTION_OPTIONS, type DisplayHighFive, type DisplayReaction } from "./reactions";
import { mergeWorkspaceSnapshot } from "./workspace-state";
import { applyColorTheme, getInitialColorTheme, type ColorTheme } from "./theme";
import { getRotatedAssetPosition, rotateAssetClockwise } from "./asset-orientation";

const AvatarDialog = lazy(() => import("./components/AvatarDialog").then((module) => ({ default: module.AvatarDialog })));
const FundsPanel = lazy(() => import("./components/economy/FundsPanel").then((module) => ({ default: module.FundsPanel })));
const BuildPanel = lazy(() => import("./components/BuildPanel").then((module) => ({ default: module.BuildPanel })));
const OrganisationPanel = lazy(() => import("./components/organisation/OrganisationPanel").then((module) => ({ default: module.OrganisationPanel })));
const RoomPermissionsPanel = lazy(() => import("./components/permissions/RoomPermissionsPanel").then((module) => ({ default: module.RoomPermissionsPanel })));
const RoomAccessibilityPanel = lazy(() => import("./components/RoomAccessibilityPanel").then((module) => ({ default: module.RoomAccessibilityPanel })));
const PlayerBuildPanel = lazy(() => import("./components/PlayerBuildPanel").then((module) => ({ default: module.PlayerBuildPanel })));
const KidnappingSettingsPanel = lazy(() => import("./components/KidnappingSettingsPanel").then((module) => ({ default: module.KidnappingSettingsPanel })));
const WorkObjectDialog = lazy(() => import("./components/WorkObjectDialog").then((module) => ({ default: module.WorkObjectDialog })));
const GitHubMailroom = lazy(() => import("./github/GitHubMailroom").then((module) => ({ default: module.GitHubMailroom })));
const loadFallingBlocksGame = () => import("./components/FallingBlocksGame").then((module) => ({ default: module.FallingBlocksGame }));
const loadChessGame = () => import("./components/ChessGame").then((module) => ({ default: module.ChessGame }));
const loadTicTacToeGame = () => import("./components/TicTacToeGame").then((module) => ({ default: module.TicTacToeGame }));
const FallingBlocksGame = lazy(loadFallingBlocksGame);
const ChessGame = lazy(loadChessGame);
const TicTacToeGame = lazy(loadTicTacToeGame);

type WorldSelection =
  | { type: "object"; object: WorldObject; interactionId?: string; anchor?: ContextAnchor }
  | { type: "player"; userId: string; anchor?: ContextAnchor };

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
  reset?: string;
  registration?: string;
}

interface InitialWorkspaceState {
  data: BootstrapData | undefined;
  corporateIdentity: CorporateIdentity;
  registration: RegistrationAvailability;
  magicLinkEnabled: boolean;
  passwordResetEnabled: boolean;
  setupRequired: boolean;
}

let initialWorkspacePromise: Promise<InitialWorkspaceState> | undefined;
let initialMagicToken: string | undefined;
let initialInvitationToken: string | undefined;
let initialResetToken: string | undefined;
let initialRegistrationToken: string | undefined;
let initialAuthTokensRead = false;

function restoreInitialWorkspace(): Promise<InitialWorkspaceState> {
  if (!initialAuthTokensRead) {
    const tokens = takeAuthTokens();
    initialMagicToken = tokens.magic;
    initialInvitationToken = tokens.invitation;
    initialResetToken = tokens.reset;
    initialRegistrationToken = tokens.registration;
    initialAuthTokensRead = true;
  }
  if (!initialWorkspacePromise) {
    const pending = (async () => {
      const magicToken = initialMagicToken;
      if (magicToken) {
        await verifyMagicLink(magicToken);
        discardInitialMagicToken();
      }
      if (initialRegistrationToken) {
        await verifyRegistrationLink(initialRegistrationToken);
        initialRegistrationToken = undefined;
        synchronizeAuthTokenHistory();
      }
      const session = await fetchSession();
      const user = initialResetToken ? undefined : session.user;
      if (user) {
        preloadWorldCanvas();
      }
      if (user && initialInvitationToken) {
        await acceptInvitation(initialInvitationToken);
        clearInitialInvitationToken();
      }
      return {
        data: user ? await fetchBootstrap() : undefined,
        corporateIdentity: session.corporateIdentity,
        registration: session.registration,
        magicLinkEnabled: session.magicLinkEnabled,
        passwordResetEnabled: session.passwordResetEnabled,
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
  const [corporateIdentity, setCorporateIdentity] = useState<CorporateIdentity>(() => structuredClone(DEFAULT_CORPORATE_IDENTITY));
  const [bootstrap, setBootstrap] = useState<BootstrapData>();
  const [authState, setAuthState] = useState<"loading" | "signed-out" | "signed-in">("loading");
  const [registration, setRegistration] = useState<RegistrationAvailability>({
    enabled: false,
    invitationRequired: true,
  });
  const [magicLinkEnabled, setMagicLinkEnabled] = useState(false);
  const [passwordResetEnabled, setPasswordResetEnabled] = useState(false);
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

  useLayoutEffect(() => {
    applyCorporateIdentity(corporateIdentity);
  }, [corporateIdentity]);

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
      setCorporateIdentity(data.corporateIdentity);
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
        setMagicLinkEnabled(restored.magicLinkEnabled);
        setPasswordResetEnabled(restored.passwordResetEnabled);
        setCorporateIdentity(restored.data?.corporateIdentity ?? restored.corporateIdentity);
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
        const authenticationFailed = initialMagicToken !== undefined || initialRegistrationToken !== undefined
          || (reason instanceof ApiError && reason.status === 401);
        discardInitialMagicToken();
        initialRegistrationToken = undefined;
        synchronizeAuthTokenHistory();
        if (authenticationFailed) {
          try {
            const session = await fetchSession();
            if (!active) return;
            setRegistration(session.registration);
            setMagicLinkEnabled(session.magicLinkEnabled);
            setPasswordResetEnabled(session.passwordResetEnabled);
            setCorporateIdentity(session.corporateIdentity);
            setSetupRequired(session.setupRequired);
          } catch (failure) {
            if (!active) return;
            setError(failure instanceof Error ? failure.message : "Authentication failed.");
            scheduleRecovery();
            return;
          }
        }
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
        resetToken={initialResetToken}
        onResetTokenCleared={() => {
          initialResetToken = undefined;
          synchronizeAuthTokenHistory();
        }}
        registrationsEnabled={registration.enabled}
        invitationRequired={registration.invitationRequired}
        magicLinkEnabled={magicLinkEnabled}
        passwordResetEnabled={passwordResetEnabled}
        setupRequired={setupRequired}
        corporateIdentity={corporateIdentity}
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
      onCorporateIdentityChange={setCorporateIdentity}
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
  onCorporateIdentityChange = () => undefined,
  onSignOut,
  onSessionExpired,
}: {
  initialData: BootstrapData;
  colorTheme?: ColorTheme;
  onColorThemeChange?: (theme: ColorTheme) => void;
  onRegistrationSettingsChange?: (settings: RegistrationSettings) => void;
  onCorporateIdentityChange?: (identity: CorporateIdentity) => void;
  onSignOut: () => Promise<void>;
  onSessionExpired: () => void;
}) {
  const [data, setData] = useState(initialData);
  const [buildView, setBuildView] = useState<BuildView>(() => hasMemberPermission(initialData.members.find((member) => member.id === initialData.currentUserId)!, "build") ? "shared" : "personal");
  const [publicFundId, setPublicFundId] = useState("workspace");
  const [projectDraft, setProjectDraft] = useState<BuildProject>();
  const [reviewingProject, setReviewingProject] = useState<BuildProject>();
  const [placingPublicAssetId, setPlacingPublicAssetId] = useState<string>();
  const publicCommand = useWorkspaceCommand();
  const pendingProjectEdit = useRef<string | undefined>(undefined);
  const pendingRoomProposal = useRef<string | undefined>(undefined);
  const [floorId, setFloorId] = useState(initialData.members.find((member) => member.id === initialData.currentUserId)?.floorId ?? initialData.floors[0]!.id);
  const [activePanel, setActivePanel] = useState<WorkspacePanel>(() => ["spotify", "github"].some((key) => new URLSearchParams(window.location.search).has(key)) ? "settings" : window.innerWidth > 980 ? "people" : null);
  const [conversationId, setConversationId] = useState(initialData.conversations[0]!.id);
  const [editingTool, setEditingTool] = useState<LayoutTool | null>(null);
  const [editingAssetId, setEditingAssetId] = useState(DEFAULT_ASSET_ID);
  const [editingAssetVariantId, setEditingAssetVariantId] = useState(DEFAULT_ASSET_VARIANT_ID);
  const [editingAssetRotation, setEditingAssetRotation] = useState<AssetRotation>(0);
  const [selection, setSelection] = useState<WorldSelection>();
  const [songUserId, setSongUserId] = useState<string>();
  const { activities: spotifyActivities, handleEvent: handleSpotifyEvent, clear: clearSpotifyActivities } = useSpotifyPresence();
  const { uses: specialPropUses, now: specialPropClock, handleEvent: handleSpecialPropEvent, reset: resetSpecialProps } = useSpecialProps();
  const [workObject, setWorkObject] = useState<WorldObject>();
  const [githubRepository, setGitHubRepository] = useState("");
  const { update: updateWorkObject, handleEvent: handleWorkEvent, disconnect: disconnectWorkUpdates } = useWorkObjectUpdates();
  const [buildSelection, setBuildSelection] = useState<LayoutItemReference>();
  const [accessInspectionUserId, setAccessInspectionUserId] = useState<string | null>(null);
  const [roomAccessibility, setRoomAccessibility] = useState<PlayerRoomAccessibility>();
  const [movingBuildItem, setMovingBuildItem] = useState<LayoutItemReference>();
  const [placingOwnedAssetId, setPlacingOwnedAssetId] = useState<string>();
  const [pendingEconomyRequest, setPendingEconomyRequest] = useState<PendingEconomyRequest>();
  const [meetingId, setMeetingId] = useState<string>();
  const [meetingConnection, setMeetingConnection] = useState<MediaConnection>();
  const meetingMediaRef = useRef<MediaConnection | undefined>(undefined);
  const realtimeSendRef = useRef<(command: ClientCommand) => boolean>(() => false);
  const [meetingInvitations, setMeetingInvitations] = useState<MeetingInvitation[]>([]);
  const [meetingView, setMeetingView] = useState<MeetingView>("full");
  const [gameOpen, setGameOpen] = useState(false);
  const [gameLobbies, setGameLobbies] = useState<Record<string, GameLobbyState>>({});
  const [gameRound, setGameRound] = useState<GameRoundState>();
  const [gameState, setGameState] = useState<GameState>();
  const activeGameRound = useRef<{ id: string; objectId: string } | undefined>(undefined);
  const gamePreferences = useRef(new Map<string, { mode: "solo" | "multiplayer"; settings?: FallingBlocksSettings; variantId?: TicTacToeVariantId; bot?: GameBot }>());
  const workspaceCommand = useWorkspaceCommand();
  const lobbyRequest = useGameRequest();
  const turnRequest = useGameRequest();
  const [chessLobby, setChessLobby] = useState<ChessLobbyState>();
  const [chessMatch, setChessMatch] = useState<ChessMatchView>();
  const [chessOpen, setChessOpen] = useState(false);
  const chessOpenRef = useRef(false);
  const selectedChessMatchId = useRef<string | undefined>(undefined);
  const synchronizingSession = useRef(true);
  const pendingChessOpenRequestId = useRef<string | undefined>(undefined);
  const [muted, setMuted] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const { connection: proximityConnection, start: startProximity, stop: stopProximity, leave: leaveProximity, handle: handleProximityEvent } = useProximitySession(realtimeSendRef, setMuted, setCameraOn);
  const [activeCall, setActiveCall] = useState<ActiveCall>();
  const activeCallRef = useRef<ActiveCall | undefined>(undefined);
  const callRequest = useCallRequest(realtimeSendRef);
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
  const [meetingSwitch, setMeetingSwitch] = useState<{ meeting: Meeting; view: MeetingView; consequence: string; invitation?: MeetingInvitation }>();
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
  const pendingMeetingOpen = useRef<{ requestId: string; meetingId: string; view: MeetingView; invitation?: MeetingInvitation } | undefined>(undefined);
  const activeMeetingId = useRef<string | undefined>(undefined);
  const pendingLayoutMove = useRef<string | undefined>(undefined);
  const pendingMeetingLeave = useRef<{ requestId: string; meetingId: string } | undefined>(undefined);
  const meetingLeaveRequests = useRef(new Set<string>());
  const pendingEconomyRequestRef = useRef<PendingEconomyRequest | undefined>(undefined);
  const pendingPlayerAssetRequest = useRef<{ requestId: string; type: "place" | "move" | "remove" } | undefined>(undefined);

  const currentUser = data.members.find((member) => member.id === data.currentUserId)!;
  const canBuild = buildView === "shared";
  const equalTeam = data.publicEconomy.funds.find((fund) => fund.id === "workspace")!.mode === "equal";
  const canManageMembers = hasMemberPermission(currentUser, "manage_members");
  const floor = data.floors.find((item) => item.id === floorId) ?? data.floors[0]!;
  const savedLayout = data.layouts.find((item) => item.floorId === floor.id) ?? data.layouts[0]!;
  const preview = reviewingProject ?? projectDraft;
  const layout = activePanel === "build" && canBuild && preview?.floorId === floor.id ? preview.layout : savedLayout;
  const allRooms = useMemo(() => data.layouts.flatMap((item) => item.rooms), [data.layouts]);
  const floorPortals = useMemo(() => getFloorPortals(data.floors, data.layouts), [data.floors, data.layouts]);
  const playerAssetPlacement = useMemo(() => ({
    userId: data.currentUserId,
    settings: data.gameSettings,
    organisation: data.organisation,
    officeBuilder: canBuild,
  }), [canBuild, data.currentUserId, data.gameSettings, data.organisation]);
  const currentMeeting = data.meetings.find((meeting) => meeting.id === meetingId);
  const visibleRoomIds = useMemo(() => new Set(allRooms.map((room) => room.id)), [allRooms]);
  const visibleMeetings = useMemo(
    () => data.meetings.filter((meeting) => visibleRoomIds.has(meeting.location.roomId)),
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
    const callErrorHandled = callRequest.handle(event);
    workspaceCommand.handleEvent(event);
    publicCommand.handleEvent(event);
    lobbyRequest.handleEvent(event);
    turnRequest.handleEvent(event);
    handleSpotifyEvent(event);
    handleSpecialPropEvent(event);
    if (handleWorkEvent(event)) return;
    if (event.type === "session.ready") {
      synchronizingSession.current = true;
      const floorChanged = event.floorId !== activeFloorIdRef.current;
      activeFloorIdRef.current = event.floorId;
      if (floorChanged) {
        setFloorId(event.floorId);
        setSelection(undefined);
        setBuildSelection(undefined);
        setMovingBuildItem(undefined);
        setPlacingOwnedAssetId(undefined);
        setGameLobbies({});
        setChessLobby(undefined);
        setChessMatch(undefined);
        setChessOpen(false);
        chessOpenRef.current = false;
        selectedChessMatchId.current = undefined;
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
    } else if (event.type === "session.synced") {
      synchronizingSession.current = false;
    } else if (event.type === "workspace.snapshot") {
      onCorporateIdentityChange(event.data.corporateIdentity);
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
    } else if (event.type === "public_economy.updated") {
      setData((current) => ({ ...current, publicEconomy: event.economy }));
      if (event.requestId && event.requestId === pendingRoomProposal.current) {
        pendingRoomProposal.current = undefined;
        setActivePanel("build");
        setBuildView("funds");
      }
    } else if (event.type === "project.preview") {
      if (pendingProjectEdit.current === event.requestId) {
        pendingProjectEdit.current = undefined;
        setProjectDraft(event.project);
        setMovingBuildItem(undefined);
      }
    } else if (event.type === "project.submitted") {
      setProjectDraft(undefined);
      setEditingTool(null);
      setPlacingPublicAssetId(undefined);
      setBuildSelection(undefined);
      if (event.proposalId) setBuildView("funds");
    } else if (event.type === "floor.updated") {
      setData((current) => ({ ...current, floors: current.floors.map((item) => item.id === event.floor.id ? event.floor : item) }));
    } else if (event.type === "room.accessibility") {
      setRoomAccessibility(event.accessibility);
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
    } else if (event.type === "organisation.updated") {
      setData((current) => ({ ...current, organisation: event.organisation }));
    } else if (event.type === "game.settings_updated") {
      setData((current) => ({ ...current, gameSettings: event.settings }));
    } else if (event.type === "corporate_identity.updated") {
      setData((current) => ({ ...current, corporateIdentity: event.corporateIdentity }));
      onCorporateIdentityChange(event.corporateIdentity);
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
    } else if (event.type === "proximity.media_state" || event.type === "proximity.signal" || event.type === "proximity.left") {
      if (handleProximityEvent(event) && activeCallRef.current?.state === "accepted") {
        realtimeSendRef.current({ type: "call.end", requestId: requestId(), callId: activeCallRef.current.callId });
      }
    } else if (event.type === "meeting.media_state" || event.type === "meeting.signal") {
      meetingMediaRef.current?.handle(event);
    } else if (event.type === "meeting.invited") {
      setMeetingInvitations((current) => [...current.filter((invitation) => invitation.id !== event.invitation.id), event.invitation].slice(-5));
    } else if (event.type === "meeting.invitation_sent") {
      showToast("Invitation sent.");
    } else if (event.type === "meeting.updated") {
      setData((current) => ({ ...current, meetings: current.meetings.map((meeting) => meeting.id === event.meeting.id ? event.meeting : meeting) }));
    } else if (event.type === "meeting.joined") {
      const pending = pendingMeetingOpen.current;
      if (pending?.meetingId === event.meeting.id && pending.requestId === event.requestId && event.session.meetingId === event.meeting.id) {
        setData((current) => ({ ...current, meetings: current.meetings.map((meeting) => meeting.id === event.meeting.id ? event.meeting : meeting) }));
        meetingMediaRef.current?.close();
        const nextConnection = new MediaConnection(event.session, (command) => realtimeSendRef.current(command));
        meetingMediaRef.current = nextConnection;
        setMeetingConnection(nextConnection);
        meetingLeaveRequests.current.clear();
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
      } else if (event.session.sessionId !== meetingMediaRef.current?.getSnapshot().session.sessionId) {
        realtimeSendRef.current({ type: "meeting.leave", requestId: requestId(), meetingId: event.meeting.id, sessionId: event.session.sessionId });
      }
    } else if (event.type === "meeting.left") {
      const sessionId = meetingMediaRef.current?.getSnapshot().session.sessionId;
      const pending = pendingMeetingLeave.current;
      if (sessionId !== event.sessionId || activeMeetingId.current !== event.meetingId
        || (event.requestId && !meetingLeaveRequests.current.has(event.requestId))) return;
      meetingLeaveRequests.current.clear();
      if (pending?.meetingId === event.meetingId) {
        pendingMeetingLeave.current = undefined;
        setLeavingMeetingId(undefined);
      }
      if (activeMeetingId.current === event.meetingId) {
        meetingMediaRef.current?.close();
        meetingMediaRef.current = undefined;
        setMeetingConnection(undefined);
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
    } else if (event.type === "interaction.prop_used") {
      if (event.use.userId === data.currentUserId && event.use.result) setReactionAnnouncement(event.use.result);
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
      const previous = activeCallRef.current;
      if (event.state === "accepted" && previous?.callId === event.callId && previous.state === "ringing") {
        startProximity();
      }
      if (event.state === "ended" && previous?.callId === event.callId && previous.state === "accepted"
        && !proximityConnection?.getSnapshot().session.callId) leaveProximity();
      if (callDismissTimer.current) {
        window.clearTimeout(callDismissTimer.current);
        callDismissTimer.current = undefined;
      }
      activeCallRef.current = { callId: event.callId, peerUserId: event.peerUserId, direction: event.direction, state: event.state };
      setActiveCall(activeCallRef.current);
      if (event.state === "declined" && event.direction === "outgoing") {
        showToast("Call declined.");
      }
      if (event.state === "missed") {
        const peer = data.members.find((member) => member.id === event.peerUserId);
        showToast(event.direction === "outgoing" ? "No answer." : `Missed call from ${peer?.name ?? "a coworker"}.`);
      }
      if (event.state === "ended" || event.state === "declined" || event.state === "missed") {
        callDismissTimer.current = window.setTimeout(() => {
          if (activeCallRef.current?.callId === event.callId) activeCallRef.current = undefined;
          setActiveCall((current) => current?.callId === event.callId ? undefined : current);
          callDismissTimer.current = undefined;
        }, 500);
      }
    } else if (event.type === "game.lobby_updated") {
      setGameLobbies((current) => ({ ...current, [event.lobby.objectId]: event.lobby }));
    } else if (event.type === "game.round_started") {
      if (event.round.participants.some((participant) => participant.userId === data.currentUserId)) {
        activeGameRound.current = event.round;
        gamePreferences.current.set(event.round.objectId, {
          mode: event.round.participants.length > 1 ? "multiplayer" : "solo",
          ...(event.round.fallingBlocks ? { settings: event.round.fallingBlocks.settings } : {}),
        });
        setGameRound(event.round);
        setGameState(undefined);
        setGameOpen(true);
      }
    } else if (event.type === "game.round_updated") {
      setGameRound((current) => current?.id === event.round.id ? event.round : current);
    } else if (event.type === "game.state") {
      if (event.roundId === activeGameRound.current?.id) {
        setGameState(event);
        if (event.definitionId === TIC_TAC_TOE_DEFINITION_ID) {
          gamePreferences.current.set(activeGameRound.current.objectId, {
            mode: event.bot ? "solo" : "multiplayer", variantId: event.variantId, ...(event.bot ? { bot: event.bot } : {}),
          });
        }
      }
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
        if (event.round.definitionId === TIC_TAC_TOE_DEFINITION_ID) {
          showToast(playerScore.won
            ? `You won.${reward}`
            : event.round.winnerUserId
              ? `You lost.${reward}`
              : `Draw.${reward}`);
        } else {
          showToast(playerScore.won
            ? `You won with ${playerScore.score.toLocaleString()}.${reward}`
            : `Score saved: ${playerScore.score.toLocaleString()}.${reward}`);
        }
      }
    } else if (event.type === "chess.lobby_updated") {
      setChessLobby(event.lobby);
    } else if (event.type === "chess.lobby_closed") {
      setChessLobby(undefined);
    } else if (event.type === "chess.match_state") {
      if ((chessOpenRef.current || synchronizingSession.current)
        && (!pendingChessOpenRequestId.current || !selectedChessMatchId.current || selectedChessMatchId.current === event.match.id)) {
        pendingChessOpenRequestId.current = undefined;
        selectedChessMatchId.current = event.match.id;
        chessOpenRef.current = true;
        setChessMatch(event.match);
        setChessOpen(true);
      }
    } else if (event.type === "chess.match_closed") {
      if (selectedChessMatchId.current === event.matchId) {
        selectedChessMatchId.current = undefined;
        pendingChessOpenRequestId.current = undefined;
        chessOpenRef.current = false;
        turnRequest.clear();
        setChessMatch(undefined);
        setChessOpen(false);
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
      if (event.requestId === pendingRoomProposal.current) pendingRoomProposal.current = undefined;
      if (event.requestId === pendingProjectEdit.current) pendingProjectEdit.current = undefined;
      if (event.requestId && pendingChessOpenRequestId.current === event.requestId) {
        pendingChessOpenRequestId.current = undefined;
        chessOpenRef.current = false;
        selectedChessMatchId.current = undefined;
        setChessOpen(false);
        setChessMatch(undefined);
      }
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
        const invitation = pendingMeetingOpen.current.invitation;
        if (invitation && Date.parse(invitation.expiresAt) > Date.now()) setMeetingInvitations((current) => [...current, invitation]);
        pendingMeetingOpen.current = undefined;
        setOpeningMeeting(undefined);
      }
      if (event.requestId && pendingMeetingLeave.current?.requestId === event.requestId) {
        meetingLeaveRequests.current.delete(event.requestId);
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
      if (!callErrorHandled) showToast(event.message);
    }
  }, [activeCall, activeConversationId, activePanel, announceOffscreenGong, callRequest.handle, currentMeeting, currentUser.availability, data.currentUserId, data.members, displayGongRing, displayHighFive, displayReaction, floorId, handleSpotifyEvent, handleSpecialPropEvent, handleWorkEvent, onCorporateIdentityChange, showToast]);

  const { connection, snapshot, send } = useRealtime({
    floorId,
    onEvent: handleRealtimeEvent,
    onUnauthorized: onSessionExpired,
  });
  realtimeSendRef.current = send;
  useEffect(() => {
    if (connection !== "online") callRequest.fail("Connection lost. Reconnect and try again.");
  }, [connection, callRequest.fail]);
  useEffect(() => { callRequest.clear(); }, [floorId, meetingId, activePanel === "build", callRequest.clear]);
  useEffect(() => { if (connection !== "online") workspaceCommand.clear(); }, [connection, workspaceCommand.clear]);

  useEffect(() => {
    setRoomAccessibility(undefined);
    if (connection !== "online" || activePanel !== "build" || !canBuild || !accessInspectionUserId) return;
    send({ type: "room.inspect_access", requestId: crypto.randomUUID(), userId: accessInspectionUserId });
    return () => {
      send({ type: "room.inspect_access", requestId: crypto.randomUUID(), userId: null });
    };
  }, [accessInspectionUserId, activePanel, canBuild, connection, send]);

  useEffect(() => {
    if (activePanel !== "build" || !canBuild) setAccessInspectionUserId(null);
  }, [activePanel, canBuild]);

  useEffect(() => () => { meetingMediaRef.current?.close(); }, []);

  useEffect(() => {
    if (!openingMeeting && !leavingMeetingId) return;
    const timer = window.setTimeout(() => {
      const invitation = pendingMeetingOpen.current?.invitation;
      if (invitation && Date.parse(invitation.expiresAt) > Date.now()) setMeetingInvitations((current) => [...current, invitation]);
      pendingMeetingOpen.current = undefined;
      pendingMeetingLeave.current = undefined;
      setOpeningMeeting(undefined);
      setLeavingMeetingId(undefined);
      showToast("The meeting did not respond. Try again.");
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [openingMeeting, leavingMeetingId, showToast]);

  useEffect(() => {
    if (connection !== "online") disconnectWorkUpdates();
  }, [connection, disconnectWorkUpdates]);

  useEffect(() => {
    if (connection !== "online") clearSpotifyActivities();
  }, [connection, clearSpotifyActivities]);

  useEffect(() => {
    if (connection === "online") {
      connectionWasOnline.current = true;
      if (selectedChessMatchId.current && !chessOpenRef.current) {
        const id = requestId();
        chessOpenRef.current = true;
        pendingChessOpenRequestId.current = id;
        if (!lobbyRequest.run(send, { type: "chess.match_open", requestId: id, matchId: selectedChessMatchId.current })) {
          chessOpenRef.current = false;
          pendingChessOpenRequestId.current = undefined;
        }
      }
      return;
    }
    if (!connectionWasOnline.current) {
      return;
    }
    setActiveCall(undefined);
    activeCallRef.current = undefined;
    meetingMediaRef.current?.close();
    meetingMediaRef.current = undefined;
    setMeetingConnection(undefined);
    meetingLeaveRequests.current.clear();
    setMeetingInvitations([]);
    activeMeetingId.current = undefined;
    if (callDismissTimer.current) {
      window.clearTimeout(callDismissTimer.current);
      callDismissTimer.current = undefined;
    }
    setMeetingId(undefined);
    setMuted(true);
    setCameraOn(false);
    setGameOpen(false);
    setGameLobbies({});
    setGameRound(undefined);
    setGameState(undefined);
    activeGameRound.current = undefined;
    lobbyRequest.clear();
    turnRequest.clear();
    setChessLobby(undefined);
    setChessMatch(undefined);
    setChessOpen(false);
    chessOpenRef.current = false;
    pendingChessOpenRequestId.current = undefined;
    setReactions([]);
    setHighFives([]);
    setGongRings([]);
    resetSpecialProps();
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
    publicCommand.clear();
    pendingProjectEdit.current = undefined;
    setProjectDraft(undefined);
    setReviewingProject(undefined);
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
  }, [connection, resetSpecialProps]);

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
    if (sent && callRequest.status?.command.type === "movement.approach_user"
      && (command.type === "movement.set_destination" || command.type === "movement.input" && (command.dx !== 0 || command.dy !== 0))) callRequest.clear();
    if (!sent && command.type !== "movement.input") {
      showToast("Connection unavailable.");
    }
    return sent;
  }, [send, showToast, callRequest.status, callRequest.clear]);
  const requestId = () => crypto.randomUUID();

  const callMember = (targetUserId: string, type: "call.request" | "movement.approach_user" = "call.request") => {
    if (callRequest.pending) return;
    if (activeCallRef.current?.state === "ringing" || activeCallRef.current?.state === "accepted") {
      showToast("End your current call before starting another.");
      return;
    }
    if (currentUser.availability === "dnd") {
      showToast("Turn off Do not disturb before calling.");
      return;
    }
    pendingTravelFocus.current = undefined;
    const target = visiblePlayers.find((player) => player.userId === targetUserId);
    if (currentPlayer && target?.proximity?.callId && target.roomId === currentPlayer.roomId
      && Math.hypot(target.x - currentPlayer.x, target.y - currentPlayer.y) <= PROXIMITY_INTERACTION_RADIUS) {
      callRequest.clear();
      startProximity();
      return;
    }
    callRequest.run(targetUserId, type);
  };

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

  useEffect(() => {
    if (connection !== "online" || activePanel === "build" || meetingId) stopProximity();
    else if (!muted || cameraOn) startProximity();
  }, [connection, activePanel, meetingId, muted, cameraOn, proximityConnection, startProximity, stopProximity]);

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
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || gameOpen || chessOpen || workObject || activePanel === "build") {
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
  }, [activePanel, chessOpen, gameOpen, workObject, sendReaction]);

  useEffect(() => {
    if (!activePanel) {
      return;
    }
    const closePanel = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape"
        || event.defaultPrevented
        || avatarDialogOpen
        || workObject
        || gameOpen
        || chessOpen
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
  }, [activePanel, avatarDialogOpen, chessOpen, currentMeeting, gameOpen, meetingSwitch, workObject]);

  const visiblePlayers = snapshot?.floorId === floorId ? snapshot.players : [];
  const currentPlayer = visiblePlayers.find((player) => player.userId === data.currentUserId);
  const carriedPlayer = visiblePlayers.find((player) => player.carriedByUserId === data.currentUserId);
  const carrierPlayer = currentPlayer?.carriedByUserId
    ? visiblePlayers.find((player) => player.userId === currentPlayer.carriedByUserId)
    : undefined;
  const carriedMember = carriedPlayer ? data.members.find((member) => member.id === carriedPlayer.userId) : undefined;
  const carrierMember = carrierPlayer ? data.members.find((member) => member.id === carrierPlayer.userId) : undefined;
  const currentRoom = layout.rooms.find((room) => room.id === currentPlayer?.roomId);
  const enteredMeetings = currentPlayer && !currentMeeting && !openingMeeting && !meetingSwitch
    ? visibleMeetings.filter((meeting) => meeting.status === "live" && isPlayerInMeetingArea(currentPlayer, meeting))
    : [];

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

  const saveCorporateIdentity = async (settings: CorporateIdentitySettings) => {
    const updated = await updateCorporateIdentity(settings);
    setData((current) => ({ ...current, corporateIdentity: updated }));
    onCorporateIdentityChange(updated);
  };

  const updateCorporateLogo = async (file: File) => {
    const updated = await uploadCorporateLogo(file);
    setData((current) => ({ ...current, corporateIdentity: updated }));
    onCorporateIdentityChange(updated);
  };

  const removeCorporateIdentityLogo = async () => {
    const updated = await removeCorporateLogo();
    setData((current) => ({ ...current, corporateIdentity: updated }));
    onCorporateIdentityChange(updated);
  };

  const updateCharacter = async (appearance: CharacterAppearance) => {
    const member = await updatePlayerCharacter(appearance);
    setData((current) => ({
      ...current,
      members: current.members.map((item) => item.id === member.id ? member : item),
    }));
  };

  const startOpeningMeeting = (meeting: Meeting, view: MeetingView, invitation?: MeetingInvitation) => {
    if (pendingMeetingOpen.current || pendingMeetingLeave.current) {
      return;
    }
    const meetingRequestId = requestId();
    pendingMeetingOpen.current = { requestId: meetingRequestId, meetingId: meeting.id, view, ...(invitation ? { invitation } : {}) };
    setOpeningMeeting({ meetingId: meeting.id, view });
    if (!request({ type: "meeting.join", requestId: meetingRequestId, meetingId: meeting.id, ...(invitation ? { invitationId: invitation.id } : {}) })) {
      if (invitation) setMeetingInvitations((current) => [...current, invitation]);
      pendingMeetingOpen.current = undefined;
      setOpeningMeeting(undefined);
    }
  };

  const openMeeting = (meeting: Meeting, view: MeetingView, invitation?: MeetingInvitation) => {
    if (currentMeeting?.id === meeting.id) {
      setMeetingView(view);
      return;
    }
    if (currentMeeting) {
      setMeetingSwitch({ meeting, view, consequence: `This will leave ${currentMeeting.title}.`, ...(invitation ? { invitation } : {}) });
      return;
    }
    if (activeCall && (activeCall.state === "ringing" || activeCall.state === "accepted")) {
      const peer = data.members.find((member) => member.id === activeCall.peerUserId);
      setMeetingSwitch({
        meeting,
        view,
        ...(invitation ? { invitation } : {}),
        consequence: peer ? `This will end your call with ${peer.name}.` : "This will end your current call.",
      });
      return;
    }
    startOpeningMeeting(meeting, view, invitation);
  };

  const leaveMeeting = () => {
    const sessionId = meetingMediaRef.current?.getSnapshot().session.sessionId;
    if (!currentMeeting || !sessionId || pendingMeetingLeave.current || pendingMeetingOpen.current) {
      return;
    }
    const leaveRequestId = requestId();
    meetingLeaveRequests.current.add(leaveRequestId);
    pendingMeetingLeave.current = { requestId: leaveRequestId, meetingId: currentMeeting.id };
    setLeavingMeetingId(currentMeeting.id);
    if (!request({ type: "meeting.leave", requestId: leaveRequestId, meetingId: currentMeeting.id, sessionId })) {
      meetingLeaveRequests.current.delete(leaveRequestId);
      pendingMeetingLeave.current = undefined;
      setLeavingMeetingId(undefined);
    }
  };

  const closeGame = () => {
    if (gameRound) request({ type: "game.end", requestId: requestId(), roundId: gameRound.id });
    activeGameRound.current = undefined;
    turnRequest.clear();
    setGameOpen(false);
    setGameRound(undefined);
    setGameState(undefined);
  };

  const createChessMatch = (settings: ChessMatchSettings) => {
    const id = requestId();
    if (settings.bot) {
      selectedChessMatchId.current = undefined;
      chessOpenRef.current = true;
      pendingChessOpenRequestId.current = id;
    }
    if (!lobbyRequest.run(request, { type: "chess.match_create", requestId: id, settings }) && settings.bot) {
      chessOpenRef.current = false;
      pendingChessOpenRequestId.current = undefined;
    }
  };

  const openChessMatch = (matchId: string, join = false) => {
    if (lobbyRequest.pending) return;
    selectedChessMatchId.current = matchId;
    const chessRequestId = requestId();
    pendingChessOpenRequestId.current = chessRequestId;
    chessOpenRef.current = true;
    const sent = lobbyRequest.run(request, join
      ? { type: "chess.match_join", requestId: chessRequestId, matchId }
      : { type: "chess.match_open", requestId: chessRequestId, matchId });
    if (!sent) {
      pendingChessOpenRequestId.current = undefined;
      chessOpenRef.current = false;
    }
  };

  const closeChess = () => {
    if (chessLobby) selectInteraction(chessLobby.objectId);
    selectedChessMatchId.current = undefined;
    turnRequest.clear();
    chessOpenRef.current = false;
    pendingChessOpenRequestId.current = undefined;
    if (chessMatch) {
      request({ type: "chess.match_close", requestId: requestId(), matchId: chessMatch.id });
    }
    setChessOpen(false);
    setChessMatch(undefined);
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
    ? data.miniGames.find((definition) => definition.assetId === selectedObject.assetId)
    : undefined;
  const selectedGong = selectedObjectDefinition?.kind === "gong" ? selectedObject : undefined;
  const selectedWorkObject = selectedObjectDefinition?.workKind || selectedObject?.assetId === GITHUB_TRAY_ASSET_ID ? selectedObject : undefined;
  const currentWorkObject = workObject && data.layouts.flatMap((floorLayout) => floorLayout.objects).find((object) => object.id === workObject.id);
  const workState = workObject && getWorkObjectState(currentWorkObject ?? workObject);
  const openWorkObject = (object: WorldObject) => {
    if (currentMeeting) {
      setMeetingView("small");
      setActivePanel(null);
    }
    request({ type: "movement.stop", requestId: requestId() });
    setSelection(undefined);
    setWorkObject(object);
  };
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
  const hasRoomAccess = (room: Room) => roomAccessAllows(room, data.currentUserId, data.gameSettings, data.organisation)
    || grantedRoomIds.has(room.id);
  const nearbyDoors = currentPlayer
    ? layout.rooms
      .filter((room) => room.access.mode !== "open" && currentRoom?.id !== room.id)
      .flatMap((room) => layout.openings
        .filter((opening): opening is Door => opening.type === "door" && room.doorIds.includes(opening.id))
        .map((door) => {
        const position = getRoomDoorPosition(layout, room, door);
        return { room, door, distance: Math.hypot(currentPlayer.x - position.x, currentPlayer.y - position.y) };
      }))
      .filter((candidate) => hasRoomAccess(candidate.room) || candidate.room.access.knockable)
      .filter((candidate) => candidate.distance <= 84)
      .sort((left, right) => left.distance - right.distance)
    : [];
  const nearbyDoorIds = nearbyDoors.map(({ door }) => door.id).join("|");

  useEffect(() => {
    if (dismissedDoorEntryId && !nearbyDoors.some(({ door }) => door.id === dismissedDoorEntryId)) {
      pendingDoorEntryRequestId.current = undefined;
      setDismissedDoorEntryId(undefined);
    }
  }, [dismissedDoorEntryId, nearbyDoorIds]);

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
  const availableGameLobbies = Object.values(gameLobbies).filter((lobby) =>
    lobby.floorId === floorId && lobby.participantIds.includes(data.currentUserId) && !gameRound,
  );
  const availableChessLobby = chessLobby?.floorId === floorId && !gameRound ? chessLobby : undefined;
  const interactionAreas: InteractionArea[] = [];
  if (currentPlayer) {
    for (const object of layout.objects) {
      const definition = getAssetDefinition(object.assetId);
      if (!definition || (!definition.workKind && object.assetId !== GITHUB_TRAY_ASSET_ID) || !canUseWorkObject(object, layout, currentPlayer)) continue;
      const bounds = getPlacedAssetBounds(object);
      interactionAreas.push({ id: object.id, label: object.label ?? definition.name,
        distance: distanceToBounds(currentPlayer.x, currentPlayer.y, bounds), highlight: { type: "rect", bounds } });
    }
    for (const lobby of [...availableGameLobbies, ...(availableChessLobby ? [availableChessLobby] : [])]) {
      const object = layout.objects.find((candidate) => candidate.id === lobby.objectId);
      const definition = data.miniGames.find((candidate) => candidate.id === lobby.definitionId);
      if (!object || !definition) continue;
      const area = getGameArea(object);
      interactionAreas.push({ id: lobby.objectId, label: object.label ?? definition.name,
        distance: Math.hypot(currentPlayer.x - area.x, currentPlayer.y - area.y),
        highlight: { type: "circle", ...area } });
    }
    for (const meeting of enteredMeetings) {
      const location = meeting.location;
      const room = layout.rooms.find((candidate) => candidate.id === location.roomId);
      if (!room) continue;
      interactionAreas.push({ id: meeting.id, label: meeting.title, distance: 0,
        highlight: { type: "rect", bounds: room.bounds } });
    }
    for (const candidate of nearbyDoors.filter(({ door, room }) => door.id !== dismissedDoorEntryId && !pendingRoomIds.has(room.id))) {
      const position = getRoomDoorPosition(layout, candidate.room, candidate.door);
      interactionAreas.push({ id: candidate.door.id, label: candidate.room.name, distance: candidate.distance,
        highlight: { type: "circle", ...position, radius: 84 } });
    }
    for (const player of visiblePlayers) {
      const member = data.members.find((candidate) => candidate.id === player.userId);
      if (!member || player.userId === data.currentUserId || !player.connected || currentMeeting) continue;
      const distance = Math.hypot(player.x - currentPlayer.x, player.y - currentPlayer.y);
      if (distance > PROXIMITY_INTERACTION_RADIUS || player.roomId !== currentPlayer.roomId) continue;
      interactionAreas.push({ id: player.userId, label: member.name, distance,
        highlight: { type: "circle", x: player.x, y: player.y, radius: PROXIMITY_INTERACTION_RADIUS } });
    }
  }
  interactionAreas.sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));
  const { active: activeInteraction, select: selectInteraction } = useInteractionAreas(interactionAreas);
  const visibleGameLobby = availableGameLobbies.find((lobby) => lobby.objectId === activeInteraction?.id);
  const visibleChessLobby = activeInteraction?.id === availableChessLobby?.objectId ? availableChessLobby : undefined;
  const lobbyGame = visibleChessLobby ? CHESS_DEFINITION_ID : visibleGameLobby?.definitionId;
  useEffect(() => {
    const load = lobbyGame === FALLING_BLOCKS_DEFINITION_ID ? loadFallingBlocksGame
      : lobbyGame === TIC_TAC_TOE_DEFINITION_ID ? loadTicTacToeGame
        : lobbyGame === CHESS_DEFINITION_ID ? loadChessGame : undefined;
    if (load) void load().catch((error: unknown) => console.error("Game could not preload.", error));
  }, [lobbyGame]);
  const visibleMeetingEntry = enteredMeetings.find((meeting) => meeting.id === activeInteraction?.id);
  const visibleNearbyDoor = nearbyDoors.find(({ door }) => door.id === activeInteraction?.id);
  const nearbyMember = data.members.find((member) => member.id === activeInteraction?.id);
  const nearbyCallId = visiblePlayers.find((player) => player.userId === nearbyMember?.id)?.proximity?.callId;
  const inNearbyCall = Boolean(nearbyCallId && nearbyCallId === currentPlayer?.proximity?.callId);
  const nearbyWorkObject = layout.objects.find((object) => object.id === activeInteraction?.id && (getAssetDefinition(object.assetId)?.workKind || object.assetId === GITHUB_TRAY_ASSET_ID));
  const selectedGameLobbyVisible = Boolean(selectedGameDefinition && interactionAreas.some((area) => area.id === selectedObject?.id));
  const visibleIncomingKnocks = useMemo(() => incomingKnocks.flatMap((knock) => {
    const room = allRooms.find((item) => item.id === knock.roomId);
    const requester = data.members.find((member) => member.id === knock.requesterUserId);
    return room && requester ? [{ knock, room, requester }] : [];
  }), [allRooms, data.members, incomingKnocks]);

  const applyBuildEdit = (edit: LayoutEdit, moving = false): boolean => {
    if (reviewingProject || publicCommand.pending || pendingProjectEdit.current || buildView === "funds") return false;
    if (!canBuild && floorId !== activeFloorIdRef.current) return false;
    if (!canBuild && pendingPlayerAssetRequest.current) {
      return false;
    }
    const editRequestId = requestId();
    let sent: boolean;
    let playerEditType: "place" | "move" | "remove" | undefined;
    if (canBuild) {
      const projectEdit = edit.tool === "asset" && placingPublicAssetId
        ? { tool: "public_asset" as const, publicAssetId: placingPublicAssetId, position: edit.position, variantId: edit.variantId, rotation: edit.rotation }
        : edit;
      pendingProjectEdit.current = editRequestId;
      sent = publicCommand.run(request, { type: "project.edit", requestId: editRequestId, baseRevision: savedLayout.revision,
        fundId: publicFundId, ...(projectDraft ? { draftId: projectDraft.id } : {}), edit: projectEdit });
      if (!sent) pendingProjectEdit.current = undefined;
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

  const changeBuildView = (view: BuildView) => {
    setBuildView(view);
    setReviewingProject(undefined);
    setEditingTool(null);
    setBuildSelection(undefined);
    setMovingBuildItem(undefined);
    setPlacingOwnedAssetId(undefined);
    setPlacingPublicAssetId(undefined);
    setAccessInspectionUserId(null);
  };

  const focusPersonalAsset = (targetFloorId: string, objectId: string) => {
    const object = data.layouts.find((candidate) => candidate.floorId === targetFloorId)?.objects
      .find((candidate) => candidate.id === objectId && candidate.ownerUserId === data.currentUserId);
    if (!object) return;
    setFloorId(targetFloorId);
    setSelection(undefined);
    setEditingTool(null);
    setMovingBuildItem(undefined);
    setPlacingOwnedAssetId(undefined);
    setBuildSelection({ type: "asset", id: object.id });
    setFocusTarget({ floorId: targetFloorId, objectId: object.id, requestId: requestId() });
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
    if (editingTool === "asset" || editingTool === "spawn") {
      setEditingTool(null);
      setPlacingOwnedAssetId(undefined);
    }
  };

  const moveSelectedBuildItem = () => {
    if (!buildSelection || (!canBuild && floorId !== activeFloorIdRef.current)) {
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
      const position = getRotatedAssetPosition(object, rotation);
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
        corporateIdentity={data.corporateIdentity}
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
          coinBalance={data.economy.coinBalance}
          colorTheme={colorTheme}
          onColorThemeChange={onColorThemeChange}
          onFloorChange={viewFloor}
        />
        <WorldCanvas
          floor={floor}
          layout={layout}
          projectPreview={activePanel === "build" && canBuild && preview?.floorId === floor.id ? {
            savedLayout, status: reviewingProject ? "Proposal · not placed" : "Draft · not placed", removing: preview.quote.destructive,
          } : undefined}
          members={data.members}
          players={visiblePlayers}
          reactions={floorReactions}
          highFives={floorHighFives}
          gongRings={floorGongRings}
          specialPropUses={specialPropUses}
          currentUserId={data.currentUserId}
          editing={activePanel === "build"}
          roomAccessibility={activePanel === "build" && canBuild && connection === "online" && roomAccessibility?.userId === accessInspectionUserId ? roomAccessibility : undefined}
          editingTool={reviewingProject || buildView === "funds" ? null : editingTool}
          editingAssetId={editingAssetId}
          editingAssetVariantId={editingAssetVariantId}
          editingAssetRotation={editingAssetRotation}
          selectedBuildItem={buildSelection}
          movingBuildItem={movingBuildItem}
          playerAssetPlacement={playerAssetPlacement}
          colorTheme={colorTheme}
          activeInteraction={activePanel !== "build" && !gameOpen && !chessOpen ? activeInteraction?.highlight : undefined}
          inputEnabled={floorId === activeFloorIdRef.current && activePanel !== "build" && activePanel !== "rooms" && !avatarDialogOpen && !gameOpen && !chessOpen && !workObject && (!currentMeeting || meetingView === "small")}
          focusTarget={focusTarget}
          onDestination={(x, y) => {
            setSelection(undefined);
            navigateToDestination(floorId, x, y);
          }}
          onPlayerSelect={(userId, anchor) => { setSelection({ type: "player", userId, anchor }); setSongUserId(undefined); }}
          listeningActivities={connection === "online" ? spotifyActivities : {}}
          onEdit={(edit) => applyBuildEdit(edit, edit.tool === "asset.move" || edit.tool === "wall.move" || edit.tool === "opening.move")}
          onObjectSelect={(object, interactionId, anchor) => {
            const game = data.miniGames.find((candidate) => candidate.assetId === object.assetId);
            if (game && interactionAreas.some((area) => area.id === object.id)) {
              selectInteraction(object.id);
              setSelection(undefined);
            } else {
              setSelection(interactionId ? { type: "object", object, interactionId, anchor } : { type: "object", object, anchor });
            }
          }}
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

        {activePanel !== "build" && !gameOpen && !chessOpen && !workObject
          && (!hasVisibleSelection || Boolean(selectedGameDefinition)) && activeInteraction && (
          <InteractionPanel areas={interactionAreas} active={activeInteraction} onSelect={selectInteraction}>
        {visibleGameLobby?.definitionId === FALLING_BLOCKS_DEFINITION_ID && (
          <FallingBlocksLobby
            key={visibleGameLobby.objectId}
            lobby={visibleGameLobby}
            members={data.members}
            scores={data.scores}
            statistics={data.gameStatistics}
            currentUserId={data.currentUserId}
            pending={lobbyRequest.pending}
            initialMode={gamePreferences.current.get(visibleGameLobby.objectId)?.mode}
            initialSettings={gamePreferences.current.get(visibleGameLobby.objectId)?.settings}
            onStart={(solo, settings) => lobbyRequest.run(request, { type: "game.start", requestId: requestId(), definitionId: FALLING_BLOCKS_DEFINITION_ID, objectId: visibleGameLobby.objectId, solo, settings })}
          />
        )}

        {visibleGameLobby?.definitionId === TIC_TAC_TOE_DEFINITION_ID && (
          <TicTacToeLobby
            key={visibleGameLobby.objectId}
            lobby={visibleGameLobby}
            members={data.members}
            statistics={data.gameStatistics}
            currentUserId={data.currentUserId}
            pending={lobbyRequest.pending}
            initialMode={gamePreferences.current.get(visibleGameLobby.objectId)?.mode}
            initialVariant={gamePreferences.current.get(visibleGameLobby.objectId)?.variantId}
            initialDifficulty={gamePreferences.current.get(visibleGameLobby.objectId)?.bot?.difficulty}
            onStart={(variantId, bot) => lobbyRequest.run(request, {
              type: "game.start",
              requestId: requestId(),
              definitionId: TIC_TAC_TOE_DEFINITION_ID,
              objectId: visibleGameLobby.objectId,
              variantId,
              ...(bot ? { bot } : {}),
            })}
          />
        )}

        {visibleChessLobby && (
          <ChessLobby
            lobby={visibleChessLobby}
            members={data.members}
            currentUserId={data.currentUserId}
            onCreate={createChessMatch}
            pending={lobbyRequest.pending}
            onJoin={(matchId) => openChessMatch(matchId, true)}
            onOpen={openChessMatch}
            onCancel={(matchId) => lobbyRequest.run(request, { type: "chess.match_cancel", requestId: requestId(), matchId })}
          />
        )}

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
            {nearbyWorkObject && (
              <div className="nearby-person-actions">
                <strong>{nearbyWorkObject.label ?? getAssetDefinition(nearbyWorkObject.assetId)?.name}</strong>
                <button className="primary-button" onClick={() => openWorkObject(nearbyWorkObject)}>{nearbyWorkObject.assetId === GITHUB_TRAY_ASSET_ID ? "Open tray" : "Open board"}</button>
              </div>
            )}
            {nearbyMember && (
              <div className="nearby-person-actions">
                <Avatar member={nearbyMember} className="person-avatar" />
                <strong>{nearbyMember.name}</strong>
                <button className="primary-button" onClick={() => messageMember(nearbyMember.id)}>Chat</button>
                <button className="secondary-button" disabled={Boolean(activeCall) || callRequest.pending || inNearbyCall}
                  onClick={() => callMember(nearbyMember.id)}>
                  <Phone size={16} />{inNearbyCall ? "In call" : nearbyCallId ? "Join call" : "Call"}
                </button>
              </div>
            )}
          </InteractionPanel>
        )}
        {activePanel !== "build" && hasVisibleSelection && (
          <WorldActionMenu anchor={selection?.anchor} besidePlayer={Boolean(selectedPlayerMember)}>
          {hasVisibleSelection && (
            <div
              className="context-action"
              role="region"
              aria-label={selectedPlayerMember ? `Selected ${selectedPlayerMember.name}` : "Selected place"}
              onClick={(event) => {
                const target = event.target;
                if (target instanceof Element && target.closest("button:not(:disabled)") && !target.closest("[data-keep-context]")) {
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
                {spotifyActivities[selectedPlayerMember.id] && connection === "online" && <button
                  className="icon-button spotify-listening-button" data-keep-context
                  aria-label={`View ${selectedPlayerMember.name}’s song`} aria-expanded={songUserId === selectedPlayerMember.id}
                  onClick={() => setSongUserId(songUserId === selectedPlayerMember.id ? undefined : selectedPlayerMember.id)}
                ><Music2 size={18} /></button>}
                <button
                  className="primary-button"
                  aria-label={`Call ${selectedPlayerMember.name}`}
                  disabled={Boolean(activeCall) || callRequest.pending}
                  onClick={() => callMember(selectedPlayerMember.id, "movement.approach_user")}
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
            {selectedGameDefinition && !selectedGameLobbyVisible && (
              <button className="primary-button" onClick={() => gatherAtGame(selectedObject!)}>
                <Play size={16} fill="currentColor" />{selectedGameDefinition.id === CHESS_DEFINITION_ID ? "Open chess" : "Join lobby"}
              </button>
            )}
            {selectedWorkObject && (
              <button className="primary-button" onClick={() => {
                if (currentPlayer && canUseWorkObject(selectedWorkObject, layout, currentPlayer)) openWorkObject(selectedWorkObject);
                else {
                  request({ type: "work.approach", requestId: requestId(), objectId: selectedWorkObject.id });
                  setSelection(undefined);
                }
              }}>
                {currentPlayer && canUseWorkObject(selectedWorkObject, layout, currentPlayer)
                  ? selectedWorkObject.assetId === GITHUB_TRAY_ASSET_ID ? "Open tray" : "Open board"
                  : selectedWorkObject.assetId === GITHUB_TRAY_ASSET_ID ? "Walk to tray" : "Walk to board"}
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
            {selectedObject && <SpecialPropAction
              object={selectedObject}
              player={currentPlayer}
              unavailable={Boolean(currentMeeting)}
              uses={specialPropUses}
              now={specialPropClock}
              onUse={() => request({ type: "interaction.use_prop", requestId: requestId(), objectId: selectedObject.id })}
              onApproach={() => {
                const destination = closestObjectApproachPoint(selectedObject, currentPlayer ?? floor.spawn);
                navigateToDestination(selectedObject.floorId, destination.x, destination.y);
              }}
            />}
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

          {selectedPlayerMember && songUserId === selectedPlayerMember.id && <SpotifySongDetails
            key={selectedPlayerMember.id}
            activity={connection === "online" ? spotifyActivities[selectedPlayerMember.id] : undefined}
            own={selectedPlayerMember.id === data.currentUserId}
            onClose={() => setSongUserId(undefined)}
            onSettings={() => { setSelection(undefined); setActivePanel("settings"); }}
          />}
          </WorldActionMenu>
        )}

        {proximityConnection && <ProximityCall
          key={proximityConnection.getSnapshot().session.sessionId}
          connection={proximityConnection}
          members={data.members}
          muted={muted}
          cameraOn={cameraOn}
          onMutedChange={setMuted}
          onCameraChange={setCameraOn}
          onLeave={() => {
            if (activeCall?.state === "accepted") request({ type: "call.end", requestId: requestId(), callId: activeCall.callId });
            leaveProximity();
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

        {activePanel !== "build" && !activeCall && callRequest.status && <CallRequestNotice
          status={callRequest.status}
          peer={data.members.find((member) => member.id === callRequest.status?.command.targetUserId)}
          onRetry={() => callMember(callRequest.status!.command.targetUserId, callRequest.status!.command.type)}
          onDismiss={callRequest.clear}
        />}

        {activePanel !== "build" && activeCall && (activeCall.state === "ringing" || activeCall.state === "accepted" && proximityCallParticipants.length === 0) && (
          <CallNotice
            call={activeCall}
            peer={callPeer}
            onRespond={(callId, accept) => request({ type: "call.respond", requestId: requestId(), callId, accept })}
            onEnd={(callId) => {
              if (activeCall.state === "accepted") leaveProximity();
              return request({ type: "call.end", requestId: requestId(), callId });
            }}
          />
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

        {currentMeeting && meetingConnection && (
          <MeetingOverlay
            key={meetingConnection.getSnapshot().session.sessionId}
            connection={meetingConnection}
            assets={currentPlayer ? layout.objects.filter((object) => Boolean(getWorkObjectState(object)) && canUseWorkObject(object, layout, currentPlayer)) : []}
            onOpenAsset={openWorkObject}
            onInvite={(targetUserId) => request({ type: "meeting.invite", requestId: requestId(), sessionId: meetingConnection.getSnapshot().session.sessionId, targetUserId })}
            onLock={(locked) => request({ type: "meeting.lock", requestId: requestId(), sessionId: meetingConnection.getSnapshot().session.sessionId, locked })}
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

      {activePanel === "organisation" && <DeferredContent sidebar onClose={() => openPanel(null)}>
        <OrganisationPanel organisation={data.organisation} members={data.members} currentUserId={data.currentUserId}
          pending={workspaceCommand.pending || connection !== "online"}
          equalTeam={equalTeam}
          onEdit={(edit) => workspaceCommand.run(request, equalTeam
            ? { type: "public_economy.propose", requestId: requestId(), title: "Change organisation", action: { kind: "organisation", baseRevision: data.organisation.revision, edit } }
            : { type: "organisation.edit", requestId: requestId(), baseRevision: data.organisation.revision, edit })}
          onClose={() => openPanel(null)} />
      </DeferredContent>}
      {activePanel === "rooms" && <DeferredContent onClose={() => openPanel(null)}>
        <RoomPermissionsPanel floors={data.floors} layouts={data.layouts} currentFloorId={floorId} currentUser={currentUser}
          members={data.members} organisation={data.organisation} publicEconomy={data.publicEconomy} settings={data.gameSettings} pending={publicCommand.pending || connection !== "online"}
          error={publicCommand.error}
          equalTeam={equalTeam}
          onSaveRoom={(roomId, baseRevision, settings) => {
            const id = requestId();
            const room = allRooms.find((candidate) => candidate.id === roomId)!;
            setPublicFundId(room.organisationUnitId === settings.organisationUnitId ? publicFundForUnit(data.publicEconomy, data.organisation, room.organisationUnitId).id : "workspace");
            pendingRoomProposal.current = id;
            if (!publicCommand.run(request, { type: "public_economy.propose", requestId: id, title: `Update ${settings.name}`, action: { kind: "room.settings", roomId, baseRevision, settings } })) pendingRoomProposal.current = undefined;
          }}
          onSaveDefaults={(settings) => {
            const id = requestId();
            setPublicFundId("workspace");
            pendingRoomProposal.current = id;
            if (!publicCommand.run(request, { type: "public_economy.propose", requestId: id, title: "Change room defaults", action: { kind: "game.settings", settings } })) pendingRoomProposal.current = undefined;
          }}
          onBack={() => openPanel("build")} onClose={() => openPanel(null)} />
      </DeferredContent>}
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
          onCall={callMember}
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
        <MeetingsPanel meetings={visibleMeetings} rooms={allRooms} members={data.members} openingMeetingId={openingMeeting?.meetingId} onJoin={(meeting) => openMeeting(meeting, "full")} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "settings" && (
        <DeferredContent sidebar onClose={() => setActivePanel(null)}>
          <KidnappingSettingsPanel
            members={data.members}
            currentUserId={data.currentUserId}
            globalSettings={data.kidnapping.global}
            playerSettings={data.kidnapping.player}
            canManage={canManageMembers}
            registrationSettings={data.registrationSettings}
            corporateIdentity={data.corporateIdentity}
            onRegistrationSettingsSave={saveRegistrationSettings}
            onCorporateIdentitySave={saveCorporateIdentity}
            onCorporateLogoUpload={updateCorporateLogo}
            onCorporateLogoRemove={removeCorporateIdentityLogo}
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
        </DeferredContent>
      )}
      {activePanel === "build" && canBuild && accessInspectionUserId && (
        <DeferredContent sidebar onClose={() => openPanel(null)}>
          <RoomAccessibilityPanel
            members={data.members}
            floors={data.floors}
            layouts={data.layouts}
            selectedUserId={accessInspectionUserId}
            accessibility={roomAccessibility}
            connected={connection === "online"}
            onPlayerChange={setAccessInspectionUserId}
            onBack={() => setAccessInspectionUserId(null)}
            onClose={() => openPanel(null)}
          />
        </DeferredContent>
      )}
      {activePanel === "build" && canBuild && !accessInspectionUserId && (
        <DeferredContent sidebar onClose={() => openPanel(null)}>
          <BuildPanel
            accountControls={<BuildEconomyNavigation view={buildView} onChange={changeBuildView} />}
            projectControls={<ProjectToolbar economy={data.publicEconomy} organisation={data.organisation} userId={data.currentUserId}
              fundId={preview?.fundId ?? publicFundId} project={preview} pending={publicCommand.pending || connection !== "online"}
              stale={Boolean(preview && preview.baseRevision !== savedLayout.revision)}
              reviewing={Boolean(reviewingProject)} onFundChange={setPublicFundId}
              onSubmit={(title) => { if (projectDraft) publicCommand.run(request, { type: "project.submit", requestId: requestId(), draftId: projectDraft.id, title }); }}
              onDiscard={() => { setProjectDraft(undefined); setReviewingProject(undefined); setEditingTool(null); setBuildSelection(undefined); if (reviewingProject) setBuildView("funds"); }} />}
            disabled={Boolean(reviewingProject) || publicCommand.pending}
            layout={layout}
            tool={editingTool}
            assetId={editingAssetId}
            assetVariantId={editingAssetVariantId}
            assetRotation={editingAssetRotation}
            selectedItem={buildSelection}
            movingItem={movingBuildItem}
            onInspectAccess={hasMemberPermission(currentUser, "build") ? () => {
              changeEditingTool(null);
              setBuildSelection(undefined);
              setAccessInspectionUserId(data.currentUserId);
            } : undefined}
            onToolChange={changeEditingTool}
            onAssetChange={(assetId) => { setPlacingPublicAssetId(undefined); changeEditingAsset(assetId); }}
            onAssetVariantChange={setEditingAssetVariantId}
            onAssetRotationChange={setEditingAssetRotation}
            onMoveSelected={moveSelectedBuildItem}
            onRotateSelected={rotateSelectedBuildItem}
            onRemoveSelected={removeSelectedBuildItem}
            onOpenRooms={() => openPanel("rooms")}
            onClose={() => openPanel(null)}
          />
        </DeferredContent>
      )}
      {activePanel === "build" && buildView === "personal" && (
        <DeferredContent sidebar onClose={() => openPanel(null)}>
          <PlayerBuildPanel
            accountControls={<BuildEconomyNavigation view={buildView} onChange={changeBuildView} />}
            pendingPublicAction={publicCommand.pending || connection !== "online"}
            publicActionError={publicCommand.error}
            onSell={(ownedAssetId) => publicCommand.run(request, { type: "economy.sell_asset", requestId: requestId(), ownedAssetId })}
            onDonate={(ownedAssetId) => publicCommand.run(request, { type: "economy.donate_asset", requestId: requestId(), ownedAssetId, fundId: "workspace" })}
            organisation={data.organisation}
            onOpenRooms={() => openPanel("rooms")}
            currentUserId={data.currentUserId}
            economy={data.economy}
            playerFloorId={activeFloorIdRef.current}
            gameSettings={data.gameSettings}
            layout={layout}
            layouts={data.layouts}
            floors={data.floors}
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
            onFocus={focusPersonalAsset}
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
        </DeferredContent>
      )}

      {activePanel === "build" && buildView === "funds" && <DeferredContent onClose={() => openPanel(null)}><FundsPanel economy={data.publicEconomy} organisation={data.organisation}
        initialFundId={publicFundId}
        error={publicCommand.error}
        members={data.members} userId={data.currentUserId} personalBalance={data.economy.coinBalance} pending={publicCommand.pending || connection !== "online"}
        onCommand={(command) => { if ("requestId" in command) publicCommand.run(request, command); }}
        onReview={(project) => { setReviewingProject(project); setFloorId(project.floorId); setBuildView("shared"); setEditingTool(null); }}
        onPlace={(publicAssetId, assetId, fundId) => { changeBuildView("shared"); setProjectDraft(undefined); setPublicFundId(fundId); setPlacingPublicAssetId(publicAssetId);
          changeEditingAsset(assetId); setEditingTool("asset"); }}
        onViewChange={changeBuildView} onClose={() => openPanel(null)} /></DeferredContent>}

      {meetingInvitations.slice(0, 1).map((invitation) => {
        const meeting = data.meetings.find((candidate) => candidate.id === invitation.meetingId);
        const dismiss = () => setMeetingInvitations((current) => current.filter((candidate) => candidate.id !== invitation.id));
        return meeting && <MeetingInvitationNotice key={invitation.id} invitation={invitation} meeting={meeting}
          inviter={data.members.find((member) => member.id === invitation.inviterUserId)} onDismiss={dismiss}
          onOpen={(small) => { dismiss(); openMeeting(meeting, small ? "small" : "full", invitation); }} />;
      })}

      {activePanel !== "build" && meetingSwitch && (
        <ConfirmationDialog
          title={`Open ${meetingSwitch.meeting.title}?`}
          description={meetingSwitch.consequence}
          confirmLabel={meetingSwitch.view === "small" ? "Open Small" : "Open"}
          onCancel={() => setMeetingSwitch(undefined)}
          onConfirm={() => {
            const next = meetingSwitch;
            setMeetingSwitch(undefined);
            startOpeningMeeting(next.meeting, next.view, next.invitation);
          }}
        />
      )}

      {avatarDialogOpen && (
        <DeferredContent onClose={() => setAvatarDialogOpen(false)}>
          <AvatarDialog
            currentUser={currentUser}
            onClose={() => setAvatarDialogOpen(false)}
            onSaveCharacter={updateCharacter}
          />
        </DeferredContent>
      )}
      {workObject?.assetId === GITHUB_TRAY_ASSET_ID && (
        <DeferredContent key={workObject.id} modal={!currentMeeting} onClose={() => setWorkObject(undefined)}>
          <GitHubMailroom object={workObject} repository={githubRepository} onRepositoryChange={setGitHubRepository}
            modal={!currentMeeting} onClose={() => setWorkObject(undefined)}
            unavailable={!currentWorkObject ? "This tray was removed. Close it and choose another."
              : connection !== "online" ? "Connection unavailable. Reconnect to open the tray."
                : !currentPlayer || !canUseWorkObject(currentWorkObject, layout, currentPlayer) ? "Move closer to the PR tray to open it." : undefined} />
        </DeferredContent>
      )}
      {workObject && workState && (
        <DeferredContent key={workObject.id} modal={!currentMeeting} onClose={() => setWorkObject(undefined)}>
          <WorkObjectDialog title={workObject.label ?? getAssetDefinition(workObject.assetId)!.name} state={workState} modal={!currentMeeting}
            onUploadImage={(file) => uploadWhiteboardImage(workObject.id, file)}
            unavailable={!currentWorkObject ? "This board was removed. Close it and select another."
              : connection !== "online" ? "Connection unavailable. Reconnect to edit."
                : !currentPlayer || !canUseWorkObject(currentWorkObject, layout, currentPlayer) ? "Move closer to the board to edit it." : undefined}
            onClose={() => setWorkObject(undefined)}
            onUpdate={(baseRevision, edit) => updateWorkObject(send, { type: "work.update", requestId: requestId(), objectId: workObject.id, baseRevision, edit })} />
        </DeferredContent>
      )}

      {activePanel !== "build" && gameOpen && gameRound?.definitionId === FALLING_BLOCKS_DEFINITION_ID && (
        <DeferredContent key={gameRound.id} onClose={closeGame}>
          <FallingBlocksGame
            state={gameState?.definitionId === FALLING_BLOCKS_DEFINITION_ID ? gameState : undefined}
            round={gameRound}
            members={data.members}
            currentUserId={data.currentUserId}
            onCommand={(command) => request({ type: "game.command", requestId: requestId(), roundId: gameRound.id, command })}
            onPlayAgain={gameRound.participants.length === 1 ? () => {
              closeGame();
              lobbyRequest.run(request, { type: "game.start", requestId: requestId(), definitionId: FALLING_BLOCKS_DEFINITION_ID, objectId: gameRound.objectId, solo: true,
                ...(gameRound.fallingBlocks ? { settings: gameRound.fallingBlocks.settings } : {}) });
            } : undefined}
            onClose={closeGame}
          />
        </DeferredContent>
      )}
      {activePanel !== "build" && gameOpen && gameRound?.definitionId === TIC_TAC_TOE_DEFINITION_ID && gameState?.definitionId === TIC_TAC_TOE_DEFINITION_ID && (
        <DeferredContent key={gameRound.id} onClose={closeGame}>
          <TicTacToeGame
            state={gameState}
            members={data.members}
            currentUserId={data.currentUserId}
            pending={turnRequest.pending}
            onCommand={(command) => turnRequest.run(request, { type: "game.command", requestId: requestId(), roundId: gameRound.id, command })}
            onPlayAgain={gameState.bot ? () => {
              closeGame();
              lobbyRequest.run(request, { type: "game.start", requestId: requestId(), definitionId: TIC_TAC_TOE_DEFINITION_ID, objectId: gameRound.objectId,
                variantId: gameState.variantId, bot: gameState.bot! });
            } : undefined}
            onClose={closeGame}
          />
        </DeferredContent>
      )}
      {activePanel !== "build" && chessOpen && chessMatch && (
        <DeferredContent key={chessMatch.id} onClose={closeChess}>
          <ChessGame
            match={chessMatch}
            members={data.members}
            currentUserId={data.currentUserId}
            pending={turnRequest.pending}
            onMove={(move: ChessMoveInput) => turnRequest.run(request, { type: "chess.move", requestId: requestId(), matchId: chessMatch.id, move })}
            onOfferDraw={() => turnRequest.run(request, { type: "chess.draw_offer", requestId: requestId(), matchId: chessMatch.id })}
            onClaimDraw={(move) => turnRequest.run(request, { type: "chess.draw_claim", requestId: requestId(), matchId: chessMatch.id, ...(move ? { move } : {}) })}
            onRespondToDraw={(accept) => turnRequest.run(request, { type: "chess.draw_respond", requestId: requestId(), matchId: chessMatch.id, accept })}
            onResign={() => turnRequest.run(request, { type: "chess.resign", requestId: requestId(), matchId: chessMatch.id })}
            onClose={closeChess}
            onRetryBot={() => openChessMatch(chessMatch.id)}
            onPlayAgain={chessMatch.settings.bot ? () => createChessMatch(chessMatch.settings) : undefined}
          />
        </DeferredContent>
      )}
    </main>
  );
}

function takeAuthTokens(): AuthTokens {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const hashMagic = parameters.get("magic") ?? undefined;
  const hashInvitation = parameters.get("invite") ?? undefined;
  const hashReset = parameters.get("reset") ?? undefined;
  const hashRegistration = parameters.get("registration") ?? undefined;
  const fromHash = Boolean(hashMagic || hashInvitation || hashReset || hashRegistration);
  const saved = readAuthTokenHistory();
  const tokens: AuthTokens = fromHash
    ? {
      ...(hashMagic ? { magic: hashMagic } : {}),
      ...(hashInvitation ? { invitation: hashInvitation } : {}),
      ...(hashReset ? { reset: hashReset } : {}),
      ...(hashRegistration ? { registration: hashRegistration } : {}),
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
    ...(initialResetToken ? { reset: initialResetToken } : {}),
    ...(initialRegistrationToken ? { registration: initialRegistrationToken } : {}),
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
    ...(typeof source.reset === "string" ? { reset: source.reset } : {}),
    ...(typeof source.registration === "string" ? { registration: source.registration } : {}),
  };
}

function writeAuthTokenHistory(tokens: AuthTokens, url?: string): void {
  const state = typeof window.history.state === "object" && window.history.state !== null
    ? { ...window.history.state as Record<string, unknown> }
    : {};
  if (tokens.magic || tokens.invitation || tokens.reset || tokens.registration) {
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
  return player.roomId === meeting.location.roomId;
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
