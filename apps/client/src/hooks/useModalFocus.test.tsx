import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useModalFocus } from "./useModalFocus";

afterEach(cleanup);

function TestDialog({ onClose }: { onClose: () => void }) {
  const ref = useModalFocus<HTMLDivElement>(onClose);
  return <div ref={ref} role="dialog" tabIndex={-1}>
    <button>Close</button>
    <button role="tab" aria-selected="true">Selected</button>
    <button role="tab" aria-selected="false" tabIndex={-1}>Inactive</button>
  </div>;
}

describe("modal keyboard focus", () => {
  it("wraps focus through tab stops without selecting an inactive tab", () => {
    render(<TestDialog onClose={vi.fn()} />);
    const close = screen.getByRole("button", { name: "Close" });
    const selected = screen.getByRole("tab", { name: "Selected" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(selected);
    fireEvent.keyDown(selected, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(selected);
  });

  it("restores focus to the opener after Escape dismisses a dialog", () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = render(<TestDialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
