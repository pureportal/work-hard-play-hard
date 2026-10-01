import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getAssetDefinition, getDefaultAssetVariantId } from "@workhard/shared";
import { useState } from "react";
import type { FloorLayout, LayoutTool, Room } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildPanel } from "./BuildPanel";

afterEach(cleanup);

describe("BuildPanel", () => {
  it("selects layout tools with the numbered shortcuts", () => {
    const onToolChange = vi.fn();
    render(<BuildPanel layout={layout([])} tool={null} assetId="floor-wood" assetVariantId="oak" assetRotation={0}
      onToolChange={onToolChange} onAssetChange={vi.fn()} onAssetVariantChange={vi.fn()} onAssetRotationChange={vi.fn()}
      onMoveSelected={vi.fn()} onRotateSelected={vi.fn()} onRemoveSelected={vi.fn()} onOpenRooms={vi.fn()} onClose={vi.fn()} />);

    const shortcuts: [string, LayoutTool | null, string][] = [
      ["1", null, "Select"], ["2", "wall", "Wall"], ["3", "door", "Door"],
      ["4", "window", "Window"], ["5", "spawn", "Start point"], ["6", "erase", "Erase"],
    ];
    for (const [key, tool, label] of shortcuts) {
      expect(screen.getByRole("button", { name: label }).getAttribute("aria-keyshortcuts")).toBe(key);
      fireEvent.keyDown(window, { key });
      expect(onToolChange).toHaveBeenLastCalledWith(tool);
    }
    expect(onToolChange).toHaveBeenCalledTimes(shortcuts.length);
  });

  it("ignores tool shortcuts while typing, in dialogs, and when editing is disabled", () => {
    const onToolChange = vi.fn();
    const props = { layout: layout([]), tool: null, assetId: "floor-wood", assetVariantId: "oak", assetRotation: 0 as const,
      onToolChange, onAssetChange: vi.fn(), onAssetVariantChange: vi.fn(), onAssetRotationChange: vi.fn(),
      onMoveSelected: vi.fn(), onRotateSelected: vi.fn(), onRemoveSelected: vi.fn(), onOpenRooms: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<BuildPanel {...props} />);

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search assets" }), { key: "6" });
    fireEvent.keyDown(window, { key: "6", ctrlKey: true });
    fireEvent.keyDown(window, { key: "6", repeat: true });
    expect(onToolChange).not.toHaveBeenCalled();

    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
    fireEvent.keyDown(window, { key: "6" });
    dialog.remove();
    expect(onToolChange).not.toHaveBeenCalled();

    rerender(<BuildPanel {...props} disabled />);
    fireEvent.keyDown(window, { key: "6" });
    expect(onToolChange).not.toHaveBeenCalled();
  });

  it("collapses the item picker after choosing a mobile tool", () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      const { container } = render(<BuildPanel layout={layout([])} tool={null} assetId="floor-wood" assetVariantId="oak" assetRotation={0}
        onToolChange={vi.fn()} onAssetChange={vi.fn()} onAssetVariantChange={vi.fn()} onAssetRotationChange={vi.fn()}
        onMoveSelected={vi.fn()} onRotateSelected={vi.fn()} onRemoveSelected={vi.fn()} onOpenRooms={vi.fn()} onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Wall" }));
      expect(container.querySelector(".build-layout-panel")?.getAttribute("data-compact")).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "Show items" }));
      expect(container.querySelector(".build-layout-panel")?.getAttribute("data-compact")).toBe("false");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
    }
  });
  it("keeps placement active when switching directly between assets", () => {
    function Panel() {
      const [tool, setTool] = useState<LayoutTool | null>(null);
      const [assetId, setAssetId] = useState("floor-wood");
      const [variantId, setVariantId] = useState("oak");

      return <BuildPanel layout={layout([])} tool={tool} assetId={assetId} assetVariantId={variantId} assetRotation={0}
        onToolChange={(nextTool) => setTool((current) => nextTool === current ? null : nextTool)}
        onAssetChange={(nextAssetId) => {
          setAssetId(nextAssetId);
          setVariantId(getDefaultAssetVariantId(getAssetDefinition(nextAssetId)!));
        }} onAssetVariantChange={setVariantId} onAssetRotationChange={vi.fn()}
        onMoveSelected={vi.fn()} onRotateSelected={vi.fn()} onRemoveSelected={vi.fn()}
        onOpenRooms={vi.fn()} onClose={vi.fn()} />;
    }

    render(<Panel />);
    fireEvent.click(screen.getByRole("tab", { name: "Floor types" }));
    fireEvent.click(screen.getByRole("button", { name: "Parquet" }));
    expect(screen.getByRole("button", { name: "Parquet" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Wood" }));
    expect(screen.getByRole("button", { name: "Wood" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Wood" }));
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("searches across categories and restores the catalog after clearing filters", () => {
    render(<BuildPanel layout={layout([])} tool={null} assetId="chair-office" assetVariantId="white" assetRotation={0}
      onToolChange={vi.fn()} onAssetChange={vi.fn()} onAssetVariantChange={vi.fn()}
      onAssetRotationChange={vi.fn()} onMoveSelected={vi.fn()} onRotateSelected={vi.fn()} onRemoveSelected={vi.fn()}
      onOpenRooms={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search assets" }), { target: { value: "parquet" } });
    expect(screen.getByRole("tab", { name: "All" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Parquet" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Wood" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Rarity" }), { target: { value: "legendary" } });
    expect(screen.getByRole("status").textContent).toBe("No assets match.");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("button", { name: "Parquet" })).toBeTruthy();
  });

  it("shows the expanding teleporter price, warns about permanence, and only offers movement for a placed teleporter", () => {
    const next = layout([]);
    next.objects.push({ id: "portal", floorId: next.floorId, assetId: "infrastructure-portal", variantId: "violet", rotation: 0, x: 0, y: 0, label: "2" });
    const onMoveSelected = vi.fn();
    render(<BuildPanel floorCount={3} layout={next} tool="asset" assetId="infrastructure-portal" assetVariantId="violet" assetRotation={0}
      selectedItem={{ type: "asset", id: "portal" }} onToolChange={vi.fn()} onAssetChange={vi.fn()} onAssetVariantChange={vi.fn()}
      onAssetRotationChange={vi.fn()} onMoveSelected={onMoveSelected} onRotateSelected={vi.fn()} onRemoveSelected={vi.fn()}
      onOpenRooms={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Teleporter" }).getAttribute("aria-description")).toContain("90000 coins");
    expect(screen.getByText("Creates a new floor. Cannot be removed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(onMoveSelected).toHaveBeenCalledOnce();
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
  });

  it("fills a selected room with the chosen tile mode and rotation option", () => {
    const rooms: Room[] = ["Studio", "Lounge"].map((name, index) => ({
      id: name.toLowerCase(), floorId: "floor", name, color: "#ffffff", capacity: 4,
      bounds: { x: index * 128, y: 0, width: 128, height: 128 },
      footprint: [{ x: index * 128, y: 0, width: 128, height: 128 }],
      boundary: [], doorIds: [], windowIds: [], privateEligible: false,
      access: { mode: "open", assignedPersonIds: [], knockable: false },
    }));
    const onFillRoom = vi.fn();
    render(<BuildPanel layout={layout(rooms)} tool="asset" assetId="floor-wood" assetVariantId="oak" assetRotation={90}
      currentRoomId="lounge" fillableRoomIds={rooms.map((room) => room.id)} onFillRoom={onFillRoom}
      onToolChange={vi.fn()} onAssetChange={vi.fn()} onAssetVariantChange={vi.fn()} onAssetRotationChange={vi.fn()}
      onMoveSelected={vi.fn()} onRotateSelected={vi.fn()} onRemoveSelected={vi.fn()} onOpenRooms={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Fill room with tiles" }));
    expect(onFillRoom).toHaveBeenLastCalledWith({ tool: "room.fill_tiles", roomId: "lounge", assetId: "floor-wood",
      variantId: "oak", mode: "keep", rotation: 90, randomRotation: false });
    fireEvent.change(screen.getByRole("combobox", { name: "Room" }), { target: { value: "studio" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Existing tiles" }), { target: { value: "replace" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Randomize tile rotation" }));
    fireEvent.click(screen.getByRole("button", { name: "Fill room with tiles" }));
    expect(onFillRoom).toHaveBeenLastCalledWith({ tool: "room.fill_tiles", roomId: "studio", assetId: "floor-wood",
      variantId: "oak", mode: "replace", rotation: 90, randomRotation: true });
  });


  it.each([false, true])("offers selected-item controls and stores personal property: %s", (personal) => {
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
      ...(personal ? { ownerUserId: "player" } : {}),
    }];

    render(
      <BuildPanel
        currentUserId="player"
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

    fireEvent.click(screen.getByRole("tab", { name: "Floor types" }));
    expect(screen.getByRole("button", { name: "Parquet" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate" }));
    fireEvent.click(screen.getByRole("button", { name: personal ? "Store" : "Remove" }));

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
