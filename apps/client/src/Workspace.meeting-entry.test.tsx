import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapData, ClientCommand, ServerEvent, WorldSnapshot } from "@workhard/shared";
import { Workspace } from "./App";
import { createTestEconomy, createTestGameSettings, createTestKidnappingConfiguration } from "./test-fixtures";

const realtime = vi.hoisted(() => ({
  handler: undefined as ((event: ServerEvent) => void) | undefined,
  send: vi.fn<(command: ClientCommand) => boolean>(),
  snapshot: undefined as WorldSnapshot | undefined,
}));

vi.mock("./hooks/useRealtime", () => ({
  useRealtime: ({ onEvent }: { onEvent: (event: ServerEvent) => void }) => {
    realtime.handler = onEvent;
    return { connection: "online" as const, snapshot: realtime.snapshot, send: realtime.send };
  },
}));

vi.mock("./components/WorldCanvasLoader", () => ({
  WorldCanvas: ({ inputEnabled, onPlayerSelect }: { inputEnabled: boolean; onPlayerSelect: (userId: string) => void }) => (
    <div data-testid="world-input" data-enabled={inputEnabled}>
      <button onClick={() => onPlayerSelect("user-leo")}>Select Leo</button>
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

const workspace: BootstrapData = {
  currentUserId: "user-maya",
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
    initials: "MC",
    email: "maya@example.com",
    title: "Product Lead",
    role: "owner",
    permissions: ["manage_members", "build"],
    color: "#ff7a66",
    availability: "available",
    online: true,
    floorId: "floor",
  }, {
    id: "user-leo",
    name: "Leo Martins",
    initials: "LM",
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
});

afterEach(() => {
  cleanup();
  realtime.handler = undefined;
});

describe("meeting area entry", () => {
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

    act(() => realtime.handler?.({ type: "meeting.left", meetingId: meeting.id }));

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

    act(() => realtime.handler?.({ type: "meeting.left", meetingId: meeting.id }));
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
  });
});

function renderWorkspace(): void {
  render(<Workspace initialData={structuredClone(workspace)} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
}

function emitJoined(): void {
  act(() => realtime.handler?.({
    type: "meeting.joined",
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
