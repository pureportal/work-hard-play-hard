import { createPublicEconomy } from "@workhard/shared";
import { createOrganisation } from "@workhard/shared";
import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapData, ClientCommand, ServerEvent, WorldSnapshot } from "@workhard/shared";
import { Workspace } from "./App";
import type { WorldCanvasProps } from "./components/WorldCanvas";
import { createTestCorporateIdentity, createTestEconomy, createTestGameSettings, createTestKidnappingConfiguration } from "./test-fixtures";

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
  WorldCanvas: ({ editing, editingTool, editingAssetVariantId, editingAssetRotation, onEdit, floor, focusTarget, selectedBuildItem }: WorldCanvasProps) => (
    <div data-testid="world" data-floor={floor.id} data-focus={JSON.stringify(focusTarget)} data-selected={selectedBuildItem?.id}>
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
  it.each([
    { action: "Sell Office chair for 30 coins", title: "Sell Office chair?", confirm: "Sell item", command: "economy.sell_asset" },
    { action: "Donate", title: "Donate Office chair?", confirm: "Donate item", command: "economy.donate_asset" },
  ])("confirms $command in the game before sending it", async ({ action, title, confirm, command }) => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    const trigger = await screen.findByRole("button", { name: action }, { timeout: 5000 });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: title })).toBeTruthy();
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: command }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: title })).toBeNull();
    expect(screen.getByRole("complementary", { name: "Build" })).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole("dialog", { name: title })).getByRole("button", { name: "Cancel" }));
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: command }));
    fireEvent.click(trigger);
    const confirmButton = within(screen.getByRole("dialog", { name: title })).getByRole("button", { name: confirm });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    const commands = realtime.send.mock.calls.map(([sent]) => sent)
      .filter((sent): sent is Extract<ClientCommand, { type: "economy.sell_asset" | "economy.donate_asset" }> => sent.type === command);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ type: command, ownedAssetId: "owned-chair" });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
    const economy = createTestEconomy();
    economy.inventory = [];
    act(() => realtime.handler?.({ type: "economy.updated", requestId: commands[0]!.requestId, economy }));
    expect(screen.queryByRole("dialog", { name: title })).toBeNull();
  });

  it("focuses personal placements across floors without moving the player and replays repeated focus", async () => {
    const data = workspace();
    data.floors.push({ ...data.floors[0]!, id: "upstairs", name: "Upstairs", level: 2 });
    data.layouts.push({ ...data.layouts[0]!, floorId: "upstairs", rooms: [], objects: [
      { id: "placed-chair", floorId: "upstairs", assetId: "chair-office", x: 32, y: 32, variantId: "white", rotation: 0, ownerUserId: "player" },
    ] });
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Place" }, { timeout: 5000 }));
    fireEvent.click(screen.getByRole("tab", { name: "Placed" }));
    const focus = screen.getByRole("button", { name: "Focus Office chair in Upstairs" });
    fireEvent.click(focus);
    const world = screen.getByTestId("world");
    expect(world.getAttribute("data-floor")).toBe("upstairs");
    expect(world.getAttribute("data-selected")).toBe("placed-chair");
    expect(screen.queryByRole("button", { name: "Place on canvas" })).toBeNull();
    const firstFocus = JSON.parse(world.getAttribute("data-focus")!);
    expect(firstFocus).toMatchObject({ floorId: "upstairs", objectId: "placed-chair" });
    fireEvent.click(focus);
    expect(JSON.parse(world.getAttribute("data-focus")!).requestId).not.toBe(firstFocus.requestId);
    fireEvent.keyDown(document, { key: "r" });
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "player_asset.move" }));
    expect(realtime.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "movement.set_destination" }));
  });

  it("stores the focused item on the player's floor", async () => {
    const data = workspace();
    data.layouts[0]!.objects = [{ id: "chair", floorId: "floor", assetId: "chair-office", x: 32, y: 32, variantId: "white", rotation: 0, ownerUserId: "player" }];
    render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Placed" }));
    fireEvent.click(screen.getByRole("button", { name: "Focus Office chair in Room, Floor" }));
    fireEvent.click(screen.getByRole("button", { name: "Store" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "player_asset.remove", objectId: "chair", baseRevision: 1 }));
    expect(screen.getByTestId("world").getAttribute("data-selected")).toBeNull();
  });

  it("opens Build for a non-builder and sends owned placement commands", async () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Place" }, { timeout: 5000 }));
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

  it("sends daily claims and catalog purchases through the authoritative economy API", async () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    fireEvent.click(await screen.findByRole("button", { name: "Claim 50" }));
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

  it("keeps a pending placement until its own layout conflict arrives", async () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Place" }));
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

  it("stops placing an inventory instance that was placed in another session", async () => {
    render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Place" }));
    expect(screen.getByRole("button", { name: "Place on canvas" })).toBeTruthy();

    const economy = createTestEconomy();
    economy.inventory = [{
      id: "owned-chair",
      assetId: "chair-office",
      purchasePrice: 90, acquiredAt: "2026-09-01T12:00:00.000Z",
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
    purchasePrice: 90, acquiredAt: "2026-09-01T12:00:00.000Z",
  }];
  return {
    currentUserId: "player",
    corporateIdentity: createTestCorporateIdentity(),
    organisation: createOrganisation(),
    publicEconomy: createPublicEconomy(),
    team: { id: "team", name: "Team", slug: "team", accent: "#000000" },
    office: { id: "office", teamId: "team", name: "Office" },
    floors: [{ id: "floor", officeId: "office", name: "Floor", level: 1, width: 256, height: 256, spawn: { x: 200, y: 200 }, background: "#ffffff" }],
    members: [{
      id: "player",
      name: "Player",
      initials: "PL", character: { ...DEFAULT_CHARACTER_APPEARANCE },
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
        build: { mode: "assigned", assignedPersonIds: ["player"] },
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
