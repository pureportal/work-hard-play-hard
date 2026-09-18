import { createPublicEconomy } from "@workhard/shared";
import { createOrganisation } from "@workhard/shared";
import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CORPORATE_IDENTITY } from "@workhard/shared";
import type { BootstrapData, ClientCommand, MeetingMediaSession, ServerEvent, WorldSnapshot } from "@workhard/shared";
import { Workspace } from "./App";
import type { WorldCanvasProps } from "./components/WorldCanvas";
import { createTestEconomy, createTestGameSettings, createTestKidnappingConfiguration } from "./test-fixtures";

const realtime = vi.hoisted(() => ({
  handler: undefined as ((event: ServerEvent) => void) | undefined,
  send: vi.fn<(command: ClientCommand) => boolean>(),
  snapshot: undefined as WorldSnapshot | undefined,
  connection: "online" as "online" | "offline",
}));

vi.mock("./hooks/useRealtime", () => ({
  useRealtime: ({ onEvent }: { onEvent: (event: ServerEvent) => void }) => {
    realtime.handler = onEvent;
    return { connection: realtime.connection, snapshot: realtime.snapshot, send: realtime.send };
  },
}));

vi.mock("./components/WorldCanvasLoader", () => ({
  WorldCanvas: ({ inputEnabled, onPlayerSelect, onObjectSelect, layout, activeInteraction }: WorldCanvasProps) => (
    <div data-testid="world-input" data-enabled={inputEnabled} data-active-area={JSON.stringify(activeInteraction)}>
      <button onClick={() => onPlayerSelect("user-leo", { x: 0, y: 0 })}>Select Leo</button>
      {layout.objects.map((object) => <button key={object.id} onClick={() => onObjectSelect(object, undefined, { x: 0, y: 0 })}>Select {object.id}</button>)}
    </div>
  ),
}));

const meeting = {
  id: "meeting-review",
  title: "Design review",
  startsAt: "2026-09-02T09:00:00.000Z",
  durationMinutes: 30,
  status: "live" as const,
  participantIds: [] as string[],
  location: { type: "room" as const, roomId: "room-review" },
};

const mediaSession: MeetingMediaSession = { sessionId: "meeting-session", meetingId: meeting.id, hostUserId: "user-maya", locked: false, iceServers: [],
  participants: [{ sessionId: "meeting-session", userId: "user-maya", microphone: false, camera: false, screen: false }] };

beforeEach(() => { vi.stubGlobal("RTCPeerConnection", vi.fn()); });

const workspace: BootstrapData = {
  currentUserId: "user-maya",
  corporateIdentity: DEFAULT_CORPORATE_IDENTITY,
    organisation: createOrganisation(),
    publicEconomy: createPublicEconomy(),
  team: { id: "team", name: "Northstar", slug: "northstar", accent: "#6c5ce7" },
  office: { id: "office", teamId: "team", name: "Studio" },
  floors: [{
    id: "floor",
    officeId: "office",
    name: "Main",
    level: 1,
    width: 800,
    height: 600,
    spawn: { x: 100, y: 100 },
    background: "#f5f2ed",
  }],
  members: [{
    id: "user-maya",
    name: "Maya Chen",
    initials: "MC", character: { ...DEFAULT_CHARACTER_APPEARANCE },
    email: "maya@example.com",
    title: "Product Lead",
    role: "owner",
    permissions: ["manage_members"],
    color: "#ff7a66",
    availability: "available",
    online: true,
    floorId: "floor",
  }, {
    id: "user-leo",
    name: "Leo Martins",
    initials: "LM", character: { ...DEFAULT_CHARACTER_APPEARANCE },
    email: "leo@example.com",
    title: "Engineer",
    role: "member",
    permissions: [],
    color: "#287fc1",
    availability: "available",
    online: true,
    floorId: "floor",
  }],
  layouts: [{
    floorId: "floor",
    revision: 1,
    walls: [],
    openings: [],
    tiles: [],
    objects: [],
    rooms: [{
      id: "room-review",
      floorId: "floor",
      name: "Review",
      color: "#dfe8ff",
      capacity: 8,
      bounds: { x: 200, y: 200, width: 200, height: 160 },
      footprint: [{ x: 200, y: 200, width: 200, height: 160 }],
      boundary: [],
      doorIds: [],
      windowIds: [],
      privateEligible: true,
      access: { mode: "open", assignedPersonIds: [], knockable: false },
    }],
  }],
  miniGames: [],
  scores: [],
  gameStatistics: [],
  economy: createTestEconomy(),
  gameSettings: createTestGameSettings(),
  kidnapping: createTestKidnappingConfiguration(),
  invitations: [],
  meetings: [meeting],
  conversations: [
    { id: "team-chat", name: "Team", type: "team", unread: 0 },
    { id: "meeting-chat", name: "Design review", type: "meeting", meetingId: meeting.id, unread: 0 },
  ],
  messages: [],
};

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
  realtime.snapshot = {
    type: "world.snapshot",
    tick: 1,
    floorId: "floor",
    layoutRevision: 1,
    players: [{
      userId: "user-maya",
      floorId: "floor",
      roomId: "room-review",
      x: 260,
      y: 260,
      facing: "down",
      availability: "available",
      connected: true,
    }, {
      userId: "user-leo",
      floorId: "floor",
      x: 420,
      y: 260,
      facing: "left",
      availability: "available",
      connected: true,
    }],
  };
  realtime.send.mockReset();
  realtime.send.mockReturnValue(true);
  realtime.connection = "online";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  realtime.handler = undefined;
  vi.useRealTimers();
});

describe("meeting area entry", () => {
  it("keeps an invitation when cancelling a meeting switch and uses it on retry", () => {
    const data = structuredClone(workspace);
    const nextMeeting = { ...meeting, id: "planning", title: "Planning" };
    data.meetings.push(nextMeeting);
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Open" })[0]!);
    emitJoined();
    const invitation = { id: "invite-planning", meetingId: nextMeeting.id, inviterUserId: "user-leo", targetUserId: "user-maya",
      expiresAt: new Date(Date.now() + 60_000).toISOString() };
    act(() => realtime.handler?.({ type: "meeting.invited", invitation }));
    fireEvent.click(within(screen.getByRole("complementary", { name: "Meeting invitation" })).getByRole("button", { name: "Open" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Open Planning?" })).getByRole("button", { name: "Cancel" }));
    const notice = screen.getByRole("complementary", { name: "Meeting invitation" });
    expect(screen.getByRole("dialog", { name: meeting.title })).toBeTruthy();
    expect(meetingJoinCommands()).toHaveLength(1);
    fireEvent.click(within(notice).getByRole("button", { name: "Open" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Open Planning?" })).getByRole("button", { name: "Open" }));
    expect(meetingJoinCommands().at(-1)).toMatchObject({ meetingId: nextMeeting.id, invitationId: invitation.id });
    expect(screen.queryByRole("complementary", { name: "Meeting invitation" })).toBeNull();
  });

  it("shows the next invitation when the first meeting no longer exists", () => {
    renderWorkspace();
    const invitation = { id: "unavailable", meetingId: "removed-meeting", inviterUserId: "user-leo", targetUserId: "user-maya",
      expiresAt: new Date(Date.now() + 60_000).toISOString() };
    act(() => {
      realtime.handler?.({ type: "meeting.invited", invitation });
      realtime.handler?.({ type: "meeting.invited", invitation: { ...invitation, id: "available", meetingId: meeting.id } });
    });
    const notice = screen.getByRole("complementary", { name: "Meeting invitation" });
    fireEvent.click(within(notice).getByRole("button", { name: "Open" }));
    expect(meetingJoinCommands().at(-1)).toMatchObject({ meetingId: meeting.id, invitationId: "available" });
  });

  it("offers an idle room meeting on entry after its settings change", () => {
    const data = structuredClone(workspace);
    data.meetings = [];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Open Small" })).toBeNull();
    const roomMeeting = { id: "room-call", title: "Review", status: "idle" as const, participantIds: [], location: meeting.location };
    const layout = structuredClone(data.layouts[0]!);
    layout.revision += 1;
    layout.rooms[0]!.meetingRoom = true;
    act(() => {
      realtime.handler!({ type: "layout.updated", layout });
      realtime.handler!({ type: "workspace.access_updated", access: { meetings: [roomMeeting], conversations: data.conversations, messages: [], invitations: [] } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Small" }));
    expect(realtime.send).toHaveBeenLastCalledWith(expect.objectContaining({ type: "meeting.join", meetingId: roomMeeting.id }));
  });

  it("opens and plays each overlapping Falling Blocks cabinet by its saved object ID", async () => {
    const data = structuredClone(workspace);
    data.layouts[0]!.objects = [
      { id: "object-tetris", floorId: "floor", assetId: "equipment-falling-blocks", x: 180, y: 180, rotation: 0, variantId: "graphite" },
      { id: "placed-blocks", floorId: "floor", assetId: "equipment-falling-blocks", x: 280, y: 180, rotation: 0, variantId: "graphite" },
    ];
    data.miniGames = [{ id: "game-falling-blocks", assetId: "equipment-falling-blocks", name: "Falling Blocks", accent: "#6757e8" }];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Select object-tetris" }));
    expect(screen.getByRole("button", { name: "Join lobby" })).toBeTruthy();

    act(() => {
      for (const object of data.layouts[0]!.objects) realtime.handler!({ type: "game.lobby_updated", lobby: {
        definitionId: "game-falling-blocks", objectId: object.id, floorId: "floor", capacity: 8, participantIds: ["user-maya"],
      } });
    });
    const picker = screen.getByRole("combobox", { name: "Active interaction" });
    expect(within(picker).getAllByRole("option", { name: "Falling Blocks" })).toHaveLength(2);
    for (const object of data.layouts[0]!.objects) {
      fireEvent.click(screen.getByRole("button", { name: `Select ${object.id}` }));
      expect((picker as HTMLSelectElement).value).toBe(object.id);
      expect(JSON.parse(screen.getByTestId("world-input").dataset.activeArea!)).toMatchObject({ x: object.x + 48 });
      fireEvent.click(within(screen.getByRole("complementary", { name: "Falling Blocks lobby" })).getByRole("button", { name: "Play" }));
      expect(realtime.send).toHaveBeenLastCalledWith(expect.objectContaining({
        type: "game.start", definitionId: "game-falling-blocks", objectId: object.id, solo: true,
      }));
      const command = realtime.send.mock.calls.at(-1)![0] as Extract<ClientCommand, { type: "game.start" }>;
      act(() => realtime.handler!({ type: "command.ack", requestId: command.requestId }));
    }

    act(() => realtime.handler!({ type: "game.round_started", round: {
      id: "round", definitionId: "game-falling-blocks", objectId: "placed-blocks", floorId: "floor", startedAt: new Date().toISOString(), status: "playing",
      participants: [{ userId: "user-maya", status: "playing", score: 0, lines: 0, level: 1 }],
    } }));
    expect(await screen.findByRole("dialog", { name: "Falling Blocks" })).toBeTruthy();
    expect(screen.getByTestId("world-input").dataset.enabled).toBe("false");
  });

  it("switches between overlapping games, a meeting, and nearby chat and highlights the chosen area", () => {
    const data = structuredClone(workspace);
    data.layouts[0]!.objects = [
      { id: "blocks", floorId: "floor", assetId: "equipment-falling-blocks", x: 180, y: 180, rotation: 0, variantId: "graphite" },
      { id: "toe", floorId: "floor", assetId: "equipment-tic-tac-toe", x: 300, y: 180, rotation: 0, variantId: "graphite" },
    ];
    data.miniGames = [
      { id: "game-falling-blocks", assetId: "equipment-falling-blocks", name: "Falling Blocks", accent: "#6757e8" },
      { id: "game-tic-tac-toe", assetId: "equipment-tic-tac-toe", name: "Tic-Tac-Toe", accent: "#6757e8" },
    ];
    realtime.snapshot!.players[1]!.x = 290;
    realtime.snapshot!.players[1]!.roomId = "room-review";
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    act(() => {
      for (const game of data.miniGames) realtime.handler!({ type: "game.lobby_updated", lobby: {
        definitionId: game.id, objectId: data.layouts[0]!.objects.find((object) => object.assetId === game.assetId)!.id, floorId: "floor", capacity: 2, participantIds: ["user-maya"],
      } });
    });
    const picker = screen.getByRole("combobox", { name: "Active interaction" });
    expect(within(picker).getAllByRole("option")).toHaveLength(4);
    fireEvent.change(picker, { target: { value: "blocks" } });
    expect(screen.getByRole("complementary", { name: "Falling Blocks lobby" })).toBeTruthy();
    expect(screen.getByTestId("world-input").dataset.activeArea).toContain('"radius":124');
    expect(screen.queryByRole("dialog", { name: "Falling Blocks" })).toBeNull();
    fireEvent.change(picker, { target: { value: "toe" } });
    expect(screen.getByRole("complementary", { name: "Tic-Tac-Toe lobby" })).toBeTruthy();
    expect(screen.getByTestId("world-input").dataset.activeArea).toContain('"x":348');
    fireEvent.change(picker, { target: { value: meeting.id } });
    expect(screen.getByRole("button", { name: "Open Small" })).toBeTruthy();
    expect(screen.getByTestId("world-input").dataset.activeArea).toContain('"type":"rect"');
    fireEvent.change(picker, { target: { value: "user-leo" } });
    expect(within(screen.getByRole("region", { name: "Nearby actions" })).getByRole("button", { name: "Chat" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next interaction" }));
    expect((picker as HTMLSelectElement).value).not.toBe("user-leo");
  });
  it("shows both actions without opening a chat or meeting window", () => {
    renderWorkspace();

    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Small" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".chat-panel, .meeting-chat")).toBeNull();

    emitJoined();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores an unsolicited leave event without changing device choices", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream),
      },
    });
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    await act(async () => Promise.resolve());

    act(() => realtime.handler?.({ type: "meeting.left", meetingId: meeting.id, sessionId: "stale-session" }));

    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the full call only after Open is selected", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expectMeetingJoinRequest();
    expect(screen.queryByLabelText(`${meeting.title} meeting`)).toBeNull();
    emitJoined();

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.classList.contains("meeting-overlay-small")).toBe(false);
    expect(document.querySelector(".meeting-backdrop")).toBeTruthy();
    expect(screen.getByTestId("world-input").getAttribute("data-enabled")).toBe("false");
  });

  it("opens the floating call only after Open Small is selected", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Open Small" }));
    expectMeetingJoinRequest();
    expect(screen.queryByLabelText(`${meeting.title} meeting`)).toBeNull();
    emitJoined();

    const dialog = screen.getByRole("dialog");
    expect(dialog.classList.contains("meeting-overlay-small")).toBe(true);
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect(document.querySelector(".meeting-backdrop")).toBeNull();
    expect(screen.getByTestId("world-input").getAttribute("data-enabled")).toBe("true");
  });

  it("closes the action prompt, prevents duplicate joins, and restores it when opening fails", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream),
      },
    });
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    await act(async () => Promise.resolve());

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.queryByLabelText(`${meeting.title} meeting`)).toBeNull();
    expect(meetingJoinCommands()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy();

    const command = meetingJoinCommands()[0]!;
    act(() => realtime.handler?.({
      type: "command.error",
      requestId: command.requestId,
      code: "MEETING_NOT_FOUND",
      message: "That meeting is no longer available.",
    }));

    expect((screen.getByRole("button", { name: "Open" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByLabelText(`${meeting.title} meeting`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mute" })).toBeTruthy();
  });

  it("requires confirmation before a meeting ends an active direct call", () => {
    renderWorkspace();
    act(() => realtime.handler?.({
      type: "call.state",
      callId: "call-one",
      peerUserId: "user-leo",
      direction: "outgoing",
      state: "accepted",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: `Open ${meeting.title}?` });
    expect(screen.queryByLabelText(`${meeting.title} meeting`)).toBeNull();
    expect(within(dialog).getByText("This will end your call with Leo Martins.")).toBeTruthy();
    expect(meetingJoinCommands()).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Open" }));
    expect(meetingJoinCommands()).toHaveLength(1);
    expect(screen.getByText("Accepted")).toBeTruthy();
  });

  it("keeps the selected small view explicit in the call-switch confirmation", () => {
    renderWorkspace();
    act(() => realtime.handler?.({
      type: "call.state",
      callId: "call-one",
      peerUserId: "user-leo",
      direction: "outgoing",
      state: "accepted",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Open Small" }));
    const dialog = screen.getByRole("dialog", { name: `Open ${meeting.title}?` });
    fireEvent.click(within(dialog).getByRole("button", { name: "Open Small" }));

    expect(meetingJoinCommands()).toHaveLength(1);
    emitJoined();
    expect(screen.getByRole("dialog", { name: meeting.title }).classList.contains("meeting-overlay-small")).toBe(true);
  });

  it("moves between small and full views without leaving the meeting", () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open Small" }));
    emitJoined();

    fireEvent.click(screen.getByRole("button", { name: "Expand meeting" }));
    expect(screen.getByTestId("world-input").getAttribute("data-enabled")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Minimize meeting" }));
    expect(screen.getByTestId("world-input").getAttribute("data-enabled")).toBe("true");
    expect(realtime.send.mock.calls.filter(([command]) => command.type === "meeting.leave")).toHaveLength(0);
  });

  it("keeps the meeting open until leaving is acknowledged", () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    emitJoined();

    fireEvent.click(screen.getByRole("button", { name: "Leave meeting" }));
    expect(screen.getByRole("dialog", { name: meeting.title })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Leaving meeting" }) as HTMLButtonElement).disabled).toBe(true);

    act(() => realtime.handler?.({ type: "meeting.left", meetingId: meeting.id, sessionId: mediaSession.sessionId, requestId: meetingLeaveCommands()[0]!.requestId }));
    expect(screen.queryByRole("dialog", { name: meeting.title })).toBeNull();
  });

  it("preserves device choices until leaving succeeds", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream),
      },
    });
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    emitJoined();
    const meetingDialog = screen.getByRole("dialog", { name: meeting.title });
    fireEvent.click(within(meetingDialog).getByRole("button", { name: "Unmute" }));

    fireEvent.click(screen.getByRole("button", { name: "Leave meeting" }));
    expect((within(meetingDialog).getByRole("button", { name: "Mute" }) as HTMLButtonElement).disabled).toBe(true);
    const command = meetingLeaveCommands()[0]!;

    act(() => realtime.handler?.({
      type: "command.error",
      requestId: command.requestId,
      code: "MEETING_NOT_JOINED",
      message: "That meeting could not be left.",
    }));

    expect((within(meetingDialog).getByRole("button", { name: "Mute" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("dialog", { name: meeting.title })).toBeTruthy();
  });

  it("ignores duplicate join acknowledgements and stale meeting updates while capturing", async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    emitJoined();
    fireEvent.click(within(screen.getByRole("dialog", { name: meeting.title })).getByRole("button", { name: "Unmute" }));
    await act(async () => Promise.resolve());
    emitJoined();
    expect(meetingLeaveCommands()).toHaveLength(0);
    act(() => realtime.handler?.({ type: "meeting.updated", meeting: { ...meeting, status: "ended", participantIds: [] } }));
    expect(within(screen.getByRole("dialog", { name: meeting.title })).getByRole("button", { name: "Mute" })).toBeTruthy();
    expect(stop).not.toHaveBeenCalled();
  });

  it("requires the matching session, meeting and leave request before stopping media", async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    emitJoined();
    fireEvent.click(within(screen.getByRole("dialog", { name: meeting.title })).getByRole("button", { name: "Unmute" }));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "Leave meeting" }));
    const command = meetingLeaveCommands()[0]!;
    for (const event of [
      { sessionId: "old-session", meetingId: meeting.id, requestId: command.requestId },
      { sessionId: mediaSession.sessionId, meetingId: "other-meeting", requestId: command.requestId },
      { sessionId: mediaSession.sessionId, meetingId: meeting.id, requestId: "other-request" },
    ]) act(() => realtime.handler?.({ type: "meeting.left", ...event }));
    expect(stop).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Leaving meeting" })).toBeTruthy();
    act(() => realtime.handler?.({ type: "meeting.left", sessionId: mediaSession.sessionId, meetingId: meeting.id, requestId: command.requestId }));
    expect(stop).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: meeting.title })).toBeNull();
  });

  it("restores the entry action after a timeout and releases a late joined session without opening it", () => {
    vi.useFakeTimers();
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();
    emitJoined();
    expect(screen.queryByRole("dialog", { name: meeting.title })).toBeNull();
    expect(meetingLeaveCommands().at(-1)).toMatchObject({ meetingId: meeting.id, sessionId: mediaSession.sessionId });
  });

  it("releases capture on disconnect and waits for an explicit open after reconnecting", async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
    const props = { initialData: structuredClone(workspace), onSignOut: vi.fn(), onSessionExpired: vi.fn() };
    const view = render(<Workspace {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    emitJoined();
    fireEvent.click(within(screen.getByRole("dialog", { name: meeting.title })).getByRole("button", { name: "Unmute" }));
    await act(async () => Promise.resolve());
    realtime.connection = "offline";
    view.rerender(<Workspace {...props} />);
    expect(stop).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: meeting.title })).toBeNull();
    realtime.connection = "online";
    view.rerender(<Workspace {...props} />);
    emitJoined();
    expect(screen.queryByRole("dialog", { name: meeting.title })).toBeNull();
    expect(meetingJoinCommands()).toHaveLength(1);
  });

  it("opens a nearby board alongside the meeting without restarting capture or joining again", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    const data = structuredClone(workspace);
    data.layouts[0]!.objects.push({ id: "meeting-board", assetId: "equipment-whiteboard", variantId: "graphite", floorId: "floor", x: 240, y: 220, rotation: 0,
      label: "Review board", workState: { kind: "whiteboard", revision: 0, document: { text: "Notes", cards: [] } } });
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    emitJoined();
    fireEvent.click(within(screen.getByRole("dialog", { name: meeting.title })).getByRole("button", { name: "Unmute" }));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "Meeting settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Review board" }));
    expect((await screen.findByRole("dialog", { name: "Review board" })).getAttribute("aria-modal")).toBeNull();
    const call = screen.getByRole("dialog", { name: meeting.title });
    expect(call.classList.contains("meeting-overlay-small")).toBe(true);
    expect(within(call).getByRole("button", { name: "Mute" })).toBeTruthy();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close board" }));
    expect(screen.queryByRole("dialog", { name: "Review board" })).toBeNull();
    expect(meetingJoinCommands()).toHaveLength(1);
    expect(meetingLeaveCommands()).toHaveLength(0);
  });

  it("joins an accepted call before enabling devices and ignores repeated acceptance", async () => {
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => ({
      getTracks: () => [{ kind: constraints.audio ? "audio" : "video", stop: vi.fn() }],
    }) as unknown as MediaStream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    renderWorkspace();
    const call = { type: "call.state" as const, callId: "invitation", peerUserId: "user-leo", direction: "incoming" as const };
    act(() => realtime.handler?.({ ...call, state: "ringing" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept call from Leo Martins" }));
    expect(getUserMedia).not.toHaveBeenCalled();
    act(() => realtime.handler?.({ ...call, state: "accepted" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "proximity.set_media", microphone: false, camera: false }));
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn camera on" }));
    await waitFor(() => expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "proximity.set_media", microphone: true, camera: true })));
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn camera off" }));
    act(() => realtime.handler?.({ ...call, state: "accepted" }));
    expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Open call" })).toBeTruthy();
    expect(realtime.send.mock.calls.some(([command]) => command.type === "proximity.leave")).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it.each(["NotFoundError", "NotAllowedError"])("keeps a nearby call joined after %s and enables a microphone later", async (errorName) => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException("No capture", errorName));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    realtime.snapshot!.players[1]!.x = 290;
    realtime.snapshot!.players[1]!.roomId = "room-review";
    renderWorkspace();
    fireEvent.change(screen.getByRole("combobox", { name: "Active interaction" }), { target: { value: "user-leo" } });
    fireEvent.click(within(screen.getByRole("region", { name: "Nearby actions" })).getByRole("button", { name: "Call" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "call.request", targetUserId: "user-leo" }));
    expect(getUserMedia).not.toHaveBeenCalled();
    const call = { type: "call.state" as const, callId: "nearby", peerUserId: "user-leo", direction: "outgoing" as const };
    act(() => realtime.handler?.({ ...call, state: "ringing" }));
    act(() => realtime.handler?.({ ...call, state: "accepted" }));
    expect(screen.getByRole("region", { name: "Open call" })).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
    const sessionId = realtime.send.mock.calls.map(([command]) => command).find((command) => command.type === "proximity.set_media")!.sessionId;
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn camera on" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Turn camera on" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Open call" })).toBeTruthy();
    expect(realtime.send.mock.calls.some(([command]) => command.type === "proximity.leave")).toBe(false);
    getUserMedia.mockResolvedValue({ getTracks: () => [{ kind: "audio", stop: vi.fn() }] });
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    await waitFor(() => expect(realtime.send).toHaveBeenLastCalledWith(expect.objectContaining({ type: "proximity.set_media", sessionId, microphone: true, camera: false })));
    fireEvent.click(screen.getByRole("button", { name: "Leave conversation" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "proximity.leave", sessionId }));
  });

  it("does not enable devices for an unsolicited call acceptance", () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    renderWorkspace();
    act(() => realtime.handler?.({ type: "call.state", callId: "stale", peerUserId: "user-leo", direction: "outgoing", state: "accepted" }));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy();
  });

  it("keeps open calls stopped if an invitation is accepted after entering build mode", () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    renderWorkspace();
    const call = { type: "call.state" as const, callId: "late", peerUserId: "user-leo", direction: "outgoing" as const };
    act(() => realtime.handler?.({ ...call, state: "ringing" }));
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    act(() => realtime.handler?.({ ...call, state: "accepted" }));
    expect(screen.queryByRole("region", { name: "Open call" })).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("keeps devices off if an accepted invitation ends before media starts", () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    renderWorkspace();
    const call = { type: "call.state" as const, callId: "brief", peerUserId: "user-leo", direction: "incoming" as const };
    act(() => realtime.handler?.({ ...call, state: "ringing" }));
    fireEvent.click(screen.getByRole("button", { name: "Accept call from Leo Martins" }));
    act(() => {
      realtime.handler?.({ ...call, state: "accepted" });
      realtime.handler?.({ ...call, state: "ended" });
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Turn camera on" })).toBeTruthy();
  });

  it("rings a nearby person even when a local media session is already open", async () => {
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("Missing microphone", "NotFoundError")) } });
    realtime.snapshot!.players[1]!.x = 290;
    realtime.snapshot!.players[1]!.roomId = "room-review";
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy());
    expect(screen.getByRole("region", { name: "Open call" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Active interaction" }), { target: { value: "user-leo" } });
    fireEvent.click(within(screen.getByRole("region", { name: "Nearby actions" })).getByRole("button", { name: "Call" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "call.request", targetUserId: "user-leo" }));
    expect(screen.getByText("Starting call…")).toBeTruthy();
  });

  it("shows call progress, preserves a rejection, and retries from the error", () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "People" }));
    fireEvent.click(screen.getByRole("button", { name: "Leo Martins" }));
    const button = screen.getByRole("button", { name: "Call Leo Martins" });
    fireEvent.click(button);
    fireEvent.click(button);
    const commands = realtime.send.mock.calls.map(([command]) => command).filter((command) => command.type === "call.request");
    expect(commands).toHaveLength(1);
    expect(screen.getByText("Starting call…")).toBeTruthy();
    act(() => realtime.handler?.({ type: "command.error", requestId: commands[0]!.requestId, code: "CALL_OUT_OF_RANGE", message: "Move closer to call." }));
    expect(screen.getByRole("alert").textContent).toContain("Move closer to call.");
    expect(screen.queryByText("Starting call…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry call" }));
    expect(realtime.send.mock.calls.filter(([command]) => command.type === "call.request")).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => realtime.handler?.({ type: "call.state", callId: "call", peerUserId: "user-leo", direction: "outgoing", state: "ringing" }));
    expect(screen.queryByText("Starting call…")).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel call to Leo Martins" })).toBeTruthy();
  });

  it("joins an existing nearby conversation without sending a busy call invitation", () => {
    realtime.snapshot!.players[1]!.x = 290;
    realtime.snapshot!.players[1]!.roomId = "room-review";
    realtime.snapshot!.players[1]!.proximity = { callId: "open-call", microphone: false, camera: false };
    renderWorkspace();
    fireEvent.change(screen.getByRole("combobox", { name: "Active interaction" }), { target: { value: "user-leo" } });
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(screen.getByRole("region", { name: "Open call" })).toBeTruthy();
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "proximity.set_media", microphone: false, camera: false }));
    expect(realtime.send.mock.calls.some(([command]) => command.type === "call.request")).toBe(false);
  });

  it("explains why calling is unavailable when Do not disturb is on", () => {
    const data = structuredClone(workspace);
    data.members[0]!.availability = "dnd";
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Select Leo" }));
    fireEvent.click(screen.getByRole("button", { name: "Call Leo Martins" }));
    expect(screen.getByText("Turn off Do not disturb before calling.")).toBeTruthy();
    expect(realtime.send.mock.calls.some(([command]) => command.type === "movement.approach_user")).toBe(false);
  });

  it("shows an actionable error when a call cannot be sent", () => {
    realtime.send.mockReturnValue(false);
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Select Leo" }));
    fireEvent.click(screen.getByRole("button", { name: "Call Leo Martins" }));
    expect(screen.getByRole("alert").textContent).toContain("Connection unavailable. Reconnect and try again.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss call error" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports an unanswered call request and releases pending state on disconnect", () => {
    vi.useFakeTimers();
    const props = { initialData: structuredClone(workspace), onSignOut: vi.fn(), onSessionExpired: vi.fn() };
    const view = render(<Workspace {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "People" }));
    fireEvent.click(screen.getByRole("button", { name: "Leo Martins" }));
    fireEvent.click(screen.getByRole("button", { name: "Call Leo Martins" }));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("alert").textContent).toContain("The call did not start. Try again.");
    fireEvent.click(screen.getByRole("button", { name: "Retry call" }));
    realtime.connection = "offline";
    view.rerender(<Workspace {...props} />);
    expect(screen.getByRole("alert").textContent).toContain("Connection lost. Reconnect and try again.");
  });

  it("selects an avatar before walking over to call", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Select Leo" }));
    expect(realtime.send.mock.calls.some(([command]) => command.type === "movement.approach_user")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Call Leo Martins" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "movement.approach_user",
      targetUserId: "user-leo",
    }));
    expect(screen.queryByLabelText("Selected Leo Martins")).toBeNull();
    expect(screen.getByText("Walking over…")).toBeTruthy();
  });
});

function renderWorkspace(): void {
  render(<Workspace initialData={structuredClone(workspace)} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
}

function emitJoined(): void {
  act(() => realtime.handler?.({
    type: "meeting.joined",
    requestId: meetingJoinCommands().at(-1)?.requestId ?? "unsolicited-join",
    session: mediaSession,
    meeting: { ...meeting, participantIds: [workspace.currentUserId] },
  }));
}

function expectMeetingJoinRequest(): void {
  expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
    type: "meeting.join",
    meetingId: meeting.id,
  }));
}

function meetingJoinCommands() {
  return realtime.send.mock.calls
    .map(([command]) => command)
    .filter((command): command is Extract<ClientCommand, { type: "meeting.join" }> => command.type === "meeting.join");
}

function meetingLeaveCommands() {
  return realtime.send.mock.calls
    .map(([command]) => command)
    .filter((command): command is Extract<ClientCommand, { type: "meeting.leave" }> => command.type === "meeting.leave");
}
