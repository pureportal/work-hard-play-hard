import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthWorldPreview } from "./AuthWorldPreview";

vi.mock("./CharacterPreview", () => ({
  CharacterPreview: ({ motion, direction }: { motion: string; direction: string }) =>
    <span data-testid="preview-character" data-motion={motion} data-direction={direction} />,
}));

beforeEach(() => vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false }))));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("auth world preview", () => {
  it("wanders on its own until a visitor explores", () => {
    vi.useFakeTimers();
    const { container } = render(<AuthWorldPreview />);
    act(() => vi.advanceTimersByTime(2600));
    expect(container.querySelector<HTMLElement>(".auth-preview-player")?.style.left).toBe("33%");
    expect(screen.getByTestId("preview-character").dataset.motion).toBe("walk");
    act(() => vi.advanceTimersByTime(420));
    expect(screen.getByTestId("preview-character").dataset.motion).toBe("idle");
    fireEvent.click(screen.getByRole("button", { name: "Explore the office" }), { detail: 0 });
    act(() => vi.advanceTimersByTime(5000));
    expect(container.querySelector<HTMLElement>(".auth-preview-player")?.style.left).toBe("36%");
  });

  it("walks toward a clicked point, then returns to idle", () => {
    vi.useFakeTimers();
    const { container } = render(<AuthWorldPreview />);
    const preview = screen.getByRole("button", { name: "Explore the office" });
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 500, height: 400 } as DOMRect);

    fireEvent.click(preview, { clientX: 400, clientY: 240, detail: 1 });
    const player = container.querySelector<HTMLElement>(".auth-preview-player");
    expect(player?.style.left).toBe("80%");
    expect(player?.style.top).toBe("60%");
    expect(screen.getByTestId("preview-character").dataset.motion).toBe("walk");
    expect(screen.getByTestId("preview-character").dataset.direction).toBe("right");

    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByTestId("preview-character").dataset.motion).toBe("idle");
  });

  it("supports keyboard activation and keeps the destination inside the scene", () => {
    const { container } = render(<AuthWorldPreview />);
    const preview = screen.getByRole("button", { name: "Explore the office" });
    fireEvent.click(preview, { detail: 0 });
    expect(container.querySelector<HTMLElement>(".auth-preview-player")?.style.left).toBe("36%");
    fireEvent.click(preview, { detail: 0 });
    expect(container.querySelector<HTMLElement>(".auth-preview-player")?.style.left).toBe("70%");

    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 500, height: 400 } as DOMRect);
    fireEvent.click(preview, { clientX: 999, clientY: 999, detail: 1 });
    expect(container.querySelector<HTMLElement>(".auth-preview-player")?.style.left).toBe("80%");
    expect(container.querySelector<HTMLElement>(".auth-preview-player")?.style.top).toBe("78%");
  });
});
