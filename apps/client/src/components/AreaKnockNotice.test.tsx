import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Area, AreaKnock, Member } from "@workhard/shared";
import { AreaKnockNotice } from "./AreaKnockNotice";

const area: Area = {
  id: "focus",
  floorId: "studio",
  name: "Focus Suite",
  type: "private",
  x: 100,
  y: 100,
  width: 300,
  height: 200,
  color: "#d9cdf4",
  capacity: 5,
  locked: true,
  visibility: "public",
  doors: [],
};

const knock: AreaKnock = {
  id: "knock",
  areaId: area.id,
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
  color: "#f4b942",
  availability: "available",
  online: true,
};

afterEach(cleanup);

describe("AreaKnockNotice", () => {
  it("locks both responses after one is sent", () => {
    const onRespond = vi.fn(() => true);
    render(<AreaKnockNotice knock={knock} area={area} requester={requester} onRespond={onRespond} />);

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
    render(<AreaKnockNotice knock={knock} area={area} requester={requester} onRespond={onRespond} />);

    const accept = screen.getByRole("button", { name: "Let Jonas Berg into Focus Suite" }) as HTMLButtonElement;
    fireEvent.click(accept);

    expect(accept.disabled).toBe(false);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("false");
  });
});
