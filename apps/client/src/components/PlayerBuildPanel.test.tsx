import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_LAYOUT_OBJECTS_PER_FLOOR, MAX_OWNED_ASSETS, type FloorLayout, type Room } from "@workhard/shared";
import { createTestEconomy, createTestGameSettings } from "../test-fixtures";
import { PlayerBuildPanel } from "./PlayerBuildPanel";

afterEach(cleanup);

describe("PlayerBuildPanel", () => {
  it("shows the wallet and claims the daily bonus", () => {
    const onClaimDaily = vi.fn();
    renderPanel({ onClaimDaily });

    expect(screen.getByLabelText("250 coins")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Claim 50" }));

    expect(onClaimDaily).toHaveBeenCalledOnce();
  });

  it("buys affordable catalog assets and disables unaffordable or unavailable assets", () => {
    const onPurchase = vi.fn();
    renderPanel({ onPurchase });
    fireEvent.click(screen.getByRole("tab", { name: "Shop" }));
    fireEvent.click(screen.getByRole("tab", { name: "Seating" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy Office chair" }));

    expect(onPurchase).toHaveBeenCalledWith("chair-office");

    fireEvent.click(screen.getByRole("tab", { name: "Outdoor" }));
    expect((screen.getByRole("button", { name: "Need 250 more coins for Pool" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "Equipment" }));
    const unavailableButton = screen.getByRole("button", { name: "Tetris table unavailable" }) as HTMLButtonElement;
    expect(unavailableButton.disabled).toBe(true);
    expect(unavailableButton.textContent).toBe("Unavailable");
  });

  it("disables purchases when inventory is full", () => {
    const economy = createTestEconomy();
    economy.inventory = Array.from({ length: MAX_OWNED_ASSETS }, (_, index) => ({
      id: `owned-chair-${index}`,
      assetId: "chair-office",
      acquiredAt: "2026-09-01T12:00:00.000Z",
    }));

    renderPanel({ economy });
    fireEvent.click(screen.getByRole("tab", { name: "Shop" }));
    fireEvent.click(screen.getByRole("tab", { name: "Seating" }));

    const buy = screen.getByRole("button", { name: "Inventory full for Office chair" }) as HTMLButtonElement;
    expect(buy.disabled).toBe(true);
    expect(buy.textContent).toBe("Inventory full");
  });

  it("places an available inventory instance in an assigned room", () => {
    const onPlace = vi.fn();
    const economy = createTestEconomy();
    economy.inventory = [{
      id: "owned-chair",
      assetId: "chair-office",
      acquiredAt: "2026-09-01T12:00:00.000Z",
    }];

    renderPanel({ economy, onPlace });
    fireEvent.click(screen.getByRole("button", { name: "Place" }));

    expect(screen.getByText("1 available · 0 placed")).toBeTruthy();
    expect(onPlace).toHaveBeenCalledWith("owned-chair", "chair-office");
  });

  it("explains when no room on the floor permits placement", () => {
    const economy = createTestEconomy();
    economy.inventory = [{
      id: "owned-chair",
      assetId: "chair-office",
      acquiredAt: "2026-09-01T12:00:00.000Z",
    }];
    const closedRoom = assignedRoom();
    closedRoom.access.assignedPersonIds = ["someone-else"];

    renderPanel({ economy, layout: floorLayout(closedRoom) });

    expect((screen.getByRole("button", { name: "Place" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("No rooms on this floor allow placement.")).toBeTruthy();
  });

  it("disables placement when the floor is full", () => {
    const economy = createTestEconomy();
    economy.inventory = [{
      id: "owned-chair",
      assetId: "chair-office",
      acquiredAt: "2026-09-01T12:00:00.000Z",
    }];
    const layout = floorLayout(assignedRoom());
    layout.objects = Array.from({ length: MAX_LAYOUT_OBJECTS_PER_FLOOR }, (_, index) => ({
      id: `object-${index}`,
      floorId: layout.floorId,
      assetId: "chair-office",
      x: index * 16,
      y: 0,
      rotation: 0,
      variantId: "white",
    }));

    renderPanel({ economy, layout });

    expect((screen.getByRole("button", { name: "Floor full" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

function renderPanel(overrides: Partial<React.ComponentProps<typeof PlayerBuildPanel>> = {}) {
  const props: React.ComponentProps<typeof PlayerBuildPanel> = {
    currentUserId: "player",
    economy: createTestEconomy(),
    gameSettings: createTestGameSettings(),
    layout: floorLayout(assignedRoom()),
    tool: null,
    assetId: "chair-office",
    assetVariantId: "white",
    assetRotation: 0,
    onClaimDaily: vi.fn(),
    onPurchase: vi.fn(),
    onPlace: vi.fn(),
    onAssetVariantChange: vi.fn(),
    onAssetRotationChange: vi.fn(),
    onMoveSelected: vi.fn(),
    onRotateSelected: vi.fn(),
    onRemoveSelected: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return render(<PlayerBuildPanel {...props} />);
}

function assignedRoom(): Room {
  return {
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
  };
}

function floorLayout(playerRoom: Room): FloorLayout {
  return {
    floorId: "floor",
    revision: 1,
    walls: [],
    openings: [],
    tiles: [],
    objects: [],
    rooms: [playerRoom],
  };
}
