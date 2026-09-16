import { StrictMode, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmationDialog } from "./ConfirmationDialog";

afterEach(cleanup);

describe("ConfirmationDialog", () => {
  it("opens a named modal, describes the consequence, and focuses cancellation", () => {
    render(<ConfirmationDialog title="Donate item?" description="It will become shared property."
      confirmLabel="Donate" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Donate item?" }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("It will become shared property.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("runs the action only on confirmation and restores focus after closing", () => {
    const onConfirm = vi.fn();
    function Inventory() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Sell item</button>
        {open && <ConfirmationDialog title="Sell item?" confirmLabel="Sell"
          onCancel={() => setOpen(false)} onConfirm={() => { onConfirm(); setOpen(false); }} />}</>;
    }
    render(<StrictMode><Inventory /></StrictMode>);
    const trigger = screen.getByRole("button", { name: "Sell item" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("wraps Tab and Shift+Tab between the dialog actions", () => {
    render(<ConfirmationDialog title="Sell item?" confirmLabel="Sell" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Sell" });
    expect(fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(confirm);
    expect(fireEvent.keyDown(confirm, { key: "Tab" })).toBe(false);
    expect(document.activeElement).toBe(cancel);
  });

  it("keeps dialog keys and clicks from reaching the underlying game", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const backgroundKey = vi.fn();
    const backgroundClick = vi.fn();
    render(<div onKeyDown={backgroundKey} onClick={backgroundClick}>
      <ConfirmationDialog title="Leave game?" confirmLabel="Leave" onConfirm={onConfirm} onCancel={onCancel} />
    </div>);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    fireEvent.keyDown(cancel, { key: "r" });
    fireEvent.keyDown(cancel, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(backgroundKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(backgroundClick).not.toHaveBeenCalled();
  });

  it("waits for pending actions and allows retry after they finish", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const props = { title: "Sell item?", confirmLabel: "Sell", onConfirm, onCancel };
    const { rerender } = render(<ConfirmationDialog {...props} pending />);
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(dialog);
    expect(fireEvent.keyDown(dialog, { key: "Tab" })).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    const cancelEvent = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    rerender(<ConfirmationDialog {...props} pending={false} error="The item could not be sold. Try again." />);
    expect(screen.getByRole("alert").textContent).toBe("The item could not be sold. Try again.");
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("handles native cancellation without confirming", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmationDialog title="Leave game?" confirmLabel="Leave" cancelLabel="Keep playing"
      onConfirm={onConfirm} onCancel={onCancel} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep playing" }));
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").hasAttribute("aria-describedby")).toBe(false);
  });
});
