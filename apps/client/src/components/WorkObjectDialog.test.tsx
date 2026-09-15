import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkObjectState } from "@workhard/shared";
import { WorkObjectDialog } from "./WorkObjectDialog";

afterEach(cleanup);
const notes: WorkObjectState = { kind: "whiteboard", revision: 2, document: { text: "Original notes", cards: [] } };
const checklist: WorkObjectState = { kind: "checklist", revision: 4, items: [{ id: "one", text: "Review demo", completed: false }] };

describe("WorkObjectDialog", () => {
  it.each([notes, checklist])("allows meeting controls to receive focus alongside a $kind", (state) => {
    const close = vi.fn();
    const view = render(<><button>Mute meeting</button><WorkObjectDialog title="Shared board" state={state} modal={false} onUpdate={vi.fn()} onClose={close} /></>);
    const dialog = screen.getByRole("dialog", { name: "Shared board" });
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect(view.container.querySelector(".modal-backdrop")).toBeNull();
    const mute = screen.getByRole("button", { name: "Mute meeting" });
    mute.focus();
    fireEvent.keyDown(mute, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps notes until the server acknowledges, and retains failed drafts", async () => {
    const update = vi.fn().mockRejectedValueOnce(new Error("Connection lost. Try again.")).mockResolvedValue(undefined);
    render(<WorkObjectDialog title="Whiteboard" state={notes} onUpdate={update} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "Release plan\nReview" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Connection lost. Try again.");
    expect((screen.getByRole("textbox", { name: "Notes" }) as HTMLTextAreaElement).value).toBe("Release plan\nReview");
    expect(update).toHaveBeenCalledWith(2, { type: "whiteboard.save", document: { text: "Release plan\nReview", cards: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
  });

  it("shows shared changes without overwriting a draft, with an explicit conflict choice", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const view = render(<WorkObjectDialog title="Whiteboard" state={notes} onUpdate={update} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "My draft" } });
    view.rerender(<WorkObjectDialog title="Whiteboard" state={{ ...notes, revision: 3, document: { text: "Teammate notes", cards: [] } }} onUpdate={update} onClose={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("Choose which changes to keep.");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("My draft");
    fireEvent.click(screen.getByRole("button", { name: "Keep mine" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(3, { type: "whiteboard.save", document: { text: "My draft", cards: [] } }));
  });

  it("adds, edits, completes, reopens, and removes checklist items through saved operations", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const view = render(<WorkObjectDialog title="Checklist" state={checklist} onUpdate={update} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("New item"), { target: { value: "  Ship release  " } });
    fireEvent.submit(screen.getByRole("button", { name: "Add" }).closest("form")!);
    await waitFor(() => expect(update).toHaveBeenCalledWith(4, { type: "checklist.add", text: "Ship release" }));
    await screen.findByText("Saved");
    fireEvent.click(screen.getByRole("checkbox", { name: "Review demo" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(4, { type: "checklist.complete", itemId: "one", completed: true }));
    await screen.findByText("Saved");
    fireEvent.click(screen.getByRole("button", { name: "Edit Review demo" }));
    fireEvent.change(screen.getByLabelText("Edit item"), { target: { value: "Review launch demo" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(4, { type: "checklist.rename", itemId: "one", text: "Review launch demo" }));
    await screen.findByText("Saved");
    view.rerender(<WorkObjectDialog title="Checklist" state={{ ...checklist, revision: 5, items: [{ ...checklist.items[0]!, completed: true }] }} onUpdate={update} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Review demo" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(5, { type: "checklist.complete", itemId: "one", completed: false }));
    await screen.findByText("Saved");
    fireEvent.click(screen.getByRole("button", { name: "Remove Review demo" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(5, { type: "checklist.remove", itemId: "one" }));
    await screen.findByText("Saved");
  });

  it("protects drafts on escape, traps focus, and disables editing when disconnected or removed", () => {
    const close = vi.fn();
    const update = vi.fn();
    const view = render(<WorkObjectDialog title="Whiteboard" state={notes} onUpdate={update} onClose={close} />);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close board" }));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Keep me" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    view.rerender(<WorkObjectDialog title="Whiteboard" state={notes} unavailable="This board was removed." onUpdate={update} onClose={close} />);
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Keep me");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Close board" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("blocks duplicate submissions while saving", async () => {
    let finish: (() => void) | undefined;
    const update = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<WorkObjectDialog title="Checklist" state={checklist} onUpdate={update} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Review demo" }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Close board" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish!());
    expect(update).toHaveBeenCalledOnce();
  });
});
