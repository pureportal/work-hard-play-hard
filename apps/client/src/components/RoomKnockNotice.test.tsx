import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Member, Room, RoomKnock } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomKnockNotice } from "./RoomKnockNotice";

const room: Room = {
  id: "focus",
  floorId: "studio",
  name: "Focus Suite",
  color: "#d9cdf4",
  capacity: 5,
  bounds: { x: 100, y: 100, width: 300, height: 200 },
  footprint: [{ x: 100, y: 100, width: 300, height: 200 }],
  boundary: [],
  doorIds: [],
  windowIds: [],
  privateEligible: true,
  access: { mode: "assigned", assignedPersonIds: ["maya"], knockable: true },
};

const knock: RoomKnock = {
  id: "knock",
  roomId: room.id,
  requesterUserId: "jonas",
  expiresAt: new Date(Date.now() + 20_000).toISOString(),
};

const requester: Member = {
  id: "jonas",
  name: "Jonas Berg",
  initials: "JB",
  email: "jonas@example.com",
  title: "Engineer",
  role: "member",
  permissions: [],
  color: "#f4b942",
  availability: "available",
  online: true,
};

afterEach(cleanup);

describe("RoomKnockNotice", () => {
  it("locks both responses after one is sent", () => {
    const onRespond = vi.fn(() => true);
    render(<RoomKnockNotice knock={knock} room={room} requester={requester} onRespond={onRespond} />);

    const accept = screen.getByRole("button", { name: "Let Jonas Berg into Focus Suite" }) as HTMLButtonElement;
    const decline = screen.getByRole("button", { name: "Decline Jonas Berg's request for Focus Suite" }) as HTMLButtonElement;
    fireEvent.click(accept);
    fireEvent.click(decline);

    expect(onRespond).toHaveBeenCalledOnce();
    expect(onRespond).toHaveBeenCalledWith(knock.id, true);
    expect(accept.disabled).toBe(true);
    expect(decline.disabled).toBe(true);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
  });

  it("keeps responses available when the command cannot be sent", () => {
    const onRespond = vi.fn(() => false);
    render(<RoomKnockNotice knock={knock} room={room} requester={requester} onRespond={onRespond} />);

    const accept = screen.getByRole("button", { name: "Let Jonas Berg into Focus Suite" }) as HTMLButtonElement;
    fireEvent.click(accept);

    expect(accept.disabled).toBe(false);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("false");
  });
});
