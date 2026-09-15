import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FallingBlocksControls } from "./FallingBlocksControls";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("PointerEvent", MouseEvent);
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Falling Blocks touch controls", () => {
  it("repeats a held direction while rotating, keeps the latest handler, and stops on release", () => {
    const first = vi.fn();
    const next = vi.fn();
    const result = render(<FallingBlocksControls id="controls" paused={false} canHold multiplayer onCommand={first} />);
    const left = screen.getByRole("button", { name: "Move left" });
    fireEvent.pointerDown(left, { button: 0, pointerId: 1 });
    expect(first).toHaveBeenCalledWith("left");
    result.rerender(<FallingBlocksControls id="controls" paused={false} canHold multiplayer onCommand={next} />);
    const rotate = screen.getByRole("button", { name: "Rotate counterclockwise" });
    fireEvent.pointerDown(rotate, { button: 0, pointerId: 2 });
    fireEvent.pointerUp(rotate, { pointerId: 2 });
    act(() => vi.advanceTimersByTime(143));
    fireEvent.pointerUp(left, { pointerId: 1 });
    expect(next.mock.calls.map(([command]) => command)).toEqual(["rotate-counterclockwise", "left", "left"]);
    act(() => vi.advanceTimersByTime(500));
    expect(next).toHaveBeenCalledTimes(3);
  });

  it.each(["cancel", "blur", "hide", "pause", "unmount"])("stops held soft drop on %s", (event) => {
    const onCommand = vi.fn();
    const result = render(<FallingBlocksControls id="controls" paused={false} canHold multiplayer onCommand={onCommand} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Soft drop" }), { button: 0 });
    act(() => vi.advanceTimersByTime(80));
    expect(onCommand).toHaveBeenCalledTimes(3);
    if (event === "cancel") fireEvent.pointerCancel(screen.getByRole("button", { name: "Soft drop" }));
    if (event === "blur") fireEvent.blur(window);
    if (event === "hide") fireEvent(document, new Event("visibilitychange"));
    if (event === "pause") result.rerender(<FallingBlocksControls id="controls" paused canHold multiplayer onCommand={onCommand} />);
    if (event === "unmount") result.unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(onCommand).toHaveBeenCalledTimes(3);
  });

  it("sends a single hard drop for a touch and its generated click, and supports keyboard activation", () => {
    const onCommand = vi.fn();
    render(<FallingBlocksControls id="controls" paused={false} canHold multiplayer onCommand={onCommand} />);
    const drop = screen.getByRole("button", { name: "Drop" });
    fireEvent.pointerDown(drop, { button: 0 });
    fireEvent.pointerUp(drop);
    fireEvent.click(drop, { detail: 1 });
    act(() => vi.advanceTimersByTime(1000));
    expect(onCommand).toHaveBeenCalledTimes(1);
    fireEvent.click(drop, { detail: 0 });
    expect(onCommand).toHaveBeenCalledTimes(2);
  });

  it("disables gameplay while paused and offers resume only in solo", () => {
    const onCommand = vi.fn();
    render(<FallingBlocksControls id="controls" paused canHold={false} multiplayer={false} onCommand={onCommand} />);
    expect(screen.getByRole("button", { name: "Hold" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Drop" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onCommand).toHaveBeenCalledWith("pause");
  });
});
