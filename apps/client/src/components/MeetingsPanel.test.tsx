import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Meeting, Member } from "@workhard/shared";
import { MeetingsPanel } from "./MeetingsPanel";

const member: Member = {
  id: "member",
  name: "Maya Chen",
  initials: "MC", character: { ...DEFAULT_CHARACTER_APPEARANCE },
  email: "maya@example.com",
  title: "Product Lead",
  role: "owner",
  permissions: ["manage_members"],
  color: "#ff7a66",
  availability: "available",
  online: true,
};

const meeting = (id: string, title: string, status: Meeting["status"], startsAt: string): Meeting => ({
  id,
  title,
  status,
  startsAt,
  durationMinutes: 30,
  participantIds: [member.id],
  location: { type: "room", roomId: "room" },
});

afterEach(cleanup);

describe("MeetingsPanel", () => {
  it("starts an idle room without displaying a fabricated schedule", () => {
    const roomMeeting: Meeting = { id: "room-call", title: "Studio", status: "idle", participantIds: [], location: { type: "room", roomId: "studio" } };
    const onJoin = vi.fn();
    render(<MeetingsPanel meetings={[roomMeeting]} rooms={[]} members={[member]} onJoin={onJoin} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Studio" })).toBeTruthy();
    expect(document.querySelector("time")).toBeNull();
    expect(screen.queryByText(/ min/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onJoin).toHaveBeenCalledWith(roomMeeting);
  });

  it("orders active meetings and omits ended meetings", () => {
    render(
      <MeetingsPanel
        meetings={[
          meeting("ended", "Finished review", "ended", "2026-08-30T08:00:00.000Z"),
          meeting("scheduled", "Planning", "scheduled", "2026-08-30T10:00:00.000Z"),
          meeting("live", "Daily", "live", "2026-08-30T09:00:00.000Z"),
        ]}
        rooms={[]}
        members={[member]}
        onJoin={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("Finished review")).toBeNull();
    expect(screen.getByRole("button", { name: "Join" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
  });
});
