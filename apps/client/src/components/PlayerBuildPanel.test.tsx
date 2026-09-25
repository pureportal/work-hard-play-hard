import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrganisation, MAX_LAYOUT_OBJECTS_PER_FLOOR, MAX_OWNED_ASSETS, type FloorLayout, type Room } from "@workhard/shared";
import { createTestEconomy, createTestGameSettings } from "../test-fixtures";
import { PlayerBuildPanel } from "./PlayerBuildPanel";

afterEach(cleanup);

describe("PlayerBuildPanel", () => {
  it("lists each personal placement across floors and focuses the chosen copy", () => {
    const onFocus = vi.fn();
    const firstFloor = floorLayout(assignedRoom());
    firstFloor.objects = [
      { id: "my-chair", floorId: "floor", assetId: "chair-office", x: 32, y: 32, rotation: 0, variantId: "white", ownerUserId: "player" },
      { id: "their-chair", floorId: "floor", assetId: "chair-office", x: 64, y: 32, rotation: 0, variantId: "white", ownerUserId: "other" },
      { id: "shared-chair", floorId: "floor", assetId: "chair-office", x: 96, y: 32, rotation: 0, variantId: "white" },
    ];
    const secondFloor = { ...floorLayout(assignedRoom()), floorId: "upstairs", rooms: [], objects: [
      { ...firstFloor.objects[0]!, id: "second-chair", floorId: "upstairs", variantId: "blue" },
      { ...firstFloor.objects[0]!, id: "third-chair", floorId: "upstairs" },
    ] };
    renderPanel({ layout: firstFloor, layouts: [firstFloor, secondFloor],
      floors: ["floor", "upstairs"].map((id, level) => ({ id, officeId: "office", name: id, level, width: 256, height: 256, spawn: { x: 200, y: 200 }, background: "#fff" })),
      onFocus, selectedItem: { type: "asset", id: "my-chair" } });
    fireEvent.click(screen.getByRole("tab", { name: "Placed" }));

    expect(screen.getAllByRole("button", { name: /^Focus / })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Focus Office chair in Room, floor" }).getAttribute("aria-pressed")).toBe("true");
    const upstairs = screen.getAllByRole("button", { name: "Focus Office chair in upstairs" });
    fireEvent.click(upstairs[0]!);
    fireEvent.click(upstairs[1]!);
    expect(onFocus.mock.calls).toEqual([["upstairs", "second-chair"], ["upstairs", "third-chair"]]);
  });

  it("supports keyboard navigation through all three tabs", () => {
    renderPanel();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Inventory" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Placed" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("No placed items yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Inventory" }));
    expect(screen.getByRole("tab", { name: "Inventory" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Placed" }));
    fireEvent.keyDown(screen.getByRole("tab", { name: "Placed" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Shop" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Shop" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Inventory" }).getAttribute("aria-selected")).toBe("true");
  });

  it("sells an available copy with its actual resale value and stores the selected placement", () => {
    const onSell = vi.fn();
    const onRemoveSelected = vi.fn();
    const economy = createTestEconomy();
    economy.inventory = [
      { id: "placed", assetId: "chair-office", purchasePrice: 90, acquiredAt: "2026-09-01", placement: { objectId: "chair", floorId: "floor", placedAt: "2026-09-01" } },
      { id: "available", assetId: "chair-office", purchasePrice: 70, acquiredAt: "2026-09-01" },
    ];
    const layout = floorLayout(assignedRoom());
    layout.objects = [{ id: "chair", floorId: "floor", assetId: "chair-office", x: 32, y: 32, rotation: 0, variantId: "white", ownerUserId: "player" }];
    renderPanel({ economy, layout, onSell, onRemoveSelected, selectedItem: { type: "asset", id: "chair" } });
    fireEvent.click(screen.getByRole("button", { name: "Sell Office chair for 23 coins" }));
    expect(onSell).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sell item" }));
    expect(onSell).toHaveBeenCalledWith("available");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Store" }));
    expect(onRemoveSelected).toHaveBeenCalledOnce();
  });

  it("allows storing owned items while movement requires visiting the floor", () => {
    const layout = floorLayout(assignedRoom());
    layout.objects = [{ id: "chair", floorId: "floor", assetId: "chair-office", x: 32, y: 32, rotation: 0, variantId: "white", ownerUserId: "player" }];
    renderPanel({ layout, playerFloorId: "upstairs", selectedItem: { type: "asset", id: "chair" } });
    expect((screen.getByRole("button", { name: "Store" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Move" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Visit this floor to edit or place items.")).toBeTruthy();
  });

  it("keeps permanent floors out of the personal shop while offering rugs", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "Shop" }));
    expect(screen.queryByRole("tab", { name: "Floor types" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Floor decor" }));
    expect(screen.getByRole("button", { name: "Buy Woven rug" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Buy Parquet" })).toBeNull();
  });

  it("filters the expanded shop by rarity while retaining purchase limits", () => {
    const onPurchase = vi.fn();
    renderPanel({ onPurchase });
    fireEvent.click(screen.getByRole("tab", { name: "Shop" }));
    fireEvent.click(screen.getByRole("tab", { name: "Lighting" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Rarity" }), { target: { value: "legendary" } });
    expect(screen.queryByRole("button", { name: "Buy Drum floor lamp" })).toBeNull();
    const expensive = screen.getByRole("button", { name: "Need 1400 more coins for Crystal floor lamp" });
    expect((expensive as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(expensive);
    expect(onPurchase).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox", { name: "Rarity" }), { target: { value: "common" } });
    fireEvent.click(screen.getByRole("button", { name: "Buy Drum floor lamp" }));
    expect(onPurchase).toHaveBeenCalledWith("light-floor");
  });

  it("shows the wallet without a daily bonus card", () => {
    renderPanel();
    expect(screen.getByLabelText("250 coins")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Daily bonus" })).toBeNull();
    expect(screen.queryByText(/-day streak$/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Open bonus" })).toBeNull();
  });

  it("buys affordable assets and directs shared assets to Shared", () => {
    const onPurchase = vi.fn();
    renderPanel({ onPurchase });
    fireEvent.click(screen.getByRole("tab", { name: "Shop" }));
    fireEvent.click(screen.getByRole("tab", { name: "Seating" }));
    fireEvent.click(screen.getByRole("button", { name: "Buy Office chair" }));

    expect(onPurchase).toHaveBeenCalledWith("chair-office");

    fireEvent.click(screen.getByRole("tab", { name: "Outdoor" }));
    expect((screen.getByRole("button", { name: "Need 250 more coins for Pool" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "Equipment" }));
    const sharedOnlyButton = screen.getByRole("button", { name: "Falling Blocks table is available in Shared" }) as HTMLButtonElement;
    expect(sharedOnlyButton.disabled).toBe(true);
    expect(sharedOnlyButton.textContent).toBe("Shared only");
    const sharedOnlyAsset = sharedOnlyButton.closest(".catalog-asset");
    expect(sharedOnlyAsset?.getAttribute("data-rarity")).toBe("rare");
    expect(sharedOnlyAsset?.getAttribute("aria-description")).toBe("rare rarity");
    expect(sharedOnlyAsset?.querySelector(".catalog-asset-rarity")).toBeNull();
  });

  it("disables purchases when inventory is full", () => {
    const economy = createTestEconomy();
    economy.inventory = Array.from({ length: MAX_OWNED_ASSETS }, (_, index) => ({
      id: `owned-chair-${index}`,
      assetId: "chair-office",
      purchasePrice: 90, acquiredAt: "2026-09-01T12:00:00.000Z",
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
      purchasePrice: 90, acquiredAt: "2026-09-01T12:00:00.000Z",
    }];

    renderPanel({ economy, onPlace });
    fireEvent.click(screen.getByRole("button", { name: "Place" }));

    expect(screen.getByText("1 available")).toBeTruthy();
    const inventoryAsset = within(screen.getByRole("tabpanel", { name: "Inventory" })).getByText("Office chair").closest(".catalog-asset");
    expect(inventoryAsset?.getAttribute("data-rarity")).toBe("common");
    expect(inventoryAsset?.getAttribute("aria-description")).toBe("common rarity");
    expect(inventoryAsset?.querySelector(".catalog-asset-rarity")).toBeNull();
    expect(onPlace).toHaveBeenCalledWith("owned-chair", "chair-office");
  });

  it("hides selling when an available item has no resale value", () => {
    const economy = createTestEconomy();
    economy.inventory = [{ id: "starter", assetId: "chair-office", purchasePrice: 0, acquiredAt: "2026-09-01" }];
    renderPanel({ economy, onSell: vi.fn() });
    expect(screen.queryByRole("button", { name: /Sell Office chair/ })).toBeNull();
  });

  it("offers a paid copy for sale when a free copy has the same asset", () => {
    const economy = createTestEconomy();
    economy.inventory = [
      { id: "starter", assetId: "chair-office", purchasePrice: 0, acquiredAt: "2026-09-01" },
      { id: "purchased", assetId: "chair-office", purchasePrice: 90, acquiredAt: "2026-09-02" },
    ];
    renderPanel({ economy, onSell: vi.fn() });
    expect(screen.getByRole("button", { name: "Sell Office chair for 30 coins" })).toBeTruthy();
  });

  it("shows feature icons in the shop and filters matching assets", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("tab", { name: "Shop" }));
    const shop = screen.getByRole("tabpanel", { name: "Shop" });
    expect(within(shop).getByText("Wind chimes").closest(".catalog-asset")?.querySelector('[title="Animated"]')).toBeTruthy();
    expect(within(shop).getByText("Fortune dispenser").closest(".catalog-asset")?.querySelector('[title="Interactive"]')).toBeTruthy();
    expect(within(shop).getByText("Straight desk").closest(".catalog-asset")?.querySelector(".asset-feature-indicators")).toBeNull();

    fireEvent.click(within(shop).getByRole("button", { name: "Animated" }));
    expect(within(shop).getAllByTitle("Animated")).toHaveLength(9);
    expect(within(shop).queryByText("Fortune dispenser")).toBeNull();

    fireEvent.click(within(shop).getByRole("button", { name: "Interactive" }));
    expect(within(shop).getAllByTitle("Interactive")).toHaveLength(43);
    expect(within(shop).getByText("Fortune dispenser")).toBeTruthy();
    expect(within(shop).getByText("Celebration gong")).toBeTruthy();
    expect(within(shop).getByText("PR tray")).toBeTruthy();
    expect(within(shop).queryByText("Wind chimes")).toBeNull();
  });

  it("searches the personal shop and inventory with the same controls", () => {
    const economy = createTestEconomy();
    economy.inventory = [{ id: "owned-chair", assetId: "chair-office", purchasePrice: 90, acquiredAt: "2026-09-01" }];
    renderPanel({ economy });
    fireEvent.change(screen.getByRole("textbox", { name: "Search assets" }), { target: { value: "chair" } });
    expect(screen.getByRole("button", { name: "Place" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Search assets" }), { target: { value: "lamp" } });
    expect(screen.getByRole("status").textContent).toBe("No assets match.");
    fireEvent.click(screen.getByRole("tab", { name: "Shop" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search assets" }), { target: { value: "lamp" } });
    expect(screen.getByRole("button", { name: "Buy Drum floor lamp" })).toBeTruthy();
  });

  it("explains when no room on the floor permits placement", () => {
    const economy = createTestEconomy();
    economy.inventory = [{
      id: "owned-chair",
      assetId: "chair-office",
      purchasePrice: 90, acquiredAt: "2026-09-01T12:00:00.000Z",
    }];
    const closedRoom = assignedRoom();
    closedRoom.access.assignedPersonIds = ["someone-else"];

    renderPanel({ economy, layout: floorLayout(closedRoom) });

    expect((screen.getByRole("button", { name: "Place" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("No rooms on this floor allow placement.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open bonus" })).toBeNull();
  });

  it("disables placement when the floor is full", () => {
    const economy = createTestEconomy();
    economy.inventory = [{
      id: "owned-chair",
      assetId: "chair-office",
      purchasePrice: 90, acquiredAt: "2026-09-01T12:00:00.000Z",
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

  it("requires room access even when the player owns an area", () => {
    const economy = createTestEconomy();
    economy.inventory = [{ id: "owned-chair", assetId: "chair-office", purchasePrice: 90, acquiredAt: "2026-09-01" }];
    const room = assignedRoom();
    room.access = { mode: "none", assignedPersonIds: [], knockable: false };
    room.personalAreas = [{ id: "desk", name: "Desk", ownerUserId: "player", bounds: { x: 0, y: 0, width: 64, height: 64 } }];
    const onPlace = vi.fn();
    renderPanel({ economy, onPlace, layout: floorLayout(room) });
    const place = screen.getByRole("button", { name: "Place" }) as HTMLButtonElement;
    expect(place.disabled).toBe(true);
    fireEvent.click(place);
    expect(onPlace).not.toHaveBeenCalled();
  });
});

function renderPanel(overrides: Partial<React.ComponentProps<typeof PlayerBuildPanel>> = {}) {
  const props: React.ComponentProps<typeof PlayerBuildPanel> = {
    currentUserId: "player",
    playerFloorId: "floor",
    organisation: createOrganisation(),
    onOpenRooms: vi.fn(),
    economy: createTestEconomy(),
    gameSettings: createTestGameSettings(),
    layout: floorLayout(assignedRoom()),
    layouts: [floorLayout(assignedRoom())],
    floors: [{ id: "floor", officeId: "office", name: "Floor", level: 1, width: 256, height: 256, spawn: { x: 200, y: 200 }, background: "#ffffff" }],
    tool: null,
    assetId: "chair-office",
    assetVariantId: "white",
    assetRotation: 0,
    onPurchase: vi.fn(),
    onPlace: vi.fn(),
    onFocus: vi.fn(),
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
    build: { mode: "assigned", assignedPersonIds: ["player"] },
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
