import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapData, ClientCommand, LayoutEdit, ServerEvent, WorldSnapshot } from "@workhard/shared";
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
  preloadWorldCanvas: vi.fn(),
  WorldCanvas: ({ editing, editingTool, editingAssetVariantId, editingAssetRotation, onEdit }: {
    editing: boolean;
    editingTool: string | null;
    editingAssetVariantId: string;
    editingAssetRotation: 0 | 90 | 180 | 270;
    onEdit: (edit: LayoutEdit) => void;
  }) => (
    <div>
      {editing && editingTool === "asset" && (
        <button onClick={() => onEdit({ tool: "asset", assetId: "chair-office", variantId: editingAssetVariantId, rotation: editingAssetRotation, position: { x: 32, y: 32 } })}>
          Place on canvas
        </button>
      )}
    </div>
  ),
}));

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
  realtime.send.mockReset().mockReturnValue(true);
  realtime.snapshot = {
    type: "world.snapshot",
    tick: 1,
    floorId: "floor",
    layoutRevision: 1,
    players: [{
      userId: "player",
      floorId: "floor",
      x: 200,
      y: 200,
      facing: "down",
      availability: "available",
      connected: true,
    }],
  };
});

afterEach(cleanup);

describe("Workspace player assets", () => {
  it("opens Build for a non-builder and sends owned placement commands", () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    const blueDesign = screen.getByRole("radio", { name: "Blue" });
    fireEvent.click(blueDesign);
    fireEvent.keyDown(blueDesign, { key: "r" });
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));

    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "player_asset.place",
      baseRevision: 1,
      ownedAssetId: "owned-chair",
      position: { x: 32, y: 32 },
      variantId: "blue",
      rotation: 90,
    }));
    expect(realtime.send.mock.calls.filter(([command]) => command.type === "player_asset.place")).toHaveLength(1);
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "layout.apply" }));
  });

  it("sends daily claims and catalog purchases through the authoritative economy API", () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    fireEvent.click(screen.getByRole("button", { name: "Claim 50" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "economy.claim_daily" }));

    const claim = realtime.send.mock.calls.map(([command]) => command).find((command) => command.type === "economy.claim_daily")!;
    const updatedEconomy = createTestEconomy();
    updatedEconomy.coinBalance = 300;
    updatedEconomy.dailyReward.claimable = false;
    updatedEconomy.recentTransactions = [{
      id: "daily",
      kind: "daily_bonus",
      amount: 50,
      balanceAfter: 300,
      createdAt: "2026-09-03T12:00:00.000Z",
    }];
    act(() => realtime.handler?.({
      type: "economy.updated",
      requestId: claim.requestId,
      economy: updatedEconomy,
      transaction: updatedEconomy.recentTransactions[0]!,
    }));
    expect(screen.getByText("Daily bonus: +50 coins.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Shop" }));
    fireEvent.click(screen.getByRole("tab", { name: "Seating" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy Office chair" }));

    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "economy.purchase_asset",
      assetId: "chair-office",
    }));
  });

  it("keeps a pending placement until its own layout conflict arrives", () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    const placement = realtime.send.mock.calls
      .map(([command]) => command)
      .find((command) => command.type === "player_asset.place")!;

    act(() => realtime.handler?.({ type: "layout.conflict", requestId: "another-request", revision: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    expect(realtime.send.mock.calls.filter(([command]) => command.type === "player_asset.place")).toHaveLength(1);

    act(() => realtime.handler?.({ type: "layout.conflict", requestId: placement.requestId, revision: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "Place on canvas" }));
    expect(realtime.send.mock.calls.filter(([command]) => command.type === "player_asset.place")).toHaveLength(2);
  });

  it("stops placing an inventory instance that was placed in another session", () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    expect(screen.getByRole("button", { name: "Place on canvas" })).toBeTruthy();

    const economy = createTestEconomy();
    economy.inventory = [{
      id: "owned-chair",
      assetId: "chair-office",
      acquiredAt: "2026-09-01T12:00:00.000Z",
      placement: {
        objectId: "placed-chair",
        floorId: "floor",
        placedAt: "2026-09-03T12:00:00.000Z",
      },
    }];
    act(() => realtime.handler?.({ type: "economy.updated", economy }));

    expect(screen.queryByRole("button", { name: "Place on canvas" })).toBeNull();
  });
});

function workspace(): BootstrapData {
  const economy = createTestEconomy();
  economy.inventory = [{
    id: "owned-chair",
    assetId: "chair-office",
    acquiredAt: "2026-09-01T12:00:00.000Z",
  }];
  return {
    currentUserId: "player",
    team: { id: "team", name: "Team", slug: "team", accent: "#000000" },
    office: { id: "office", teamId: "team", name: "Office" },
    floors: [{ id: "floor", officeId: "office", name: "Floor", level: 1, width: 256, height: 256, spawn: { x: 200, y: 200 }, background: "#ffffff" }],
    members: [{
      id: "player",
      name: "Player",
      initials: "PL",
      email: "player@example.com",
      title: "",
      role: "member",
      permissions: [],
      color: "#123456",
      availability: "available",
      online: true,
      floorId: "floor",
      position: { x: 200, y: 200 },
    }],
    layouts: [{
      floorId: "floor",
      revision: 1,
      walls: [],
      openings: [],
      tiles: [],
      objects: [],
      rooms: [{
        id: "room",
        floorId: "floor",
        name: "Room",
        color: "#ffffff",
        capacity: 4,
        bounds: { x: 0, y: 0, width: 128, height: 128 },
        footprint: [{ x: 0, y: 0, width: 128, height: 128 }],
        boundary: [],
        doorIds: [],
        windowIds: [],
        privateEligible: true,
        access: { mode: "assigned", assignedPersonIds: ["player"], knockable: false },
      }],
    }],
    miniGames: [],
    scores: [],
    gameStatistics: [],
    economy,
    gameSettings: createTestGameSettings(),
    kidnapping: createTestKidnappingConfiguration(),
    invitations: [],
    meetings: [],
    conversations: [{ id: "team-chat", name: "Team", type: "team", unread: 0 }],
    messages: [],
  };
}
