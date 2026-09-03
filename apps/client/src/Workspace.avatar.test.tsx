import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BootstrapData, Member } from "@workhard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./App";
import { createTestEconomy, createTestGameSettings, createTestKidnappingConfiguration } from "./test-fixtures";

const apiMocks = vi.hoisted(() => ({
  uploadPlayerAvatar: vi.fn(),
  removePlayerAvatar: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./api")>(),
  uploadPlayerAvatar: apiMocks.uploadPlayerAvatar,
  removePlayerAvatar: apiMocks.removePlayerAvatar,
}));

vi.mock("./hooks/useRealtime", () => ({
  useRealtime: () => ({ connection: "online" as const, snapshot: undefined, send: () => true }),
}));

vi.mock("./components/WorldCanvasLoader", () => ({
  WorldCanvas: () => null,
}));

const member: Member = {
  id: "user-one",
  name: "Maya",
  initials: "MC",
  email: "maya@example.com",
  title: "Lead",
  role: "owner",
  permissions: ["manage_members", "build"],
  color: "#ff7a66",
  availability: "available",
  online: true,
  floorId: "floor-one",
};

const workspace: BootstrapData = {
  currentUserId: member.id,
  team: { id: "team-one", name: "Team", slug: "team", accent: "#000000" },
  office: { id: "office-one", teamId: "team-one", name: "Office" },
  floors: [{
    id: "floor-one",
    officeId: "office-one",
    name: "Main",
    level: 1,
    width: 800,
    height: 600,
    spawn: { x: 100, y: 100 },
    background: "#ffffff",
  }],
  members: [member],
  layouts: [{
    floorId: "floor-one",
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
  invitations: [],
  meetings: [],
  conversations: [{ id: "team-chat", name: "Team", type: "team", unread: 0 }],
  messages: [],
};

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
  apiMocks.uploadPlayerAvatar.mockReset();
  apiMocks.removePlayerAvatar.mockReset();
});

afterEach(cleanup);

describe("Workspace avatar customization", () => {
  it("opens from the player avatar and displays upload and removal immediately", async () => {
    const customized = { ...member, avatarUrl: "/v1/members/user-one/avatar.webp?v=one" };
    apiMocks.uploadPlayerAvatar.mockResolvedValue(customized);
    apiMocks.removePlayerAvatar.mockResolvedValue(member);
    const { container } = render(
      <Workspace initialData={workspace} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Customize avatar" }));
    const file = new File([new Uint8Array([1, 2, 3])], "portrait.png", { type: "image/png" });
    fireEvent.change(container.querySelector(".avatar-dialog input[type=file]")!, { target: { files: [file] } });

    await waitFor(() => expect(apiMocks.uploadPlayerAvatar).toHaveBeenCalledWith(file));
    await waitFor(() => expect(container.querySelectorAll(".avatar-image").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(apiMocks.removePlayerAvatar).toHaveBeenCalledOnce());
    await waitFor(() => expect(container.querySelector(".avatar-image")).toBeNull());
  });
});
