import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { cleanup, render, screen } from "@testing-library/react";
import type { Member } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavRail } from "./NavRail";
import { createTestCorporateIdentity } from "../test-fixtures";

const currentUser: Member = {
  id: "user-one",
  name: "Maya Chen",
  initials: "MC", character: { ...DEFAULT_CHARACTER_APPEARANCE },
  email: "maya@example.com",
  title: "Product Lead",
  role: "owner",
  permissions: ["manage_members"],
  color: "#ff7a66",
  availability: "available",
  online: true,
  floorId: "floor-one",
};

afterEach(cleanup);

describe("NavRail", () => {
  it("shows Approval Desk only when the feature is enabled", () => {
    const props = {
      corporateIdentity: createTestCorporateIdentity(), activePanel: null, canUseBuild: true,
      currentUser, unreadMessages: 0, onChange: vi.fn(), onAvatarClick: vi.fn(), onSignOut: vi.fn(),
    } as const;
    const { rerender } = render(<NavRail {...props} />);
    expect(screen.queryByRole("button", { name: "Approval Desk" })).toBeNull();
    rerender(<NavRail {...props} approvalDeskEnabled />);
    expect(screen.getByRole("button", { name: "Approval Desk" })).toBeTruthy();
  });

  it("associates the unread count with Messages without changing its control name", () => {
    const { container } = render(
      <NavRail
        corporateIdentity={createTestCorporateIdentity()}
        activePanel={null}
        canUseBuild
        currentUser={currentUser}
        unreadMessages={12}
        onChange={vi.fn()}
        onAvatarClick={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    const messages = screen.getByRole("button", { name: "Messages" });
    expect(messages.getAttribute("aria-describedby")).toBe("nav-chat-unread");
    expect(screen.getByText("12 unread").parentElement?.id).toBe("nav-chat-unread");
    expect(container.querySelector(".nav-unread > [aria-hidden='true']")?.textContent).toBe("9+");
  });
});
