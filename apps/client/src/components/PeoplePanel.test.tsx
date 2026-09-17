import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Member } from "@workhard/shared";
import { PeoplePanel } from "./PeoplePanel";

const owner: Member = {
  id: "owner",
  name: "Owner",
  initials: "OW", character: { ...DEFAULT_CHARACTER_APPEARANCE },
  email: "owner@example.com",
  title: "",
  role: "owner",
  permissions: ["manage_members"],
  color: "#123456",
  availability: "available",
  online: true,
};

const member: Member = {
  id: "member",
  name: "Alex Member",
  initials: "AM", character: { ...DEFAULT_CHARACTER_APPEARANCE },
  email: "alex@example.com",
  title: "Engineer",
  role: "member",
  permissions: [],
  color: "#654321",
  availability: "available",
  online: true,
};

describe("PeoplePanel", () => {
  it("keeps server access controls out of the people list", () => {
    render(<PeoplePanel members={[owner, member]} currentUser={owner} onClose={vi.fn()} onWave={vi.fn()} onMessage={vi.fn()} onCall={vi.fn()} onLocate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Alex Member" }));
    expect(screen.queryByRole("combobox", { name: "Role" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Build office" })).toBeNull();
    expect(screen.getByRole("button", { name: "Call Alex Member" })).toBeTruthy();
  });
});
