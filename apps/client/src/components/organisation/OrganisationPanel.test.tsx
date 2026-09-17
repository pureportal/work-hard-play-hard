import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrganisation, DEFAULT_CHARACTER_APPEARANCE, type Member } from "@workhard/shared";
import { OrganisationPanel } from "./OrganisationPanel";

afterEach(cleanup);

describe("OrganisationPanel proposals", () => {
  it("submits the selected person for team approval", () => {
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
    const promote = screen.getByRole("button", { name: "Propose CEO" });
    fireEvent.click(promote);
    expect(onEdit).toHaveBeenCalledExactlyOnceWith({ type: "ceo.promote", userId: "alex" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
