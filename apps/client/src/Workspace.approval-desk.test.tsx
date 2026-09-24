import { APPROVAL_UPGRADES, createOrganisation, createPublicEconomy, DEFAULT_CHARACTER_APPEARANCE, newApprovalDeskPlayer } from "@workhard/shared";
import type { ApprovalDeskView, BootstrapData, Member, ServerEvent } from "@workhard/shared";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "./App";
import { ApiError } from "./api";
import { getServerOrigin } from "./server-url";
import { createTestCorporateIdentity, createTestEconomy, createTestGameSettings, createTestKidnappingConfiguration } from "./test-fixtures";

const realtime = vi.hoisted(() => ({ handler: undefined as ((event: ServerEvent) => void) | undefined }));
const api = vi.hoisted(() => ({ fetchApprovalDesk: vi.fn(), sendApprovalDeskAction: vi.fn() }));

vi.mock("./api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./api")>(),
  fetchApprovalDesk: api.fetchApprovalDesk,
  sendApprovalDeskAction: api.sendApprovalDeskAction,
}));

vi.mock("./hooks/useRealtime", () => ({
  useRealtime: ({ onEvent }: { onEvent: (event: ServerEvent) => void }) => {
    realtime.handler = onEvent;
    return { connection: "online" as const, snapshot: undefined, send: () => true };
  },
}));

vi.mock("./components/WorldCanvasLoader", () => ({ WorldCanvas: () => null }));
vi.mock("./components/CharacterPreview", () => ({ CharacterPreview: () => null }));

const member: Member = {
  id: "user-one",
  name: "Maya",
  initials: "MC",
  character: { ...DEFAULT_CHARACTER_APPEARANCE },
  email: "maya@example.com",
  title: "Lead",
  role: "owner",
  permissions: ["manage_members"],
  color: "#ff7a66",
  availability: "available",
  online: true,
  floorId: "floor-one",
};

function workspace(enabled?: boolean): BootstrapData {
  return {
    currentUserId: member.id,
    ...(enabled !== undefined ? { features: { approvalDesk: enabled } } : {}),
    corporateIdentity: createTestCorporateIdentity(),
    organisation: createOrganisation(),
    publicEconomy: createPublicEconomy(),
    team: { id: "team-one", name: "Team", slug: "team", accent: "#000000" },
    office: { id: "office-one", teamId: "team-one", name: "Office" },
    floors: [{ id: "floor-one", officeId: "office-one", name: "Main", level: 1, width: 800, height: 600, spawn: { x: 100, y: 100 }, background: "#ffffff" }],
    members: [member],
    layouts: [{ floorId: "floor-one", revision: 1, walls: [], openings: [], tiles: [], objects: [], rooms: [] }],
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
}

function gameView(forms = 0): ApprovalDeskView {
  return {
    goal: 1_000_000,
    totalForms: forms,
    players: [{ userId: member.id, name: member.name, forms, stamps: forms, level: 0 }],
    player: { ...newApprovalDeskPlayer(member.id), forms, stamps: forms },
    balance: 250,
    economy: createTestEconomy(),
    earnedToday: 0,
    dailyCoinCap: 80,
    now: new Date().toISOString(),
  };
}

beforeEach(() => {
  localStorage.setItem(`game-guide:${getServerOrigin()}:${member.id}`, "seen");
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
  api.fetchApprovalDesk.mockReset();
  api.sendApprovalDeskAction.mockReset();
});

afterEach(() => {
  cleanup();
  realtime.handler = undefined;
});

describe("Workspace Approval Desk visibility", () => {
  it("keeps the navigation entry and an open, usable panel after a realtime snapshot", async () => {
    api.fetchApprovalDesk.mockResolvedValue(gameView());
    api.sendApprovalDeskAction.mockResolvedValue({ view: gameView(1) });
    render(<Workspace initialData={workspace(true)} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Approval Desk" }));
    expect(await screen.findByRole("button", { name: "Stamp" }, { timeout: 5_000 })).toBeTruthy();

    act(() => realtime.handler?.({ type: "workspace.snapshot", data: workspace(true) }));
    expect(screen.getByRole("button", { name: "Approval Desk" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Approval Desk" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stamp" }));
    await waitFor(() => expect(api.sendApprovalDeskAction).toHaveBeenCalledWith({ action: "stamp" }));
    await waitFor(() => expect(screen.getByText("Your forms").nextElementSibling?.textContent).toBe("1"));
  });

  it("keeps the entry and panel hidden when the feature is disabled", () => {
    render(<Workspace initialData={workspace(false)} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    act(() => realtime.handler?.({ type: "workspace.snapshot", data: workspace(false) }));

    expect(screen.queryByRole("button", { name: "Approval Desk" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Approval Desk" })).toBeNull();
    expect(api.fetchApprovalDesk).not.toHaveBeenCalled();
  });

  it("hides an open panel when a snapshot disables the feature", async () => {
    api.fetchApprovalDesk.mockResolvedValue(gameView());
    render(<Workspace initialData={workspace(true)} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Approval Desk" }));
    expect(await screen.findByRole("dialog", { name: "Approval Desk" }, { timeout: 5_000 })).toBeTruthy();
    act(() => realtime.handler?.({ type: "workspace.snapshot", data: workspace(false) }));

    expect(screen.queryByRole("button", { name: "Approval Desk" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Approval Desk" })).toBeNull();
  });

  it("keeps the entry and panel visible when the game request fails", async () => {
    api.fetchApprovalDesk.mockRejectedValue(new ApiError("Sign in to continue.", 401, "AUTH_REQUIRED"));
    render(<Workspace initialData={workspace(true)} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Approval Desk" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Sign in to continue.");
    expect(screen.getByRole("button", { name: "Approval Desk" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Approval Desk" })).toBeTruthy();
  });

  it("updates each desk asset after its upgrade is purchased", async () => {
    let state = gameView();
    api.fetchApprovalDesk.mockImplementation(async () => state);
    api.sendApprovalDeskAction.mockImplementation(async ({ upgradeId }: { upgradeId: keyof typeof state.player.levels }) => {
      state = {
        ...state,
        player: { ...state.player, levels: { ...state.player.levels, [upgradeId]: 1 } },
        balance: state.balance - 15,
      };
      return { view: state };
    });
    const { container } = render(<Workspace initialData={workspace(true)} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approval Desk" }));
    await screen.findByRole("button", { name: "Stamp" }, { timeout: 5_000 });

    for (const upgrade of APPROVAL_UPGRADES) {
      const row = screen.getByText(upgrade.name, { exact: true }).closest(".approval-desk-upgrade");
      expect(row).toBeTruthy();
      fireEvent.click(within(row as HTMLElement).getByRole("button"));
      await waitFor(() => expect(screen.getByRole("img", { name: new RegExp(`${upgrade.name} level 1`, "i") })).toBeTruthy());
      expect(container.querySelector(`.approval-desk-${upgrade.id}-art`)).toBeTruthy();
    }
  });

  it("shows a case reward and returns to case selection after collection", async () => {
    let state = gameView();
    api.fetchApprovalDesk.mockImplementation(async () => state);
    api.sendApprovalDeskAction.mockImplementation(async (action: { action: string; caseId?: string }) => {
      if (action.action === "start") {
        state = {
          ...state,
          player: { ...state.player, case: { id: "memo", startedAt: new Date(Date.now() - 7_200_000).toISOString(), readyAt: new Date(Date.now() - 1_000).toISOString() } },
        };
        return { view: state };
      }
      state = { ...state, totalForms: 36, balance: 255, player: { ...newApprovalDeskPlayer(member.id), forms: 36 } };
      return { view: state, forms: 36, coins: 5 };
    });
    render(<Workspace initialData={workspace(true)} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approval Desk" }));
    fireEvent.click(await screen.findByRole("button", { name: /Memo/ }, { timeout: 5_000 }));
    const collect = await screen.findByRole("button", { name: "Collect case" });
    await waitFor(() => expect((collect as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(collect);
    await waitFor(() => expect(screen.getByText("Your forms").nextElementSibling?.textContent).toBe("36"));
    expect(screen.getByRole("button", { name: /Memo/ })).toBeTruthy();
    expect(screen.getByText("+36 forms · +5 coins")).toBeTruthy();
  });
});
