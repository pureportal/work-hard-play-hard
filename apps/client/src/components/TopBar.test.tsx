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

  it("keeps the connection message visible until the workspace reconnects", () => {
    const view = render(
      <TopBar
        officeName="Office"
        floors={[floor]}
        floorId={floor.id}
        connection="offline"
        onFloorChange={vi.fn()}
      />,
    );

    expect(document.querySelector(".connection-notice")?.textContent).toBe("Connection unavailable");
    expect(within(view.container).getByRole("status").textContent).toBe("Connection unavailable");

    view.rerender(
      <TopBar
        officeName="Office"
        floors={[floor]}
        floorId={floor.id}
        connection="connecting"
        onFloorChange={vi.fn()}
      />,
    );
    expect(document.querySelector(".connection-notice")?.textContent).toBe("Connecting…");

    view.rerender(
      <TopBar
        officeName="Office"
        floors={[floor]}
        floorId={floor.id}
        connection="online"
        onFloorChange={vi.fn()}
      />,
    );
    expect(document.querySelector(".connection-notice")).toBeNull();
    expect(within(view.container).getByRole("status").textContent).toBe("Connected");
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
