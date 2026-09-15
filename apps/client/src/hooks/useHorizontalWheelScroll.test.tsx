import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useHorizontalWheelScroll } from "./useHorizontalWheelScroll";

afterEach(cleanup);

function Strip({ visible = true }: { visible?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const scroll = useHorizontalWheelScroll(element);
  return visible ? <div ref={scroll} role="tablist"><button role="tab">Category</button></div> : null;
}

function setDimensions(element: HTMLElement, width = 300, contentWidth = 900, contentHeight = 50) {
  let left = 0;
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: width },
    scrollWidth: { configurable: true, value: contentWidth },
    clientHeight: { configurable: true, value: 50 },
    scrollHeight: { configurable: true, value: contentHeight },
    scrollLeft: { configurable: true, get: () => left, set: (value: number) => { left = Math.max(0, Math.min(contentWidth - width, value)); } },
  });
}

function wheel(options: WheelEventInit = {}) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100, ...options });
  fireEvent(screen.getByRole("tab"), event);
  return event;
}

describe("useHorizontalWheelScroll", () => {
  it("scrolls a strip both ways using the mouse wheel over a tab", () => {
    render(<Strip />);
    const strip = screen.getByRole("tablist");
    setDimensions(strip);
    expect(wheel().defaultPrevented).toBe(true);
    expect(strip.scrollLeft).toBe(100);
    expect(wheel({ deltaY: -40 }).defaultPrevented).toBe(true);
    expect(strip.scrollLeft).toBe(60);
  });

  it.each([{ deltaMode: WheelEvent.DOM_DELTA_LINE, deltaY: 3, expected: 48 }, { deltaMode: WheelEvent.DOM_DELTA_PAGE, deltaY: 1, expected: 300 }])(
    "handles wheel delta mode $deltaMode", ({ deltaMode, deltaY, expected }) => {
      render(<Strip />);
      const strip = screen.getByRole("tablist");
      setDimensions(strip);
      wheel({ deltaMode, deltaY });
      expect(strip.scrollLeft).toBe(expected);
    },
  );

  it.each([{ deltaX: 40 }, { ctrlKey: true }, { shiftKey: true }, { deltaY: 0 }])("preserves native gestures %j", (options) => {
    render(<Strip />);
    const strip = screen.getByRole("tablist");
    setDimensions(strip);
    expect(wheel(options).defaultPrevented).toBe(false);
    expect(strip.scrollLeft).toBe(0);
  });

  it("lets the parent scroll at either end of the strip", () => {
    render(<Strip />);
    const strip = screen.getByRole("tablist");
    setDimensions(strip);
    expect(wheel({ deltaY: -100 }).defaultPrevented).toBe(false);
    wheel({ deltaY: 1000 });
    expect(strip.scrollLeft).toBe(600);
    expect(wheel().defaultPrevented).toBe(false);
  });

  it("preserves vertical scrolling when the strip fits or has vertical overflow", () => {
    render(<Strip />);
    const strip = screen.getByRole("tablist");
    setDimensions(strip, 900);
    expect(wheel().defaultPrevented).toBe(false);
    setDimensions(strip, 300, 900, 200);
    expect(wheel().defaultPrevented).toBe(false);
    expect(strip.scrollLeft).toBe(0);
  });

  it("attaches to conditionally mounted strips and removes the old listener", () => {
    const view = render(<Strip visible={false} />);
    view.rerender(<Strip />);
    const strip = screen.getByRole("tablist");
    setDimensions(strip);
    wheel();
    expect(strip.scrollLeft).toBe(100);
    view.rerender(<Strip visible={false} />);
    fireEvent.wheel(strip, { deltaY: 100 });
    expect(strip.scrollLeft).toBe(100);
    view.rerender(<Strip />);
    const next = screen.getByRole("tablist");
    setDimensions(next);
    wheel();
    expect(next.scrollLeft).toBe(100);
  });
});
