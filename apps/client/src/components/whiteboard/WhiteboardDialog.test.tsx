import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWhiteboardDocument, type WorkObjectEdit, type WorkObjectState } from "@workhard/shared";
import { WorkObjectDialog } from "../WorkObjectDialog";

afterEach(cleanup);

function mount() {
  const updates = vi.fn();
  function Board() {
    const [state, setState] = useState<WorkObjectState>({ kind: "whiteboard", revision: 0, document: createWhiteboardDocument() });
    return <WorkObjectDialog title="Roadmap" state={state} onClose={vi.fn()} onUpdate={async (revision: number, edit: WorkObjectEdit) => {
      updates(revision, edit);
      if (edit.type === "whiteboard.save") setState({ kind: "whiteboard", revision: revision + 1, document: edit.document });
    }} />;
  }
  render(<Board />);
  return updates;
}

describe("whiteboard views", () => {
  it("keeps card content, position, color, status and dates when switching views and saving", async () => {
    const update = mount();
    fireEvent.click(screen.getByRole("button", { name: "Sticky note" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Launch party" } });
    fireEvent.change(screen.getByLabelText("Card notes"), { target: { value: "Bring cake" } });
    fireEvent.click(screen.getByRole("button", { name: "Pink" }));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "doing" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Close card editor" }));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close board" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Launch party" }), { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize Launch party" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    expect(within(screen.getByRole("region", { name: "In progress" })).getByRole("button", { name: "Edit Launch party" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "Friday plans" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved", { exact: true });
    expect(update).toHaveBeenCalledWith(0, { type: "whiteboard.save", document: { text: "Friday plans", cards: [expect.objectContaining({ title: "Launch party", text: "Bring cake", color: "pink", status: "doing", dueDate: "2026-10-01", x: 80, y: 40, width: 240, height: 230 })] } });
    fireEvent.click(screen.getByRole("button", { name: "Canvas" }));
    expect(screen.getByRole("button", { name: "Edit Launch party" })).toBeTruthy();
  });

  it("duplicates, reorders and deletes cards with undo and redo", async () => {
    const update = mount();
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    fireEvent.click(screen.getByRole("button", { name: "Add card to To do" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: "Duplicate card" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Move card earlier" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete card" }));
    expect(screen.queryByRole("button", { name: "Edit Second" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Edit Second" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.queryByRole("button", { name: "Edit Second" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved", { exact: true });
    expect(update.mock.calls[0]![1].document.cards.map((card: { title: string }) => card.title)).toEqual(["Second", "First"]);
  });

  it("keeps a failed image upload open and adds the successful upload to the shared document", async () => {
    const upload = vi.fn().mockRejectedValueOnce(new Error("Upload failed. Try again.")).mockResolvedValue(`/v1/whiteboards/images/${"a".repeat(64)}`);
    const update = vi.fn().mockResolvedValue(undefined);
    render(<WorkObjectDialog title="Board" state={{ kind: "whiteboard", revision: 0, document: createWhiteboardDocument() }} onUploadImage={upload} onUpdate={update} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    const file = new File(["image"], "reference.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload image"), { target: { files: [file] } });
    await screen.findByText("Upload failed. Try again.");
    fireEvent.change(screen.getByLabelText("Upload image"), { target: { files: [file] } });
    await screen.findByLabelText("Title");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Reference" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(0, expect.objectContaining({ document: expect.objectContaining({ cards: [expect.objectContaining({ kind: "image", title: "Reference", src: `/v1/whiteboards/images/${"a".repeat(64)}` })] }) })));
  });
});
