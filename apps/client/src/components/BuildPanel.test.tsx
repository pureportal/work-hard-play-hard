import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { FloorLayout, Room } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildPanel } from "./BuildPanel";

afterEach(cleanup);

describe("BuildPanel", () => {
  it("groups JSON assets by category and selects rotation", () => {
    const onToolChange = vi.fn();
    const onAssetChange = vi.fn();
    const onAssetVariantChange = vi.fn();
    const onAssetRotationChange = vi.fn();
    render(
      <BuildPanel
        layout={layout([])}
        tool="asset"
        assetId="chair-office"
        assetVariantId="white"
        assetRotation={90}
        onToolChange={onToolChange}
        onAssetChange={onAssetChange}
        onAssetVariantChange={onAssetVariantChange}
        onAssetRotationChange={onAssetRotationChange}
        onMoveSelected={vi.fn()}
        onRotateSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
        onInspectAccess={vi.fn()}
        onOpenRooms={vi.fn()}
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

    fireEvent.change(screen.getByRole("combobox", { name: "Rarity" }), { target: { value: "legendary" } });
    fireEvent.click(screen.getByRole("tab", { name: "Lighting" }));
    expect(screen.queryByRole("button", { name: "Drum floor lamp" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Crystal floor lamp" }));
    expect(onAssetChange).toHaveBeenCalledWith("light-crystal");
    fireEvent.change(screen.getByRole("combobox", { name: "Rarity" }), { target: { value: "all" } });
    const lighting = screen.getByRole("tabpanel", { name: "Lighting" });
    expect(within(lighting).getAllByRole("button").filter((button) => button.hasAttribute("data-rarity")).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Drum floor lamp", "Paper lantern", "Stone lantern", "Tripod lamp", "Mushroom lamp", "Tulip lamp", "Cage lamp", "Studio spotlight", "Arc floor lamp", "Crystal floor lamp",
    ]);
    expect(screen.getByRole("button", { name: "Crystal floor lamp" }).getAttribute("aria-description")).toBe("Legendary \u00b7 1100 coins");

    const lightingTab = screen.getByRole("tab", { name: "Lighting" });
    fireEvent.keyDown(lightingTab, { key: "End" });
    const lastTab = screen.getByRole("tab", { name: "Infrastructure" });
    expect(lastTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(lastTab);
    fireEvent.keyDown(lastTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Desks" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(lastTab);
    fireEvent.keyDown(lastTab, { key: "Home" });
    expect(screen.getByRole("tab", { name: "Desks" }).getAttribute("aria-selected")).toBe("true");
  });

  it("offers separate flooring materials and parquet layouts", () => {
    const onAssetChange = vi.fn();
    render(
      <BuildPanel
        layout={layout([])}
        tool="asset"
        assetId="floor-parquet"
        assetVariantId="herringbone"
        assetRotation={0}
        onToolChange={vi.fn()}
        onAssetChange={onAssetChange}
        onAssetVariantChange={vi.fn()}
        onAssetRotationChange={vi.fn()}
        onMoveSelected={vi.fn()}
        onRotateSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
        onInspectAccess={vi.fn()}
        onOpenRooms={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Floor types" }));
    fireEvent.click(screen.getByRole("button", { name: "Parquet" }));

    expect(onAssetChange).toHaveBeenCalledWith("floor-parquet");
    expect(screen.getAllByRole("radio").map((option) => option.textContent)).toEqual(["Herringbone", "Chevron", "Basketweave"]);
    expect(screen.getByRole("button", { name: "Ceramic tiles" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Natural grass" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Woven rug" })).toBeNull();
    expect(screen.getByRole("radiogroup").closest('[role="tabpanel"]')).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Floor decor" }));
    expect(screen.getByRole("button", { name: "Woven rug" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Parquet" })).toBeNull();
  });

  it("offers Falling Blocks in the equipment build category", () => {
    const onToolChange = vi.fn();
    const onAssetChange = vi.fn();
    render(
      <BuildPanel
        layout={layout([])}
        tool={null}
        assetId="desk-straight"
        assetVariantId="sage"
        assetRotation={0}
        onToolChange={onToolChange}
        onAssetChange={onAssetChange}
        onAssetVariantChange={vi.fn()}
        onAssetRotationChange={vi.fn()}
        onMoveSelected={vi.fn()}
        onRotateSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
        onInspectAccess={vi.fn()}
        onOpenRooms={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Equipment" }));
    fireEvent.click(screen.getByRole("button", { name: "Falling Blocks table" }));

    expect(onAssetChange).toHaveBeenCalledWith("equipment-falling-blocks");
    expect(onToolChange).toHaveBeenCalledWith("asset");
  });

  it("includes the expanded asset collection", () => {
    render(
      <BuildPanel
        layout={layout([])}
        tool={null}
        assetId="desk-straight"
        assetVariantId="sage"
        assetRotation={0}
        onToolChange={vi.fn()}
        onAssetChange={vi.fn()}
        onAssetVariantChange={vi.fn()}
        onAssetRotationChange={vi.fn()}
        onMoveSelected={vi.fn()}
        onRotateSelected={vi.fn()}
        onRemoveSelected={vi.fn()}
        onInspectAccess={vi.fn()}
        onOpenRooms={vi.fn()}
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
        tool={null}
        assetId="chair-office"
        assetVariantId="white"
        assetRotation={0}
        selectedItem={{ type: "asset", id: "chair" }}
        onToolChange={vi.fn()}
        onAssetChange={vi.fn()}
        onAssetVariantChange={vi.fn()}
        onAssetRotationChange={vi.fn()}
        onMoveSelected={onMoveSelected}
        onRotateSelected={onRotateSelected}
        onRemoveSelected={onRemoveSelected}
        onInspectAccess={vi.fn()}
        onOpenRooms={vi.fn()}
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
