import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { getAssetDefinition, getDefaultAssetVariantId } from "@workhard/shared";
import { useState } from "react";
import type { FloorLayout, LayoutTool, Room } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildPanel } from "./BuildPanel";

afterEach(cleanup);

describe("BuildPanel", () => {
  it("keeps placement active when switching directly between assets", () => {
    function Panel() {
      const [tool, setTool] = useState<LayoutTool | null>(null);
      const [assetId, setAssetId] = useState("desk-straight");
      const [variantId, setVariantId] = useState("sage");

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
    fireEvent.click(screen.getByRole("tab", { name: "Seating" }));
    fireEvent.click(screen.getByRole("button", { name: "Office chair" }));
    expect(screen.getByRole("button", { name: "Office chair" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Lounge chair" }));
    expect(screen.getByRole("button", { name: "Lounge chair" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Lounge chair" }));
    expect(screen.getByRole("button", { name: "Select" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("marks animated and interactive assets and filters each feature", () => {
    const { container } = render(<BuildPanel layout={layout([])} tool={null} assetId="desk-straight" assetVariantId="sage" assetRotation={0}
      onToolChange={vi.fn()} onAssetChange={vi.fn()} onAssetVariantChange={vi.fn()}
      onAssetRotationChange={vi.fn()} onMoveSelected={vi.fn()} onRotateSelected={vi.fn()} onRemoveSelected={vi.fn()}
      onOpenRooms={vi.fn()} onClose={vi.fn()} />);

    const cards = () => [...container.querySelectorAll<HTMLButtonElement>(".asset-browser-results button[data-rarity]")];
    const card = (name: string) => cards().find((button) => button.getAttribute("aria-label") === name);
    expect(card("Wind chimes")?.querySelector('[title="Animated"]')).toBeTruthy();
    expect(card("Wind chimes")?.querySelector('[title="Interactive"]')).toBeNull();
    expect(card("Celebration gong")?.querySelector('[title="Interactive"]')).toBeTruthy();
    expect(card("Fortune dispenser")?.querySelector('[title="Interactive"]')).toBeTruthy();
    expect(card("Straight desk")?.querySelector(".asset-feature-indicators")).toBeNull();
    expect(container.querySelectorAll('[title="Animated"]')).toHaveLength(9);
    expect(container.querySelectorAll('[title="Interactive"]')).toHaveLength(43);

    fireEvent.click(screen.getByRole("button", { name: "Animated" }));
    expect(screen.getByRole("button", { name: "Animated" }).getAttribute("aria-pressed")).toBe("true");
    expect(cards().map((button) => button.getAttribute("aria-label"))).toEqual([
      "Pool", "Garden fountain", "Koi pond", "Wind chimes", "Desk pinwheel", "Kinetic mobile", "Jellyfish lamp", "Balancing bird", "Garden windmill",
    ]);
    expect(card("Celebration gong")).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Interactive" }));
    expect(screen.getByRole("button", { name: "Interactive" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Animated" }).getAttribute("aria-pressed")).toBe("false");
    const interactiveCards = cards();
    expect(interactiveCards).toHaveLength(43);
    expect(interactiveCards.every((button) => button.querySelector('[title="Interactive"]'))).toBe(true);
    for (const name of ["Office chair", "Whiteboard", "Checklist", "PR tray", "Celebration gong", "Falling Blocks table", "Teleporter", "Fortune dispenser"]) {
      expect(card(name)).toBeTruthy();
    }
    expect(card("Straight desk")).toBeUndefined();
    expect(card("Wind chimes")).toBeUndefined();
  });

  it("searches across categories and restores the catalog after clearing filters", () => {
    render(<BuildPanel layout={layout([])} tool={null} assetId="chair-office" assetVariantId="white" assetRotation={0}
      onToolChange={vi.fn()} onAssetChange={vi.fn()} onAssetVariantChange={vi.fn()}
      onAssetRotationChange={vi.fn()} onMoveSelected={vi.fn()} onRotateSelected={vi.fn()} onRemoveSelected={vi.fn()}
      onOpenRooms={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search assets" }), { target: { value: "crystal" } });
    expect(screen.getByRole("tab", { name: "All" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Crystal floor lamp" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Office chair" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Rarity" }), { target: { value: "common" } });
    expect(screen.getByRole("status").textContent).toBe("No assets match.");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("button", { name: "Office chair" })).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "Crystal floor lamp" }).getAttribute("aria-description")).toBe("Legendary \u00b7 1650 coins");

    const lightingTab = screen.getByRole("tab", { name: "Lighting" });
    fireEvent.keyDown(lightingTab, { key: "End" });
    const lastTab = screen.getByRole("tab", { name: "Infrastructure" });
    expect(lastTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(lastTab);
    fireEvent.keyDown(lastTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "All" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(lastTab);
    fireEvent.keyDown(lastTab, { key: "Home" });
    expect(screen.getByRole("tab", { name: "All" }).getAttribute("aria-selected")).toBe("true");
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
