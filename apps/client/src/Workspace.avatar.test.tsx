import { createOrganisation } from "@workhard/shared";
import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { useEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BootstrapData, CharacterAppearance, Member } from "@workhard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./App";
import { createTestCorporateIdentity, createTestEconomy, createTestGameSettings, createTestKidnappingConfiguration } from "./test-fixtures";

const apiMocks = vi.hoisted(() => ({
  updatePlayerCharacter: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./api")>(),
  updatePlayerCharacter: apiMocks.updatePlayerCharacter,
}));

vi.mock("./hooks/useRealtime", () => ({
  useRealtime: () => ({ connection: "online" as const, snapshot: undefined, send: () => true }),
}));

vi.mock("./components/WorldCanvasLoader", () => ({
  WorldCanvas: () => null,
}));

vi.mock("./components/CharacterPreview", () => ({
  CharacterPreview: ({ appearance, onReady }: { appearance: CharacterAppearance; onReady?: (ready: boolean) => void }) => {
    useEffect(() => { onReady?.(true); }, [appearance, onReady]);
    return <span data-testid="rendered-character">{JSON.stringify(appearance)}</span>;
  },
}));

const member: Member = {
  id: "user-one",
  name: "Maya",
  initials: "MC", character: { ...DEFAULT_CHARACTER_APPEARANCE },
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
  corporateIdentity: createTestCorporateIdentity(),
    organisation: createOrganisation(),
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
  apiMocks.updatePlayerCharacter.mockReset();
});

afterEach(cleanup);

describe("Workspace avatar customization", () => {
  it("saves from the editor and immediately updates profile portraits", async () => {
    const character: CharacterAppearance = { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male" };
    apiMocks.updatePlayerCharacter.mockResolvedValue({ ...member, character });
    const { container } = render(<Workspace initialData={workspace} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Customize avatar" }));
    expect(screen.queryByRole("button", { name: "Photo" })).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Male" }));
    fireEvent.click(screen.getByRole("button", { name: "Use character" }));
    await waitFor(() => expect(apiMocks.updatePlayerCharacter).toHaveBeenCalledWith(character));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Avatar" })).toBeNull());
    expect(screen.getAllByTestId("rendered-character").every((node) => node.textContent === JSON.stringify(character))).toBe(true);
  });
});
