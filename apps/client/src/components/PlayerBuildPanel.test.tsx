import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrganisation, createPublicEconomy, MAX_LAYOUT_OBJECTS_PER_FLOOR, MAX_OWNED_ASSETS, type FloorLayout, type Room } from "@workhard/shared";
import { createTestEconomy, createTestGameSettings } from "../test-fixtures";
import { PlayerBuildPanel } from "./PlayerBuildPanel";

afterEach(cleanup);

describe("furnishing catalog", { timeout: 30000 }, () => {
  it("previews owned copies before offering a purchase, excluding placed and drafted items", () => {
    const onSelectAsset = vi.fn();
    const economy = createTestEconomy();
    economy.inventory = [
      { id: "drafted", assetId: "chair-office", purchasePrice: 70, acquiredAt: "2026-09-01" },
      { id: "placed", assetId: "chair-office", purchasePrice: 70, acquiredAt: "2026-09-01", placement: { floorId: "floor", objectId: "chair", placedAt: "2026-09-01" } },
      { id: "available", assetId: "chair-office", purchasePrice: 70, acquiredAt: "2026-09-01" },
    ];
    renderPanel({ economy, draftAssetIds: ["drafted"], onSelectAsset });
    fireEvent.click(screen.getByRole("button", { name: "Preview Office chair" }));
    expect(onSelectAsset).toHaveBeenCalledWith("chair-office", "available", undefined);
    expect(screen.getByText("1 owned")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Inventory" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Shop" })).toBeNull();
  });

  it("shows a purchase price and starts a preview without purchasing", () => {
    const onSelectAsset = vi.fn();
    renderPanel({ onSelectAsset });
    fireEvent.click(screen.getByRole("button", { name: "Preview Drum floor lamp" }));
    expect(onSelectAsset).toHaveBeenCalledWith("light-floor", undefined, undefined);
    expect(screen.getByRole("button", { name: "Preview Drum floor lamp" }).closest("article")?.textContent).toContain("125 coins");
    expect(screen.queryByRole("button", { name: /^Buy / })).toBeNull();
  });

  it("uses shared storage and respects draft reservations and shared spending power", () => {
    const onSelectAsset = vi.fn();
    const publicEconomy = createPublicEconomy();
    publicEconomy.inventory = [
      { id: "drafted", assetId: "chair-office", fundId: "workspace", paid: 70 },
      { id: "stored", assetId: "chair-office", fundId: "workspace", paid: 70 },
    ];
    renderPanel({ ownership: "shared", publicEconomy, draftPublicAssetIds: ["drafted"], onSelectAsset });
    fireEvent.click(screen.getByRole("button", { name: "Preview Office chair" }));
    expect(onSelectAsset).toHaveBeenCalledWith("chair-office", undefined, "stored");
    expect((screen.getByRole("button", { name: "Preview Drum floor lamp" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("changes ownership within the catalog and keeps structural tools separate", () => {
    const onOwnershipChange = vi.fn();
    const onOpenStructure = vi.fn();
    renderPanel({ onOwnershipChange, onOpenStructure });
    fireEvent.change(screen.getByRole("combobox", { name: "Ownership" }), { target: { value: "shared" } });
    expect(onOwnershipChange).toHaveBeenCalledWith("shared");
    fireEvent.click(screen.getByRole("button", { name: "Structure" }));
    expect(onOpenStructure).toHaveBeenCalledOnce();
    expect(screen.queryByRole("tab", { name: "Floor types" })).toBeNull();
  });

  it("allows an owned copy when inventory is full but blocks purchases", () => {
    const economy = createTestEconomy();
    economy.inventory = Array.from({ length: MAX_OWNED_ASSETS }, (_, index) => ({ id: `chair-${index}`, assetId: "chair-office", acquiredAt: "2026-09-01", purchasePrice: 70 }));
    renderPanel({ economy });
    expect((screen.getByRole("button", { name: "Preview Office chair" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Inventory full Drum floor lamp" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("blocks unavailable personal items and unaffordable purchases", () => {
    renderPanel();
    expect((screen.getByRole("button", { name: "Shared only Falling Blocks table" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Need 250 Pool" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("requires access even for personal areas and blocks placement on a full floor", () => {
    const room = assignedRoom();
    room.access = { mode: "none", assignedPersonIds: [], knockable: false };
    room.personalAreas = [{ id: "area", name: "Desk", ownerUserId: "player", bounds: { x: 0, y: 0, width: 64, height: 64 } }];
    const onSelectAsset = vi.fn();
    const { unmount } = renderPanel({ layout: floorLayout(room), onSelectAsset });
    fireEvent.click(screen.getByRole("button", { name: "Preview Office chair" }));
    expect(onSelectAsset).not.toHaveBeenCalled();
    expect(screen.getByText("No rooms on this floor allow placement.")).toBeTruthy();
    unmount();
    const layout = floorLayout(assignedRoom());
    layout.objects = Array.from({ length: MAX_LAYOUT_OBJECTS_PER_FLOOR }, (_, index) => ({ id: `chair-${index}`, floorId: "floor", assetId: "chair-office", variantId: "white", rotation: 0, x: index * 16, y: 0 }));
    renderPanel({ layout });
    expect((screen.getByRole("button", { name: "Floor full Office chair" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sells a personal copy only after confirming its actual resale price", () => {
    const onSell = vi.fn();
    const economy = createTestEconomy();
    economy.inventory = [{ id: "chair", assetId: "chair-office", acquiredAt: "2026-09-01", purchasePrice: 70 }];
    renderPanel({ economy, onSell });
    fireEvent.click(screen.getByRole("button", { name: "Sell Office chair for 23 coins" }));
    expect(onSell).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sell item" }));
    expect(onSell).toHaveBeenCalledWith("chair");
  });

  it("focuses shared placements through the placed-items control", () => {
    const layout = floorLayout(assignedRoom());
    layout.objects = [{ id: "shared-chair", floorId: "floor", assetId: "chair-office", variantId: "white", rotation: 0, x: 32, y: 32 }];
    const onFocus = vi.fn();
    renderPanel({ ownership: "shared", layouts: [layout], onFocus });
    fireEvent.click(screen.getByRole("button", { name: "Placed items" }));
    fireEvent.click(screen.getByRole("button", { name: "Focus Office chair in Room, Floor" }));
    expect(onFocus).toHaveBeenCalledWith("floor", "shared-chair");
  });

  it("keeps storage accessible from another floor while disabling movement", () => {
    const layout = floorLayout(assignedRoom());
    layout.objects = [{ id: "chair", floorId: "floor", assetId: "chair-office", variantId: "white", rotation: 0, x: 32, y: 32, ownerUserId: "player" }];
    renderPanel({ layout, playerFloorId: "upstairs", selectedItem: { type: "asset", id: "chair" } });
    expect((screen.getByRole("button", { name: "Store" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Move" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables shared placement and editing while viewing another floor", () => {
    const layout = floorLayout(assignedRoom());
    layout.objects = [{ id: "shared-chair", floorId: "floor", assetId: "chair-office", variantId: "white", rotation: 0, x: 32, y: 32 }];
    renderPanel({ ownership: "shared", layout, playerFloorId: "upstairs", selectedItem: { type: "asset", id: "shared-chair" } });
    for (const name of ["Preview Office chair", "Move", "Rotate", "Remove"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("does not offer shared placement based only on access to a personal area", () => {
    const room = assignedRoom();
    room.build = { mode: "none", assignedPersonIds: [] };
    room.personalAreas = [{ id: "area", name: "Desk", ownerUserId: "player", bounds: { x: 0, y: 0, width: 64, height: 64 } }];
    renderPanel({ ownership: "shared", layout: floorLayout(room) });
    expect((screen.getByRole("button", { name: "Preview Office chair" }) as HTMLButtonElement).disabled).toBe(true);
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
    ownership: "personal",
    publicEconomy: createPublicEconomy(),
    onOwnershipChange: vi.fn(),
    onSelectAsset: vi.fn(),
    onOpenStructure: vi.fn(),
    onOpenSharedTransfer: vi.fn(),
    onProposeSale: vi.fn(),
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
