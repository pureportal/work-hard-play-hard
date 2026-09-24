import { createPublicEconomy } from "@workhard/shared";
import { createOrganisation } from "@workhard/shared";
import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CORPORATE_IDENTITY } from "@workhard/shared";
import type { BootstrapData, ClientCommand, Floor, FloorLayout, LayoutEdit, LayoutItemReference, ServerEvent, WorldObject, WorldSnapshot } from "@workhard/shared";
import { Workspace } from "./App";
import { getServerOrigin } from "./server-url";
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
  WorldCanvas: ({
    floor,
    layout,
    inputEnabled,
    editing,
    editingAssetRotation,
    editingAssetVariantId,
    movingBuildItem,
    onDestination,
    onEdit,
    onBuildItemSelect,
    onObjectSelect,
  }: {
    floor: Floor;
    layout: FloorLayout;
    inputEnabled: boolean;
    editing: boolean;
    editingAssetRotation: number;
    editingAssetVariantId: string;
    movingBuildItem?: LayoutItemReference;
    onDestination: (x: number, y: number) => void;
    onEdit: (edit: LayoutEdit) => void;
    onBuildItemSelect: (item?: LayoutItemReference) => void;
    onObjectSelect: (object: WorldObject, interactionId: string | undefined, anchor: { x: number; y: number }) => void;
  }) => (
    <div
      data-testid="world"
      data-floor={floor.id}
      data-input-enabled={inputEnabled}
      data-moving={movingBuildItem ? `${movingBuildItem.type}:${movingBuildItem.id}` : ""}
      data-asset-rotation={editingAssetRotation}
      data-asset-variant={editingAssetVariantId}
    >
      <button onClick={() => onDestination(320, 400)}>Choose destination</button>
      {layout.objects[0] && <button onClick={() => onObjectSelect(layout.objects[0]!, undefined, { x: 180, y: 220 })}>Choose object</button>}
      {editing && layout.objects[0] && <button onClick={() => onBuildItemSelect({ type: "asset", id: layout.objects[0]!.id })}>Select build item</button>}
      {editing && movingBuildItem?.type === "asset" && (
        <button onClick={() => onEdit({ tool: "asset.move", objectId: movingBuildItem.id, position: { x: 160, y: 160 }, variantId: "white", rotation: 0 })}>Place selected item</button>
      )}
    </div>
  ),
}));

beforeEach(() => {
  localStorage.setItem(`game-guide:${getServerOrigin()}:user-maya`, "seen");
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
  realtime.snapshot = snapshot("floor-1", 64, 448);
  realtime.send.mockReset();
  realtime.send.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  realtime.handler = undefined;
});

describe("Workspace floor navigation", () => {
  it("adds newly created floors and their layouts from live updates", () => {
    renderWorkspace();
    const floor: Floor = { ...workspace().floors[0]!, id: "floor-new", level: 4, name: "Floor 4" };
    const layout: FloorLayout = { floorId: floor.id, revision: 0, walls: [], openings: [], tiles: [], rooms: [], objects: [] };
    act(() => {
      realtime.handler?.({ type: "floor.updated", floor });
      realtime.handler?.({ type: "layout.updated", layout });
    });
    fireEvent.change(screen.getByLabelText("Floor"), { target: { value: floor.id } });
    expect(screen.getByTestId("world").getAttribute("data-floor")).toBe(floor.id);
    fireEvent.click(screen.getByRole("button", { name: "Choose destination" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "movement.set_destination", floorId: floor.id }));
  });

  it("offers rescue in settings and sends only the current player's rescue command", async () => {
    renderWorkspace();
    fireEvent.change(screen.getByLabelText("Floor"), { target: { value: "floor-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rescue Me" }, { timeout: 10000 }));
    expect(realtime.send).toHaveBeenCalledWith({ type: "player.rescue", requestId: expect.any(String) });
    act(() => realtime.handler?.({ type: "player.rescued", requestId: "rescue", floorId: "floor-1" }));
    expect(screen.getByTestId("world").getAttribute("data-floor")).toBe("floor-1");
  });

  it("keeps same-floor destinations on the normal click-to-move path", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Choose destination" }));

    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "movement.set_destination",
      floorId: "floor-1",
      x: 320,
      y: 400,
    }));
    expect(screen.getByTestId("world").getAttribute("data-floor")).toBe("floor-1");
  });

  it("previews another floor and routes a click there without changing floors immediately", () => {
    renderWorkspace();

    fireEvent.change(screen.getByLabelText("Floor"), { target: { value: "floor-2" } });

    expect(movementCommands()).toHaveLength(0);
    expect(screen.getByTestId("world").getAttribute("data-floor")).toBe("floor-2");
    expect(screen.getByTestId("world").getAttribute("data-input-enabled")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Choose destination" }));

    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "movement.set_destination",
      floorId: "floor-2",
      x: 320,
      y: 400,
    }));
    expect(screen.getByTestId("world").getAttribute("data-floor")).toBe("floor-1");

    realtime.snapshot = snapshot("floor-2", 64, 64);
    act(() => realtime.handler?.({ type: "session.ready", userId: "user-maya", floorId: "floor-2" }));

    expect(screen.getByTestId("world").getAttribute("data-floor")).toBe("floor-2");
    expect(screen.getByTestId("world").getAttribute("data-input-enabled")).toBe("true");
  });

  it("sends the clicked coordinate on a non-adjacent destination floor", () => {
    renderWorkspace();

    fireEvent.change(screen.getByLabelText("Floor"), { target: { value: "floor-3" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose destination" }));

    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "movement.set_destination",
      floorId: "floor-3",
      x: 320,
      y: 400,
    }));
  });

  it("stops movement and hides gameplay controls in Build Mode", async () => {
    renderWorkspace();

    expect(screen.getByLabelText("Controls")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "movement.stop" }));
    expect(screen.getByTestId("world").getAttribute("data-input-enabled")).toBe("false");
    expect(screen.queryByLabelText("Controls")).toBeNull();
    expect(await screen.findByRole("heading", { name: "Build" }, { timeout: 5_000 })).toBeTruthy();
  });

  it("rotates the active placement with R even while its catalog button has focus", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Shared" }, { timeout: 5_000 }));
    fireEvent.click(await screen.findByRole("tab", { name: "Seating" }, { timeout: 5_000 }));
    const chairButton = screen.getByRole("button", { name: "Office chair" });
    fireEvent.click(chairButton);

    fireEvent.keyDown(chairButton, { key: "r" });
    expect(screen.getByTestId("world").getAttribute("data-asset-rotation")).toBe("90");

    fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
    expect(screen.getByTestId("world").getAttribute("data-asset-variant")).toBe("blue");
  });

  it("positions selected-object actions beside the clicked object", () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("top-bar")) return new DOMRect(80, 16, 720, 54);
      if (this.classList.contains("control-dock")) return new DOMRect(280, 510, 300, 60);
      return new DOMRect(80, 0, 720, 600);
    });
    const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(240);
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(60);
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Choose object" }));

    const menu = screen.getByLabelText("Selected place").closest(".world-actions") as HTMLElement;
    expect(menu.classList.contains("contextual")).toBe(true);
    expect(menu.style.left).toBe("60px");
    expect(menu.style.top).toBe("148px");
    bounds.mockRestore();
    width.mockRestore();
    height.mockRestore();
  });

  it("closes selected-object actions after sitting", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Choose object" }));
    fireEvent.click(screen.getByRole("button", { name: "Sit" }));

    expect(screen.queryByLabelText("Selected place")).toBeNull();
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "asset.interact",
      objectId: "chair",
      interactionId: "seat",
    }));
  });

  it("closes selected-object actions after standing", () => {
    const seatedSnapshot = snapshot("floor-1", 112, 112);
    seatedSnapshot.players[0]!.seat = { objectId: "chair", interactionId: "seat" };
    realtime.snapshot = seatedSnapshot;
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Choose object" }));
    fireEvent.click(screen.getByRole("button", { name: "Stand" }));

    expect(screen.queryByLabelText("Selected place")).toBeNull();
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "seat.leave" }));
  });

  it("closes selected-game actions after joining the lobby", () => {
    const data = workspace();
    data.layouts[0]!.objects = [{
      id: "arcade",
      floorId: "floor-1",
      assetId: "equipment-arcade",
      x: 96,
      y: 96,
      rotation: 0,
      variantId: "graphite",
    }];
    data.miniGames = [{ id: "game-arcade", name: "Arcade", accent: "#ff7a66", assetId: data.layouts[0]!.objects[0]!.assetId }];
    renderWorkspace(data);

    fireEvent.click(screen.getByRole("button", { name: "Choose object" }));
    fireEvent.click(screen.getByRole("button", { name: "Join lobby" }));

    expect(screen.queryByLabelText("Selected place")).toBeNull();
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "movement.set_destination" }));
  });

  it("closes selected-portal actions after choosing a destination", () => {
    const data = workspace();
    data.layouts[0]!.objects = [{
      id: "portal-up",
      floorId: "floor-1",
      assetId: "infrastructure-portal",
      label: "2",
      x: 96,
      y: 96,
      rotation: 0,
      variantId: "violet",
    }];
    data.layouts[1]!.objects = [{
      id: "portal-down",
      floorId: "floor-2",
      assetId: "infrastructure-portal",
      label: "1",
      x: 320,
      y: 320,
      rotation: 0,
      variantId: "violet",
    }];
    renderWorkspace(data);

    fireEvent.click(screen.getByRole("button", { name: "Choose object" }));
    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(screen.queryByLabelText("Selected place")).toBeNull();
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "movement.set_destination",
      floorId: "floor-2",
    }));
  });

  it("closes an accessible door prompt after entering and restores it when movement fails", () => {
    realtime.snapshot = snapshot("floor-1", 200, 100);
    renderWorkspace(workspaceWithDoor(true));

    fireEvent.click(screen.getByRole("button", { name: "Enter" }));

    expect(screen.queryByLabelText("Focus room door")).toBeNull();
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "movement.set_destination" }));

    const command = movementCommands()[0]!;
    act(() => realtime.handler?.({
      type: "command.error",
      requestId: command.requestId,
      code: "MOVEMENT_BLOCKED",
      message: "That room cannot be entered.",
    }));

    expect(screen.getByLabelText("Focus room door")).toBeTruthy();
  });

  it("dismisses a door prompt while a knock is pending and restores it after a failed request", () => {
    realtime.snapshot = snapshot("floor-1", 200, 100);
    renderWorkspace(workspaceWithDoor(false));

    fireEvent.click(screen.getByRole("button", { name: "Knock" }));

    expect(screen.queryByLabelText("Focus room door")).toBeNull();
    const command = realtime.send.mock.calls.at(-1)![0] as Extract<ClientCommand, { type: "room.knock" }>;
    act(() => realtime.handler?.({ type: "command.error", requestId: command.requestId,
      code: "KNOCK_NO_OCCUPANTS", message: "No one is inside." }));
    expect(screen.getByLabelText("Focus room door")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Knock" })).toBeTruthy();
  });

  it("moves, rotates, and removes an item selected on the build canvas", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(await screen.findByRole("button", { name: "Shared" }, { timeout: 5_000 }));
    fireEvent.click(screen.getByRole("button", { name: "Select build item" }));

    fireEvent.keyDown(window, { key: "r" });
    acknowledgeProjectEdit();
    fireEvent.click(await screen.findByRole("button", { name: "Move" }));
    expect(screen.getByTestId("world").getAttribute("data-moving")).toBe("asset:chair");
    fireEvent.click(screen.getByRole("button", { name: "Place selected item" }));
    acknowledgeProjectEdit();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Remove item?" })).getByRole("button", { name: "Remove" }));

    const edits = realtime.send.mock.calls.flatMap(([command]) => command.type === "project.edit" ? [command.edit] : []);
    expect(edits).toContainEqual({ tool: "asset.move", objectId: "chair", position: { x: 160, y: 160 }, variantId: "white", rotation: 0 });
    expect(edits).toContainEqual({ tool: "asset.move", objectId: "chair", position: { x: 96, y: 96 }, variantId: "white", rotation: 90 });
    expect(edits).toContainEqual({ tool: "item.remove", item: { type: "asset", id: "chair" } });
  });
});

function renderWorkspace(data = workspace()): void {
  render(<Workspace initialData={data} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
}

function workspaceWithDoor(hasAccess: boolean): BootstrapData {
  const data = workspace();
  const layout = data.layouts[0]!;
  layout.walls = [{ id: "focus-wall", start: { x: 100, y: 100 }, end: { x: 300, y: 100 } }];
  layout.openings = [{ id: "focus-door", wallId: "focus-wall", offset: 100, width: 64, type: "door" }];
  layout.rooms = [{
    id: "focus-room",
    floorId: "floor-1",
    name: "Focus room",
    color: "#ffffff",
    capacity: 4,
    bounds: { x: 100, y: 100, width: 200, height: 200 },
    footprint: [{ x: 100, y: 100, width: 200, height: 200 }],
    boundary: [{ wallId: "focus-wall", startOffset: 0, endOffset: 200 }],
    doorIds: ["focus-door"],
    windowIds: [],
    privateEligible: true,
    access: {
      mode: "assigned",
      assignedPersonIds: hasAccess ? ["user-maya"] : [],
      knockable: !hasAccess,
    },
  }];
  return data;
}

function workspace(): BootstrapData {
  const floors = [1, 2, 3].map((level): Floor => ({
    id: `floor-${level}`,
    officeId: "office",
    name: `Floor ${level}`,
    level,
    width: 512,
    height: 512,
    spawn: { x: 64, y: 448 },
    background: "#ffffff",
  }));
  return {
    currentUserId: "user-maya",
    corporateIdentity: DEFAULT_CORPORATE_IDENTITY,
    organisation: createOrganisation(),
    publicEconomy: createPublicEconomy(),
    team: { id: "team", name: "Northstar", slug: "northstar", accent: "#6c5ce7" },
    office: { id: "office", teamId: "team", name: "Northstar" },
    floors,
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
      floorId: "floor-1",
      position: { x: 64, y: 448 },
    }],
    layouts: floors.map((floor): FloorLayout => ({
      floorId: floor.id,
      revision: 1,
      walls: [],
      openings: [],
      tiles: [],
      rooms: [],
      objects: floor.id === "floor-1" ? [{
        id: "chair",
        floorId: floor.id,
        assetId: "chair-office",
        x: 96,
        y: 96,
        rotation: 0,
        variantId: "white",
      }] : [],
    })),
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

function snapshot(floorId: string, x: number, y: number): WorldSnapshot {
  return {
    type: "world.snapshot",
    tick: 1,
    floorId,
    layoutRevision: 1,
    players: [{
      userId: "user-maya",
      floorId,
      x,
      y,
      facing: "down",
      availability: "available",
      connected: true,
    }],
  };
}

function movementCommands() {
  return realtime.send.mock.calls
    .map(([command]) => command)
    .filter((command) => command.type === "movement.set_destination");
}

function acknowledgeProjectEdit(): void {
  const command = realtime.send.mock.calls.map(([entry]) => entry).filter((entry) => entry.type === "project.edit").at(-1)!;
  const layout = workspace().layouts[0]!;
  act(() => realtime.handler?.({ type: "project.preview", requestId: command.requestId,
    project: { id: "draft", fundId: "workspace", floorId: layout.floorId, baseRevision: layout.revision, baseLayout: layout, edits: 1,
      layout, quote: { assetChanges: [], cost: 0, refund: 0, refunds: [], structural: false, destructive: false, requiresApproval: true, purchases: [], removedKeys: [], inventoryIds: [] } } }));
}
