import { DEFAULT_CHARACTER_APPEARANCE, type Floor, type FloorLayout, type Member, type PlayerRoomAccessibility } from "@workhard/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomAccessibilityPanel } from "./RoomAccessibilityPanel";

afterEach(cleanup);

describe("RoomAccessibilityPanel", () => {
  it("shows the selected player's server results across floors, including capacity", () => {
    const onPlayerChange = vi.fn();
    render(<RoomAccessibilityPanel {...props()} onPlayerChange={onPlayerChange} />);
    const studio = screen.getByRole("region", { name: "Studio" });
    expect(within(studio).getByText("Private room").closest("li")!.textContent).toContain("Can enter");
    const rooftop = screen.getByRole("region", { name: "Rooftop" });
    expect(within(rooftop).getByText("Lounge").closest("li")!.textContent).toContain("No access");
    expect(within(rooftop).getByText("Meeting room").closest("li")!.textContent).toContain("Full");
    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "builder" } });
    expect(onPlayerChange).toHaveBeenCalledWith("builder");
  });

  it("hides stale results while switching players and reconnecting", () => {
    const { rerender } = render(<RoomAccessibilityPanel {...props()} />);
    rerender(<RoomAccessibilityPanel {...props()} selectedUserId="builder" />);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect(screen.queryByText("Can enter")).toBeNull();
    rerender(<RoomAccessibilityPanel {...props()} connected={false} />);
    expect(screen.getByRole("status").textContent).toBe("Reconnecting…");
    expect(screen.queryByText("Can enter")).toBeNull();
  });
});

function props() {
  const members: Member[] = ["builder", "player"].map((id) => ({
    id, name: id, initials: id[0]!, character: { ...DEFAULT_CHARACTER_APPEARANCE },
    email: `${id}@example.test`, title: "", role: "member", permissions: id === "builder" ? ["build"] : [],
    color: "#123456", availability: "available", online: true,
  }));
  const floors: Floor[] = ["Studio", "Rooftop"].map((name, level) => ({ id: name, name, level, officeId: "office", width: 512, height: 512, spawn: { x: 64, y: 64 }, background: "#ffffff" }));
  const layouts: FloorLayout[] = floors.map((floor, index) => ({
    floorId: floor.id, revision: 1, walls: [], openings: [], tiles: [], objects: [],
    rooms: (index === 0 ? ["Private room"] : ["Lounge", "Meeting room"]).map((name) => ({
      id: name, name, floorId: floor.id, color: "#ffffff", capacity: 2,
      bounds: { x: 64, y: 64, width: 128, height: 128 }, footprint: [{ x: 64, y: 64, width: 128, height: 128 }],
      boundary: [], doorIds: [], windowIds: [], privateEligible: true,
      access: { mode: "assigned", assignedPersonIds: ["builder"], knockable: true },
    })),
  }));
  const accessibility: PlayerRoomAccessibility = { userId: "player", floors: [
    { floorId: "Studio", rooms: [{ roomId: "Private room", status: "accessible" }] },
    { floorId: "Rooftop", rooms: [{ roomId: "Lounge", status: "restricted" }, { roomId: "Meeting room", status: "full" }] },
  ] };
  return { members, floors, layouts, accessibility, selectedUserId: "player", connected: true, onPlayerChange: vi.fn(), onBack: vi.fn(), onClose: vi.fn() };
}
