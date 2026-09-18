import { StrictMode, type ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrganisation } from "@workhard/shared";
import { createTestEconomy, createTestGameSettings } from "../../test-fixtures";
import { GameGuide } from "./GameGuide";

vi.mock("react-joyride", () => ({
  EVENTS: { TOUR_END: "tour:end", TARGET_NOT_FOUND: "error:target_not_found", ERROR: "error" },
  Joyride: ({ onEvent }: { onEvent: (event: { type: string }) => void }) => <div role="dialog" aria-label="Guide">
    <button onClick={() => onEvent({ type: "tour:end" })}>Skip guide</button>
    <button onClick={() => onEvent({ type: "error:target_not_found" })}>Missing target</button>
  </div>,
}));

function fixture(): ComponentProps<typeof GameGuide> {
  return {
    data: { currentUserId: "player", layouts: [], economy: createTestEconomy(), organisation: createOrganisation(), gameSettings: createTestGameSettings() },
    floorId: "floor", grantedRoomIds: new Set(), unavailable: undefined,
    onStart: vi.fn(), onNavigate: vi.fn(), onFinish: vi.fn(),
  };
}

function nextFrame() {
  act(() => vi.advanceTimersByTime(20));
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Automatic game guide", () => {
  it("starts once in Strict Mode and remembers skipping across remounts while allowing replay", () => {
    const props = fixture();
    const view = render(<StrictMode><GameGuide {...props} /></StrictMode>);
    nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
    expect(props.onFinish).toHaveBeenCalledTimes(1);
    view.unmount();
    render(<GameGuide {...props} />);
    nextFrame();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    expect(props.onStart).toHaveBeenCalledTimes(2);
  });

  it.each(["Reconnect to start the guide.", "Close your activity before starting the guide.", "Finish building before starting the guide.", "Close this panel before starting the guide."])("waits while unavailable: %s", unavailable => {
    const props = fixture();
    const view = render(<GameGuide {...props} unavailable={unavailable} />);
    nextFrame();
    expect(props.onStart).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    view.rerender(<GameGuide {...props} />);
    nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(1);
    view.rerender(<GameGuide {...props} unavailable={unavailable} />);
    expect(props.onFinish).toHaveBeenCalledTimes(1);
    view.rerender(<GameGuide {...props} />);
    nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancels startup if the guide becomes unavailable or unmounts before the next frame", () => {
    const props = fixture();
    const view = render(<GameGuide {...props} />);
    view.rerender(<GameGuide {...props} unavailable="Busy" />);
    nextFrame();
    expect(props.onStart).not.toHaveBeenCalled();
    view.rerender(<GameGuide {...props} />);
    view.unmount();
    nextFrame();
    expect(props.onStart).not.toHaveBeenCalled();
  });

  it("does not start twice when manual replay wins the startup race", () => {
    const props = fixture();
    render(<GameGuide {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onFinish).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("remembers each player and server independently", () => {
    const props = fixture();
    const view = render(<GameGuide {...props} />);
    nextFrame();
    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
    view.rerender(<GameGuide {...props} data={{ ...props.data, currentUserId: "other-player" }} />);
    nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
    view.rerender(<GameGuide {...props} />);
    nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(2);
    localStorage.setItem("northstar.serverOrigin", "https://other.example.test");
    view.rerender(<GameGuide {...props} />);
    nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(3);
  });

  it("keeps storage failures from blocking startup or dismissal", () => {
    const props = fixture();
    const originalGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (key.startsWith("game-guide:")) throw new DOMException("Blocked", "SecurityError");
      return originalGetItem.call(this, key);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const view = render(<GameGuide {...props} />);
    nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
    view.rerender(<GameGuide {...props} unavailable="Offline" />);
    view.rerender(<GameGuide {...props} />);
    nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("recovers from a missing target without repeatedly starting", () => {
    const props = fixture();
    const view = render(<GameGuide {...props} />);
    nextFrame();
    fireEvent.click(screen.getByRole("button", { name: "Missing target" }));
    expect(screen.getByRole("alert").textContent).toContain("Try How to play again");
    view.rerender(<GameGuide {...props} unavailable="Offline" />);
    view.rerender(<GameGuide {...props} />);
    nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(props.onStart).toHaveBeenCalledTimes(2);
  });
});
