import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Floor, Meeting, Member } from "@workhard/shared";
import { MeetingsPanel } from "./MeetingsPanel";

const floor: Floor = {
  id: "floor",
  officeId: "office",
  name: "Studio",
  level: 1,
  width: 800,
  height: 600,
  spawn: { x: 100, y: 100 },
  background: "#ffffff",
};

const member: Member = {
  id: "member",
  name: "Maya Chen",
  initials: "MC",
  email: "maya@example.com",
  title: "Product Lead",
  role: "owner",
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
  location: { type: "public", floorId: floor.id, x: 200, y: 200, radius: 60 },
});

afterEach(cleanup);

describe("MeetingsPanel", () => {
  it("orders active meetings and omits ended meetings", () => {
    render(
      <MeetingsPanel
        meetings={[
          meeting("ended", "Finished review", "ended", "2026-08-30T08:00:00.000Z"),
          meeting("scheduled", "Planning", "scheduled", "2026-08-30T10:00:00.000Z"),
          meeting("live", "Daily", "live", "2026-08-30T09:00:00.000Z"),
        ]}
        areas={[]}
        floors={[floor]}
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
