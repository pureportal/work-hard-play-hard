import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Floor } from "@workhard/shared";
import { TopBar } from "./TopBar";

const floor: Floor = {
  id: "floor-one",
  officeId: "office-one",
  name: "Studio",
  level: 1,
  width: 1_000,
  height: 800,
  spawn: { x: 100, y: 100 },
  background: "#fff",
};

describe("TopBar connection status", () => {
  it("keeps the full floor name available to the native picker and visual label", () => {
    const view = render(
      <TopBar
        officeName="Office"
        floors={[floor]}
        floorId={floor.id}
        connection="online"
        onFloorChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Floor").textContent).toContain("1 · Studio");
    expect(view.container.querySelector(".floor-picker-value")?.textContent).toBe("1 ·Studio");
  });

  it("shows a compact Connection Lost icon with an accessible tooltip", () => {
    const view = render(
      <TopBar
        officeName="Office"
        floors={[floor]}
        floorId={floor.id}
        connection="offline"
        onFloorChange={vi.fn()}
      />,
    );

    const indicator = screen.getByRole("img", { name: "Connection Lost" });
    expect(indicator.getAttribute("tabindex")).toBe("0");
    expect(within(indicator).getByRole("tooltip").textContent).toBe("Connection Lost");

    view.rerender(
      <TopBar
        officeName="Office"
        floors={[floor]}
        floorId={floor.id}
        connection="online"
        onFloorChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("img", { name: "Connection Lost" })).toBeNull();
  });

  it("switches between dark and light modes", () => {
    const onColorThemeChange = vi.fn();
    render(
      <TopBar
        officeName="Office"
        floors={[floor]}
        floorId={floor.id}
        connection="online"
        colorTheme="dark"
        onColorThemeChange={onColorThemeChange}
        onFloorChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Use light mode" }));

    expect(onColorThemeChange).toHaveBeenCalledWith("light");
  });
});
