import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapData, ClientCommand, Floor, FloorLayout, LayoutEdit, LayoutItemReference, ServerEvent, WorldObject, WorldSnapshot } from "@workhard/shared";
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

  it("stops movement and hides gameplay controls in Build Mode", () => {
    renderWorkspace();

    expect(screen.getByLabelText("Controls")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({ type: "movement.stop" }));
    expect(screen.getByTestId("world").getAttribute("data-input-enabled")).toBe("false");
    expect(screen.queryByLabelText("Controls")).toBeNull();
    expect(screen.getByRole("heading", { name: "Build" })).toBeTruthy();
  });

  it("rotates the active placement with R even while its catalog button has focus", () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(screen.getByRole("tab", { name: "Seating" }));
    const chairButton = screen.getByRole("button", { name: "Office chair" });
    fireEvent.click(chairButton);

    fireEvent.keyDown(chairButton, { key: "r" });
    expect(screen.getByTestId("world").getAttribute("data-asset-rotation")).toBe("90");

    fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
    expect(screen.getByTestId("world").getAttribute("data-asset-variant")).toBe("blue");
  });

  it("positions selected-object actions beside the clicked object", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Choose object" }));

    const menu = screen.getByLabelText("Selected place").closest(".world-actions") as HTMLElement;
    expect(menu.classList.contains("contextual")).toBe(true);
    expect(menu.style.left).toBe("180px");
    expect(menu.style.top).toBe("220px");
  });

  it("moves, rotates, and removes an item selected on the build canvas", () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(screen.getByRole("button", { name: "Select build item" }));

    fireEvent.keyDown(window, { key: "r" });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(screen.getByTestId("world").getAttribute("data-moving")).toBe("asset:chair");
    fireEvent.click(screen.getByRole("button", { name: "Place selected item" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    const edits = realtime.send.mock.calls.flatMap(([command]) => command.type === "layout.apply" ? [command.edit] : []);
    expect(edits).toContainEqual({ tool: "asset.move", objectId: "chair", position: { x: 160, y: 160 }, variantId: "white", rotation: 0 });
    expect(edits).toContainEqual({ tool: "asset.move", objectId: "chair", position: { x: 96, y: 96 }, variantId: "white", rotation: 90 });
    expect(edits).toContainEqual({ tool: "item.remove", item: { type: "asset", id: "chair" } });
  });
});

function renderWorkspace(): void {
  render(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
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
    team: { id: "team", name: "Northstar", slug: "northstar", accent: "#6c5ce7" },
    office: { id: "office", teamId: "team", name: "Northstar" },
    floors,
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
