import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrganisation, DEFAULT_CHARACTER_APPEARANCE, type Member } from "@workhard/shared";
import { OrganisationPanel } from "./OrganisationPanel";

afterEach(cleanup);

describe("OrganisationPanel confirmations", () => {
  it("cancels promotion without editing and confirms the selected person", () => {
    const organisation = createOrganisation();
    organisation.ceoIds = ["ceo"];
    const members: Member[] = ["ceo", "alex"].map((id) => ({
      id, name: id === "alex" ? "Alex" : "CEO", initials: id.slice(0, 2),
      character: { ...DEFAULT_CHARACTER_APPEARANCE }, email: `${id}@example.test`, title: "",
      role: "member", permissions: [], color: "#123456", availability: "available", online: true, floorId: "floor",
    }));
    const onEdit = vi.fn();
    render(<OrganisationPanel organisation={organisation} members={members} currentUserId="ceo" pending={false}
      onEdit={onEdit} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Alex" }));
    const promote = screen.getByRole("button", { name: "Promote to CEO" });
    promote.focus();
    fireEvent.click(promote);
    const dialog = screen.getByRole("dialog", { name: "Promote Alex to CEO?" });
    expect(within(dialog).getByText("Removing them will require a vote.")).toBeTruthy();
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(promote);
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.click(promote);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.click(promote);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Promote to CEO" }));
    expect(onEdit).toHaveBeenCalledExactlyOnceWith({ type: "ceo.promote", userId: "alex" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
