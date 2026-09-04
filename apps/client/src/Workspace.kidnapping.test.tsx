import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapData, ClientCommand, ServerEvent, WorldSnapshot } from "@workhard/shared";
import { Workspace } from "./App";
import {
  createTestEconomy,
  createTestGameSettings,
  createTestKidnappingConfiguration,
} from "./test-fixtures";

const realtime = vi.hoisted(() => ({
  handler: undefined as ((event: ServerEvent) => void) | undefined,
  send: vi.fn<(command: ClientCommand) => boolean>(),
  snapshot: undefined as WorldSnapshot | undefined,
}));

const apiMocks = vi.hoisted(() => ({
  updateRegistrationSettings: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./api")>(),
  updateRegistrationSettings: apiMocks.updateRegistrationSettings,
}));

vi.mock("./hooks/useRealtime", () => ({
  useRealtime: ({ onEvent }: { onEvent: (event: ServerEvent) => void }) => {
    realtime.handler = onEvent;
    return { connection: "online" as const, snapshot: realtime.snapshot, send: realtime.send };
  },
}));

vi.mock("./components/WorldCanvasLoader", () => ({
  WorldCanvas: ({ onPlayerSelect }: { onPlayerSelect: (userId: string) => void }) => (
    <button onClick={() => onPlayerSelect("user-leo")}>Select Leo</button>
  ),
}));

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
    rooms: [],
  }],
  miniGames: [],
  scores: [],
  gameStatistics: [],
  economy: createTestEconomy(),
  gameSettings: createTestGameSettings(),
  kidnapping: createTestKidnappingConfiguration(),
  registrationSettings: {
    enabled: true,
    invitationRequired: true,
    whitelistedDomains: [],
    defaultRole: "member",
  },
  invitations: [],
  meetings: [],
  conversations: [{ id: "team-chat", name: "Team", type: "team", unread: 0 }],
  messages: [],
};

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
  realtime.snapshot = snapshot();
  realtime.send.mockReset();
  realtime.send.mockReturnValue(true);
  apiMocks.updateRegistrationSettings.mockReset();
  apiMocks.updateRegistrationSettings.mockImplementation(async (settings) => settings);
});

afterEach(() => {
  cleanup();
  realtime.handler = undefined;
});

describe("Workspace kidnapping", () => {
  it("starts pickup from a selected player without teleport or destination commands", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Select Leo" }));
    fireEvent.click(screen.getByRole("button", { name: "Kidnap Leo Martins" }));

    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "kidnapping.start",
      targetUserId: "user-leo",
    }));
    expect(realtime.send.mock.calls.some(([command]) => command.type === "movement.set_destination")).toBe(false);
    expect(screen.queryByLabelText("Selected Leo Martins")).toBeNull();
  });

  it("removes the action when the workspace switch is off", () => {
    const data = structuredClone(workspace);
    data.kidnapping.global.enabled = false;
    renderWorkspace(data);

    fireEvent.click(screen.getByRole("button", { name: "Select Leo" }));

    expect(screen.queryByRole("button", { name: "Kidnap Leo Martins" })).toBeNull();
  });

  it("updates global and personal policies from Settings", () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Enable kidnapping" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "kidnapping.global_settings_update",
      settings: expect.objectContaining({ enabled: false }),
    }));

    fireEvent.change(screen.getByRole("combobox", { name: "Who can be carried" }), {
      target: { value: "allow_list" },
    });
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "kidnapping.global_settings_update",
      settings: expect.objectContaining({ targetPolicy: { mode: "allow_list", userIds: [] } }),
    }));

    fireEvent.change(screen.getByRole("combobox", { name: "Who can carry you" }), {
      target: { value: "block_list" },
    });
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "kidnapping.player_settings_update",
      settings: { carrierPolicy: { mode: "block_list", userIds: [] } },
    }));

    act(() => realtime.handler?.({
      type: "kidnapping.player_settings_updated",
      settings: { carrierPolicy: { mode: "allow_list", userIds: [] } },
    }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Leo Martins" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "kidnapping.player_settings_update",
      settings: { carrierPolicy: { mode: "allow_list", userIds: ["user-leo"] } },
    }));
  });

  it("saves owner registration controls from Settings", async () => {
    const onRegistrationSettingsChange = vi.fn();
    render(
      <Workspace
        initialData={structuredClone(workspace)}
        onRegistrationSettingsChange={onRegistrationSettingsChange}
        onSignOut={vi.fn()}
        onSessionExpired={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Allow registrations" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiMocks.updateRegistrationSettings).toHaveBeenCalledWith({
      enabled: false,
      invitationRequired: true,
      whitelistedDomains: [],
      defaultRole: "member",
    }));
    expect(onRegistrationSettingsChange).toHaveBeenCalledWith({
      enabled: false,
      invitationRequired: true,
      whitelistedDomains: [],
      defaultRole: "member",
    });
  });

  it.each([
    ["passenger", "Get down"],
    ["carrier", "Put down"],
  ] as const)("offers an immediate stop control to the %s", (role, buttonName) => {
    realtime.snapshot = snapshot(role);
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "kidnapping.stop" }));
  });

  it("applies settings updates from the server", () => {
    renderWorkspace();

    act(() => realtime.handler?.({
      type: "kidnapping.global_settings_updated",
      settings: { enabled: false, targetPolicy: { mode: "allow_all", userIds: [] } },
    }));
    fireEvent.click(screen.getByRole("button", { name: "Select Leo" }));

    expect(screen.queryByRole("button", { name: "Kidnap Leo Martins" })).toBeNull();
  });
});

function snapshot(role: "passenger" | "carrier" | "none" = "none"): WorldSnapshot {
  return {
    type: "world.snapshot",
    tick: 1,
    floorId: "floor",
    layoutRevision: 1,
    players: [{
      userId: "user-maya",
      floorId: "floor",
      x: 100,
      y: 100,
      facing: "right",
      availability: "available",
      connected: true,
      ...(role === "passenger" ? { carriedByUserId: "user-leo" } : {}),
    }, {
      userId: "user-leo",
      floorId: "floor",
      x: 200,
      y: 100,
      facing: "left",
      availability: "available",
      connected: true,
      ...(role === "carrier" ? { carriedByUserId: "user-maya" } : {}),
    }],
  };
}

function renderWorkspace(data = workspace): void {
  render(<Workspace initialData={structuredClone(data)} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
}
