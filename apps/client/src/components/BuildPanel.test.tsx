import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { FloorLayout, Member, Room, RoomSettings } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildPanel } from "./BuildPanel";
import { createTestGameSettings } from "../test-fixtures";

afterEach(cleanup);

const member: Member = {
  id: "person-alex",
  name: "Alex Morgan",
  initials: "AM",
  email: "alex@example.com",
  title: "Engineer",
  role: "member",
  permissions: [],
  color: "#445566",
  availability: "available",
  online: true,
};

describe("BuildPanel", () => {
  it("groups JSON assets by category and selects rotation", () => {
    const onToolChange = vi.fn();
    const onAssetChange = vi.fn();
    const onAssetVariantChange = vi.fn();
    const onAssetRotationChange = vi.fn();
    render(
      <BuildPanel
        layout={layout([])}
        members={[member]}
        tool="asset"
        assetId="chair-office"
        assetVariantId="white"
        assetRotation={90}
        gameSettings={createTestGameSettings()}
        canManageGameSettings={false}
        onToolChange={onToolChange}
        onAssetChange={onAssetChange}
        onAssetVariantChange={onAssetVariantChange}
        onAssetRotationChange={onAssetRotationChange}
        onMoveSelected={vi.fn()}
        onRotateSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
        onUpdateRoom={vi.fn()}
        onUpdateGameSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Seating" }));
    fireEvent.click(screen.getByRole("button", { name: "Office chair" }));
    fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
    fireEvent.click(screen.getByRole("button", { name: /Rotate/ }));

    expect(onToolChange).toHaveBeenCalledWith("asset");
    expect(onAssetChange).toHaveBeenCalledWith("chair-office");
    expect(onAssetVariantChange).toHaveBeenCalledWith("blue");
    expect(onAssetRotationChange).toHaveBeenCalledWith(180);
  });

  it("offers Floor Tile with wood, stone, and grass designs", () => {
    const onAssetChange = vi.fn();
    render(
      <BuildPanel
        layout={layout([])}
        members={[member]}
        tool="asset"
        assetId="floor-tile"
        assetVariantId="wood"
        assetRotation={0}
        gameSettings={createTestGameSettings()}
        canManageGameSettings={false}
        onToolChange={vi.fn()}
        onAssetChange={onAssetChange}
        onAssetVariantChange={vi.fn()}
        onAssetRotationChange={vi.fn()}
        onMoveSelected={vi.fn()}
        onRotateSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
        onUpdateRoom={vi.fn()}
        onUpdateGameSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Surfaces" }));
    fireEvent.click(screen.getByRole("button", { name: "Floor Tile" }));

    expect(onAssetChange).toHaveBeenCalledWith("floor-tile");
    expect(screen.getAllByRole("radio").map((option) => option.textContent)).toEqual(["Wood", "Stone", "Grass"]);
  });

  it("offers Tetris in the equipment build category", () => {
    const onToolChange = vi.fn();
    const onAssetChange = vi.fn();
    render(
      <BuildPanel
        layout={layout([])}
        members={[member]}
        tool={null}
        assetId="desk-straight"
        assetVariantId="sage"
        assetRotation={0}
        gameSettings={createTestGameSettings()}
        canManageGameSettings={false}
        onToolChange={onToolChange}
        onAssetChange={onAssetChange}
        onAssetVariantChange={vi.fn()}
        onAssetRotationChange={vi.fn()}
        onMoveSelected={vi.fn()}
        onRotateSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
        onUpdateRoom={vi.fn()}
        onUpdateGameSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Equipment" }));
    fireEvent.click(screen.getByRole("button", { name: "Tetris table" }));

    expect(onAssetChange).toHaveBeenCalledWith("equipment-tetris");
    expect(onToolChange).toHaveBeenCalledWith("asset");
  });

  it("includes the expanded asset collection", () => {
    render(
      <BuildPanel
        layout={layout([])}
        members={[member]}
        tool={null}
        assetId="desk-straight"
        assetVariantId="sage"
        assetRotation={0}
        gameSettings={createTestGameSettings()}
        canManageGameSettings={false}
        onToolChange={vi.fn()}
        onAssetChange={vi.fn()}
        onAssetVariantChange={vi.fn()}
        onAssetRotationChange={vi.fn()}
        onMoveSelected={vi.fn()}
        onRotateSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
        onUpdateRoom={vi.fn()}
        onUpdateGameSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Tables" }));
    expect(screen.getByRole("button", { name: "Round table" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Decor" }));
    expect(screen.getByRole("button", { name: "Desktop monitor" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Equipment" }));
    expect(screen.getByRole("button", { name: "Bookshelf" })).toBeTruthy();
  });

  it("offers windows and saves room customization with multiple access settings", () => {
    const onUpdateRoom = vi.fn<(roomId: string, settings: RoomSettings) => void>();
    render(
      <BuildPanel
        layout={layout([room("eligible", true)])}
        members={[member]}
        tool={null}
        assetId="desk-straight"
        assetVariantId="sage"
        assetRotation={0}
        gameSettings={createTestGameSettings()}
        canManageGameSettings={false}
        onToolChange={vi.fn()}
        onAssetChange={vi.fn()}
        onAssetVariantChange={vi.fn()}
        onAssetRotationChange={vi.fn()}
        onMoveSelected={vi.fn()}
        onRotateSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
        onUpdateRoom={onUpdateRoom}
        onUpdateGameSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Window" })).toBeTruthy();
    fireEvent.click(screen.getByText("Room eligible"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Apartment 2A" } });
    fireEvent.click(screen.getByLabelText("Alex Morgan"));
    fireEvent.change(screen.getByLabelText("Access"), { target: { value: "assigned" } });
    fireEvent.click(screen.getByLabelText("Allow knocking"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdateRoom).toHaveBeenCalledWith("eligible", {
      name: "Apartment 2A",
      color: "#dce7f7",
      access: { mode: "assigned", assignedPersonIds: ["person-alex"], knockable: true },
    });
  });

  it("disables private access when a detected room has no door", () => {
    render(
      <BuildPanel
        layout={layout([room("open-gap", false)])}
        members={[member]}
        tool={null}
        assetId="desk-straight"
        assetVariantId="sage"
        assetRotation={0}
        gameSettings={createTestGameSettings()}
        canManageGameSettings={false}
        onToolChange={vi.fn()}
        onAssetChange={vi.fn()}
        onAssetVariantChange={vi.fn()}
        onAssetRotationChange={vi.fn()}
        onMoveSelected={vi.fn()}
        onRotateSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
        onUpdateRoom={vi.fn()}
        onUpdateGameSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Room open-gap"));
    const access = screen.getByLabelText("Access");
    expect((within(access).getByRole("option", { name: "Assigned people" }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.getByText("Add a door to make private.")).toBeTruthy();
  });

  it("offers outdoor assets and selected-item controls", () => {
    const onMoveSelected = vi.fn();
    const onRotateSelected = vi.fn();
    const onRemoveSelected = vi.fn();
    const selectedLayout = layout([]);
    selectedLayout.objects = [{
      id: "chair",
      floorId: "floor",
      assetId: "chair-office",
      x: 32,
      y: 32,
      rotation: 0,
      variantId: "white",
    }];

    render(
      <BuildPanel
        layout={selectedLayout}
        members={[member]}
        tool={null}
        assetId="chair-office"
        assetVariantId="white"
        assetRotation={0}
        gameSettings={createTestGameSettings()}
        canManageGameSettings={false}
        selectedItem={{ type: "asset", id: "chair" }}
        onToolChange={vi.fn()}
        onAssetChange={vi.fn()}
        onAssetVariantChange={vi.fn()}
        onAssetRotationChange={vi.fn()}
        onMoveSelected={onMoveSelected}
        onRotateSelected={onRotateSelected}
        onRemoveSelected={onRemoveSelected}
        onUpdateRoom={vi.fn()}
        onUpdateGameSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Outdoor" }));
    expect(screen.getByRole("button", { name: "Pool" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onMoveSelected).toHaveBeenCalledOnce();
    expect(onRotateSelected).toHaveBeenCalledOnce();
    expect(onRemoveSelected).toHaveBeenCalledOnce();
  });
});

function layout(rooms: Room[]): FloorLayout {
  return {
    floorId: "floor",
    revision: 1,
    walls: [],
    openings: [],
    tiles: [],
    objects: [],
    rooms,
  };
}

function room(id: string, privateEligible: boolean): Room {
  return {
    id,
    floorId: "floor",
    name: `Room ${id}`,
    color: "#dce7f7",
    capacity: 4,
    bounds: { x: 32, y: 32, width: 128, height: 128 },
    footprint: [{ x: 32, y: 32, width: 128, height: 128 }],
    boundary: [],
    doorIds: privateEligible ? ["door"] : [],
    windowIds: [],
    privateEligible,
    access: { mode: "open", assignedPersonIds: [], knockable: false },
  };
}
