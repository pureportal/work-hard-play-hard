import { cleanup, render, screen } from "@testing-library/react";
import type { Member } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavRail } from "./NavRail";
import { createTestCorporateIdentity } from "../test-fixtures";

const currentUser: Member = {
  id: "user-one",
  name: "Maya Chen",
  initials: "MC",
  email: "maya@example.com",
  title: "Product Lead",
  role: "owner",
  permissions: ["manage_members", "build"],
  color: "#ff7a66",
  availability: "available",
  online: true,
  floorId: "floor-one",
};

afterEach(cleanup);

describe("NavRail", () => {
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
