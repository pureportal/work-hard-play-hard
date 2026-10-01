import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  it("keeps mobile destinations in a More menu", () => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    try {
      const onChange = vi.fn();
      render(<NavRail corporateIdentity={createTestCorporateIdentity()} activePanel={null} canUseBuild currentUser={currentUser}
        unreadMessages={0} onChange={onChange} onAvatarClick={vi.fn()} onSignOut={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Build" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Messages" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "More" }));
      fireEvent.click(screen.getByRole("button", { name: "Messages" }));
      expect(onChange).toHaveBeenCalledWith("chat");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
    }
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
