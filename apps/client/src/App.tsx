import {
  ArrowRight,
  DoorOpen,
  Hand,
  LockKeyhole,
  Play,
  Radio,
  RotateCw,
  Unlock,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAreaDoorPosition } from "@workhard/shared";
import type {
  Area,
  AreaKnock,
  AreaSettings,
  BootstrapData,
  ClientCommand,
  GameState,
  LayoutTool,
  Meeting,
  MemberRole,
  ReactionKind,
  ServerEvent,
  WorldObject,
} from "@workhard/shared";
import { changeMemberRole, createDirectConversation, fetchBootstrap, fetchSession, inviteMember, logout, revokeInvitation, uploadChatImage, verifyMagicLink } from "./api";
import { AreaKnockNotice } from "./components/AreaKnockNotice";
import { AuthScreen } from "./components/AuthScreen";
import { BuildPanel } from "./components/BuildPanel";
import { CallNotice, type ActiveCall } from "./components/CallNotice";
import { ChatPanel } from "./components/ChatPanel";
import { Dock } from "./components/Dock";
import { GamesPanel } from "./components/GamesPanel";
import { IconButton } from "./components/IconButton";
import { MeetingOverlay } from "./components/MeetingOverlay";
import { MeetingsPanel } from "./components/MeetingsPanel";
import { NavRail, type WorkspacePanel } from "./components/NavRail";
import { PeoplePanel } from "./components/PeoplePanel";
import { StackGame } from "./components/StackGame";
import { TopBar } from "./components/TopBar";
import { WorldCanvas } from "./components/WorldCanvas";
import { useRealtime } from "./hooks/useRealtime";
import { REACTION_LABEL, REACTION_OPTIONS, type DisplayHighFive, type DisplayReaction } from "./reactions";
import { mergeWorkspaceSnapshot } from "./workspace-state";

type WorldSelection =
  | { type: "area"; area: Area }
  | { type: "object"; object: WorldObject };

interface WorldFocusTarget {
  userId: string;
  requestId: string;
}

const REACTION_DURATION_MS = 3_200;
const HIGH_FIVE_DURATION_MS = 2_200;

let initialWorkspacePromise: Promise<BootstrapData | undefined> | undefined;

function restoreInitialWorkspace(): Promise<BootstrapData | undefined> {
  initialWorkspacePromise ??= (async () => {
    const magicToken = takeMagicToken();
    const user = magicToken ? await verifyMagicLink(magicToken) : await fetchSession();
    return user ? fetchBootstrap() : undefined;
  })();
  return initialWorkspacePromise;
}

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapData>();
  const [authState, setAuthState] = useState<"loading" | "signed-out" | "signed-in">("loading");
  const [error, setError] = useState<string>();

  const loadWorkspace = useCallback(async () => {
    setAuthState("loading");
    setError(undefined);
    try {
      const data = await fetchBootstrap();
      setBootstrap(data);
      setAuthState("signed-in");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Office could not be loaded.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const data = await restoreInitialWorkspace();
        if (!active) {
          return;
        }
        if (!data) {
          setAuthState("signed-out");
          return;
        }
        setBootstrap(data);
        setAuthState("signed-in");
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Authentication failed.");
          setAuthState("signed-out");
        }
      }
    };
    void restore();
    return () => {
      active = false;
    };
  }, []);

  if (authState === "signed-out") {
    return <AuthScreen initialError={error} onAuthenticated={loadWorkspace} />;
  }

  if (error) {
    return (
      <main className="load-state error-state">
        <span className="load-mark"><X size={22} /></span>
        <h1>{error}</h1>
        <button onClick={() => window.location.reload()}><RotateCw size={16} />Retry</button>
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
    setAuthState("signed-out");
  };

  const handleSessionExpired = () => {
    setBootstrap(undefined);
    setError("Session expired. Sign in again.");
    setAuthState("signed-out");
  };

  return <Workspace key={bootstrap.currentUserId} initialData={bootstrap} onSignOut={signOut} onSessionExpired={handleSessionExpired} />;
}

function Workspace({
  initialData,
  onSignOut,
  onSessionExpired,
}: {
  initialData: BootstrapData;
  onSignOut: () => Promise<void>;
  onSessionExpired: () => void;
}) {
  const [data, setData] = useState(initialData);
  const [floorId, setFloorId] = useState(initialData.members.find((member) => member.id === initialData.currentUserId)?.floorId ?? initialData.floors[0]!.id);
  const [activePanel, setActivePanel] = useState<WorkspacePanel>(() => window.innerWidth > 980 ? "people" : null);
  const [conversationId, setConversationId] = useState(initialData.conversations[0]!.id);
  const [editingTool, setEditingTool] = useState<LayoutTool | null>(null);
  const [selection, setSelection] = useState<WorldSelection>();
  const [meetingId, setMeetingId] = useState<string>();
  const [gameOpen, setGameOpen] = useState(false);
  const [gameState, setGameState] = useState<GameState>();
  const [muted, setMuted] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall>();
  const [reactions, setReactions] = useState<DisplayReaction[]>([]);
  const [highFives, setHighFives] = useState<DisplayHighFive[]>([]);
  const [reactionAnnouncement, setReactionAnnouncement] = useState("");
  const [incomingKnocks, setIncomingKnocks] = useState<AreaKnock[]>([]);
  const [pendingAreaIds, setPendingAreaIds] = useState<Set<string>>(() => new Set());
  const [grantedAreaIds, setGrantedAreaIds] = useState<Set<string>>(() => new Set());
  const [focusTarget, setFocusTarget] = useState<WorldFocusTarget>();
  const [toast, setToast] = useState<string>();
  const toastTimer = useRef<number | undefined>(undefined);
  const callDismissTimer = useRef<number | undefined>(undefined);
  const reactionTimers = useRef(new Map<string, number>());
  const highFiveTimers = useRef(new Map<string, number>());
  const connectionWasOnline = useRef(false);
  const activeFloorIdRef = useRef(floorId);
  const pendingFloorChange = useRef<{ requestId: string; floorId: string; focusUserId?: string } | undefined>(undefined);
  const pendingKnockRequest = useRef<{ requestId: string; areaId: string } | undefined>(undefined);

  const currentUser = data.members.find((member) => member.id === data.currentUserId)!;
  const canEdit = currentUser.role === "owner" || currentUser.role === "admin";
  const floor = data.floors.find((item) => item.id === floorId) ?? data.floors[0]!;
  const layout = data.layouts.find((item) => item.floorId === floor.id) ?? data.layouts[0]!;
  const allAreas = useMemo(() => data.layouts.flatMap((item) => item.areas), [data.layouts]);
  const currentMeeting = data.meetings.find((meeting) => meeting.id === meetingId);
  const visibleAreaIds = new Set(allAreas.map((area) => area.id));
  const visibleMeetings = data.meetings.filter((meeting) => meeting.location.type === "public" || visibleAreaIds.has(meeting.location.areaId));
  const visibleMeetingIds = new Set(visibleMeetings.map((meeting) => meeting.id));
  const visibleConversations = data.conversations.filter((conversation) => {
    if (conversation.type === "area") {
      return Boolean(conversation.areaId && visibleAreaIds.has(conversation.areaId));
    }
    if (conversation.type === "meeting") {
      return Boolean(conversation.meetingId && visibleMeetingIds.has(conversation.meetingId));
    }
    return true;
  });
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
  }, []);

  const handleRealtimeEvent = useCallback((event: ServerEvent) => {
    if (event.type === "session.ready") {
      const floorChanged = event.floorId !== activeFloorIdRef.current;
      activeFloorIdRef.current = event.floorId;
      if (floorChanged) {
        setFloorId(event.floorId);
        setSelection(undefined);
        setIncomingKnocks([]);
        setPendingAreaIds(new Set());
        setGrantedAreaIds(new Set());
        pendingKnockRequest.current = undefined;
      }
      const pending = pendingFloorChange.current;
      if (pending?.floorId === event.floorId) {
        setFocusTarget(pending.focusUserId ? { userId: pending.focusUserId, requestId: pending.requestId } : undefined);
        pendingFloorChange.current = undefined;
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
      setData((current) => ({ ...current, members: current.members.map((member) => member.id === event.member.id ? event.member : member) }));
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
    } else if (event.type === "area.access_snapshot") {
      setGrantedAreaIds(new Set(event.areaIds));
    } else if (event.type === "area.access_revoked") {
      setGrantedAreaIds((current) => {
        const next = new Set(current);
        next.delete(event.areaId);
        return next;
      });
    } else if (event.type === "area.knock_requested") {
      setIncomingKnocks((current) => current.some((knock) => knock.id === event.knock.id) ? current : [...current, event.knock]);
    } else if (event.type === "area.knock_state") {
      setIncomingKnocks((current) => current.filter((knock) => knock.id !== event.knock.id));
      if (event.knock.requesterUserId === data.currentUserId) {
        if (pendingKnockRequest.current?.areaId === event.knock.areaId && event.state !== "pending") {
          pendingKnockRequest.current = undefined;
        }
        setPendingAreaIds((current) => {
          const next = new Set(current);
          if (event.state === "pending") {
            next.add(event.knock.areaId);
          } else {
            next.delete(event.knock.areaId);
          }
          return next;
        });
        if (event.state === "accepted") {
          setGrantedAreaIds((current) => new Set(current).add(event.knock.areaId));
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
      setMuted(true);
      setCameraOn(false);
      setMeetingId(event.meeting.id);
    } else if (event.type === "meeting.left") {
      setMuted(true);
      setCameraOn(false);
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
    } else if (event.type === "game.state") {
      setGameState(event);
      setGameOpen(true);
    } else if (event.type === "game.completed") {
      setData((current) => ({ ...current, scores: [event.score, ...current.scores] }));
      showToast(`Score saved: ${event.score.score.toLocaleString()}.`);
    } else if (event.type === "layout.conflict") {
      showToast("The layout changed. Try again.");
    } else if (event.type === "command.error") {
      if (event.requestId && pendingFloorChange.current?.requestId === event.requestId) {
        pendingFloorChange.current = undefined;
      }
      if (event.requestId && pendingKnockRequest.current?.requestId === event.requestId) {
        const { areaId } = pendingKnockRequest.current;
        pendingKnockRequest.current = undefined;
        setPendingAreaIds((current) => {
          const next = new Set(current);
          next.delete(areaId);
          return next;
        });
      }
      showToast(event.message);
    }
  }, [activeConversationId, activePanel, data.currentUserId, data.members, displayHighFive, displayReaction, showToast]);

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
    if (callDismissTimer.current) {
      window.clearTimeout(callDismissTimer.current);
      callDismissTimer.current = undefined;
    }
    setMeetingId(undefined);
    setMuted(true);
    setCameraOn(false);
    setGameOpen(false);
    setGameState(undefined);
    setReactions([]);
    setHighFives([]);
    setReactionAnnouncement("");
    for (const timer of reactionTimers.current.values()) {
      window.clearTimeout(timer);
    }
    reactionTimers.current.clear();
    for (const timer of highFiveTimers.current.values()) {
      window.clearTimeout(timer);
    }
    highFiveTimers.current.clear();
    setIncomingKnocks([]);
    setPendingAreaIds(new Set());
    setGrantedAreaIds(new Set());
    setFocusTarget(undefined);
    pendingFloorChange.current = undefined;
    pendingKnockRequest.current = undefined;
  }, [connection]);

  useEffect(() => {
    if (!canEdit && activePanel === "build") {
      setActivePanel(null);
      setEditingTool(null);
    }
  }, [activePanel, canEdit]);

  useEffect(() => {
    setSelection((current) => {
      if (current?.type === "area" && !layout.areas.some((area) => area.id === current.area.id)) {
        return undefined;
      }
      if (current?.type === "object" && !layout.objects.some((object) => object.id === current.object.id)) {
        return undefined;
      }
      return current;
    });
  }, [layout.areas, layout.objects]);

  useEffect(() => {
    if (!meetingId || (currentMeeting && currentMeeting.status !== "ended" && currentMeeting.participantIds.includes(data.currentUserId))) {
      return;
    }
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
  const sendReaction = useCallback((reaction: ReactionKind) => request({
    type: "interaction.react",
    requestId: crypto.randomUUID(),
    reaction,
  }), [request]);
  const knockAtArea = (areaId: string) => {
    if (pendingKnockRequest.current || pendingAreaIds.size > 0) {
      return;
    }
    const knockRequestId = requestId();
    pendingKnockRequest.current = { requestId: knockRequestId, areaId };
    setPendingAreaIds((current) => new Set(current).add(areaId));
    if (!request({ type: "area.knock", requestId: knockRequestId, areaId })) {
      pendingKnockRequest.current = undefined;
      setPendingAreaIds((current) => {
        const next = new Set(current);
        next.delete(areaId);
        return next;
      });
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || gameOpen) {
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
  }, [gameOpen, sendReaction]);

  const visiblePlayers = snapshot?.floorId === floorId ? snapshot.players : [];
  const currentPlayer = visiblePlayers.find((player) => player.userId === data.currentUserId);
  const currentArea = layout.areas.find((area) => area.id === currentPlayer?.areaId);

  const changeFloor = (nextFloorId: string, focusUserId?: string): boolean => {
    const requestedFloorId = pendingFloorChange.current?.floorId ?? activeFloorIdRef.current;
    if (nextFloorId === requestedFloorId) {
      return true;
    }
    const floorRequestId = requestId();
    pendingFloorChange.current = {
      requestId: floorRequestId,
      floorId: nextFloorId,
      ...(focusUserId ? { focusUserId } : {}),
    };
    const sent = request({ type: "floor.change", requestId: floorRequestId, floorId: nextFloorId });
    if (!sent && pendingFloorChange.current?.requestId === floorRequestId) {
      pendingFloorChange.current = undefined;
    }
    return sent;
  };

  const openPanel = (panel: WorkspacePanel) => {
    setActivePanel(panel);
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
    if (member.floorId !== floorId) {
      changeFloor(member.floorId, userId);
      return;
    }
    setFocusTarget({ userId, requestId: requestId() });
  };

  const addInvitation = async (email: string): Promise<boolean> => {
    try {
      const invitation = await inviteMember(data.team.id, email);
      setData((current) => ({
        ...current,
        invitations: current.invitations.some((item) => item.id === invitation.id)
          ? current.invitations
          : [...current.invitations, invitation],
      }));
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
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Invitation could not be revoked.");
    }
  };

  const updateRole = async (memberId: string, role: Exclude<MemberRole, "owner">) => {
    try {
      const member = await changeMemberRole(data.team.id, memberId, role);
      setData((current) => ({ ...current, members: current.members.map((item) => item.id === member.id ? member : item) }));
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Role could not be changed.");
    }
  };

  const joinMeeting = (meeting: Meeting) => {
    setMuted(true);
    setCameraOn(false);
    request({ type: "meeting.join", requestId: requestId(), meetingId: meeting.id });
  };

  const leaveMeeting = () => {
    if (currentMeeting) {
      request({ type: "meeting.leave", requestId: requestId(), meetingId: currentMeeting.id });
    }
    setMeetingId(undefined);
    setMuted(true);
    setCameraOn(false);
  };

  const playGame = (definitionId: string) => {
    if (!request({ type: "game.start", requestId: requestId(), definitionId: definitionId as "game-stack" })) {
      return;
    }
    setGameState(undefined);
    setGameOpen(true);
  };

  const closeGame = () => {
    request({ type: "game.end", requestId: requestId() });
    setGameOpen(false);
    setGameState(undefined);
  };

  const signOut = async () => {
    try {
      await onSignOut();
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Could not sign out.");
    }
  };

  const selectedArea = selection?.type === "area"
    ? layout.areas.find((area) => area.id === selection.area.id)
    : undefined;
  const selectedObject = selection?.type === "object"
    ? layout.objects.find((object) => object.id === selection.object.id)
    : undefined;
  const hasVisibleSelection = Boolean(selectedArea || selectedObject);
  const selectedMeeting = selectedArea
    ? data.meetings.find((meeting) => meeting.location.type === "room" && meeting.location.areaId === selectedArea.id && meeting.status !== "ended")
    : undefined;
  const selectedObjectGame = selectedObject?.type === "arcade" && selectedObject.id === data.miniGames[0]?.objectId;
  const selectedObjectPortal = selectedObject?.type === "portal";
  const hasAreaAccess = (area: Area) => !area.locked
    || Boolean(area.memberIds?.includes(data.currentUserId))
    || grantedAreaIds.has(area.id)
    || (area.visibility === "members" && canEdit);
  const nearbyDoor = currentPlayer
    ? layout.areas
      .filter((area) => area.locked && currentArea?.id !== area.id)
      .flatMap((area) => area.doors.map((door) => {
        const position = getAreaDoorPosition(area, door);
        return { area, door, distance: Math.hypot(currentPlayer.x - position.x, currentPlayer.y - position.y) };
      }))
      .filter((candidate) => candidate.distance <= 84)
      .sort((left, right) => left.distance - right.distance)[0]
    : undefined;
  const selectedAreaNeedsAccess = selectedArea?.locked && !hasAreaAccess(selectedArea);
  const meetingConversation = currentMeeting
    ? data.conversations.find((conversation) => conversation.meetingId === currentMeeting.id && conversation.type === "meeting")
    : undefined;
  const callPeer = activeCall ? data.members.find((member) => member.id === activeCall.peerUserId) : undefined;
  const floorReactions = reactions.filter((reaction) => reaction.scope.type === "floor" && reaction.scope.floorId === floorId);
  const meetingReactions = currentMeeting
    ? reactions.filter((reaction) => reaction.scope.type === "meeting" && reaction.scope.meetingId === currentMeeting.id)
    : [];
  const floorHighFives = highFives.filter((highFive) => highFive.floorId === floorId);
  const visibleIncomingKnocks = incomingKnocks.flatMap((knock) => {
    const area = allAreas.find((item) => item.id === knock.areaId);
    const requester = data.members.find((member) => member.id === knock.requesterUserId);
    return area && requester ? [{ knock, area, requester }] : [];
  });

  return (
    <main className="workspace-shell">
      <NavRail activePanel={activePanel} canEdit={canEdit} currentUser={currentUser} onChange={openPanel} onSignOut={signOut} />
      <section className="workspace-main">
        <TopBar
          officeName={data.office.name}
          floors={data.floors}
          floorId={floorId}
          areaName={currentArea?.name}
          connection={connection}
          onFloorChange={changeFloor}
        />
        <WorldCanvas
          floor={floor}
          layout={layout}
          members={data.members}
          meetings={visibleMeetings}
          players={visiblePlayers}
          reactions={floorReactions}
          highFives={floorHighFives}
          currentUserId={data.currentUserId}
          editing={activePanel === "build"}
          editingTool={editingTool}
          inputEnabled={!gameOpen && !currentMeeting}
          focusTarget={focusTarget}
          onDestination={(x, y) => request({ type: "movement.set_destination", requestId: requestId(), x, y })}
          onPlayerApproach={(targetUserId) => request({ type: "movement.approach_user", requestId: requestId(), targetUserId })}
          onEdit={(x, y) => editingTool && request({ type: "layout.apply", requestId: requestId(), baseRevision: layout.revision, tool: editingTool, x, y })}
          onAreaSelect={(area, x, y) => {
            setSelection({ type: "area", area });
            if (hasAreaAccess(area)) {
              request({ type: "movement.set_destination", requestId: requestId(), x, y });
            }
          }}
          onObjectSelect={(object) => setSelection({ type: "object", object })}
          onDirectionalInput={(sequence, dx, dy) => request({ type: "movement.input", sequence, dx, dy })}
        />

        {(hasVisibleSelection || nearbyDoor) && <div className="world-actions">
          {hasVisibleSelection && (
            <div className="context-action" role="region" aria-label="Selected place">
            <span className="context-swatch" style={{ background: selectedArea?.color ?? selectedObject?.color }} />
            <div>
              <strong>{selectedArea?.name ?? selectedObject?.label ?? selectedObject?.type}</strong>
              <span>{selectedArea?.type ?? selectedObject?.type}</span>
            </div>
            {selectedMeeting && !selectedAreaNeedsAccess && <button className="primary-button" onClick={() => joinMeeting(selectedMeeting)}><Video size={16} />Join</button>}
            {selectedArea && canEdit && (selectedArea.type === "private" || selectedArea.type === "meeting") && (
              <button className="secondary-button" onClick={() => request({
                type: "area.update_settings",
                requestId: requestId(),
                areaId: selectedArea.id,
                settings: { type: selectedArea.type as AreaSettings["type"], locked: !selectedArea.locked, visibility: selectedArea.visibility },
              })}>
                {selectedArea.locked ? <Unlock size={16} /> : <LockKeyhole size={16} />}
                {selectedArea.locked ? "Unlock" : "Lock"}
              </button>
            )}
            {selectedObjectGame && <button className="primary-button" onClick={() => playGame("game-stack")}><Play size={16} fill="currentColor" />Play</button>}
            {selectedObjectPortal && (
              <button className="primary-button" onClick={() => changeFloor(floorId === "floor-studio" ? "floor-rooftop" : "floor-studio")}>
                <ArrowRight size={16} />Go
              </button>
            )}
            <IconButton label="Clear selection" icon={X} onClick={() => setSelection(undefined)} />
            </div>
          )}

          {nearbyDoor && (
            <div className="door-interaction" role="region" aria-label={`${nearbyDoor.area.name} door`}>
            <LockKeyhole size={16} />
            <strong>{nearbyDoor.area.name}</strong>
            {hasAreaAccess(nearbyDoor.area) ? (
              <button
                className="primary-button"
                onClick={() => {
                  const destination = getAreaDoorPosition(nearbyDoor.area, nearbyDoor.door, "inside");
                  request({ type: "movement.set_destination", requestId: requestId(), ...destination });
                }}
              >
                <DoorOpen size={16} />Enter
              </button>
            ) : (
              <button
                className="secondary-button"
                disabled={pendingAreaIds.size > 0}
                onClick={() => knockAtArea(nearbyDoor.area.id)}
              >
                <Hand size={16} />{pendingAreaIds.size > 0 ? "Waiting" : "Knock"}
              </button>
            )}
            </div>
          )}
        </div>}

        <Dock
          currentUser={currentUser}
          muted={muted}
          cameraOn={cameraOn}
          onMutedChange={setMuted}
          onCameraChange={setCameraOn}
          onAvailabilityChange={(availability) => request({ type: "presence.set_availability", requestId: requestId(), availability })}
          onReact={sendReaction}
          reactionsDisabled={connection !== "online"}
        />

        {activeCall && (activeCall.state === "ringing" || activeCall.state === "connected") && (
          <CallNotice
            call={activeCall}
            peer={callPeer}
            onRespond={(callId, accept) => request({ type: "call.respond", requestId: requestId(), callId, accept })}
            onEnd={(callId) => request({ type: "call.end", requestId: requestId(), callId })}
          />
        )}

        {visibleIncomingKnocks.length > 0 && (
          <div className={`knock-stack ${activeCall && (activeCall.state === "ringing" || activeCall.state === "connected") ? "with-call" : ""}`}>
            {visibleIncomingKnocks.map(({ knock, area, requester }) => (
              <AreaKnockNotice
                key={knock.id}
                knock={knock}
                area={area}
                requester={requester}
                onRespond={(knockId, accept) => request({ type: "area.knock_respond", requestId: requestId(), knockId, accept })}
              />
            ))}
          </div>
        )}

        {toast && <div className="toast" role="status">{toast}</div>}
        <div className="sr-only" role="status">{reactionAnnouncement}</div>
      </section>

      {activePanel === "people" && (
        <PeoplePanel
          members={data.members}
          invitations={data.invitations}
          currentUser={currentUser}
          canEdit={canEdit}
          onClose={() => setActivePanel(null)}
          onWave={(targetUserId) => request({ type: "interaction.wave", requestId: requestId(), targetUserId })}
          onMessage={messageMember}
          onCall={(targetUserId) => request({ type: "call.request", requestId: requestId(), targetUserId })}
          onLocate={locateMember}
          onInvite={addInvitation}
          onRevokeInvite={removeInvitation}
          onRoleChange={updateRole}
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
        <MeetingsPanel meetings={visibleMeetings} areas={allAreas} floors={data.floors} members={data.members} onJoin={joinMeeting} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "games" && (
        <GamesPanel definitions={data.miniGames} scores={data.scores} members={data.members} onPlay={playGame} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "build" && (
        <BuildPanel
          layout={layout}
          tool={editingTool}
          onToolChange={setEditingTool}
          onUpdateArea={(areaId, settings: AreaSettings) => request({ type: "area.update_settings", requestId: requestId(), areaId, settings })}
          onClose={() => { setActivePanel(null); setEditingTool(null); }}
        />
      )}

      {currentMeeting && (
        <MeetingOverlay
          meeting={currentMeeting}
          members={data.members}
          currentUserId={data.currentUserId}
          messages={meetingConversation ? data.messages.filter((message) => message.conversationId === meetingConversation.id) : []}
          muted={muted}
          cameraOn={cameraOn}
          reactions={meetingReactions}
          onMutedChange={setMuted}
          onCameraChange={setCameraOn}
          onReact={sendReaction}
          onSendMessage={(body) => Boolean(meetingConversation && sendMessage(meetingConversation.id, body))}
          onLeave={leaveMeeting}
        />
      )}
      {gameOpen && (
        <StackGame
          state={gameState}
          onCommand={(command) => request({ type: "game.command", requestId: requestId(), command })}
          onClose={closeGame}
        />
      )}
    </main>
  );
}

function takeMagicToken(): string | undefined {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const token = parameters.get("magic") ?? undefined;
  if (window.location.hash) {
    window.history.replaceState(null, "", token ? "/" : `${window.location.pathname}${window.location.search}`);
  }
  return token;
}
