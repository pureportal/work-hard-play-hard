import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Member } from "@workhard/shared";
import { PeoplePanel } from "./PeoplePanel";

const owner: Member = {
  id: "owner",
  name: "Owner",
  initials: "OW",
  email: "owner@example.com",
  title: "",
  role: "owner",
  permissions: ["manage_members", "build"],
  color: "#123456",
  availability: "available",
  online: true,
};

const member: Member = {
  id: "member",
  name: "Alex Member",
  initials: "AM",
  email: "alex@example.com",
  title: "Engineer",
  role: "member",
  permissions: [],
  color: "#654321",
  availability: "available",
  online: true,
};

describe("PeoplePanel access management", () => {
  it("assigns build permission to members and invitations", async () => {
    const onAccessChange = vi.fn().mockResolvedValue(undefined);
    const onInvite = vi.fn().mockResolvedValue(true);
    render(
      <PeoplePanel
        members={[owner, member]}
        invitations={[]}
        invitationLinks={{}}
        currentUser={owner}
        canManageMembers
        onClose={vi.fn()}
        onWave={vi.fn()}
        onMessage={vi.fn()}
        onCall={vi.fn()}
        onLocate={vi.fn()}
        onInvite={onInvite}
        onRevokeInvite={vi.fn()}
        onCopyInvite={vi.fn()}
        onAccessChange={onAccessChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Alex Member" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Build office" }));
    await waitFor(() => expect(onAccessChange).toHaveBeenCalledWith("member", "member", ["build"]));

    fireEvent.click(screen.getByRole("button", { name: "Alex Member" }));
    fireEvent.click(screen.getByRole("button", { name: "Invite member" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "builder@example.com" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Build office" }));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(onInvite).toHaveBeenCalledWith("builder@example.com", "member", ["build"]));
  });
});
