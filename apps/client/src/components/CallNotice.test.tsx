import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@workhard/shared";
import { CallNotice, type ActiveCall } from "./CallNotice";

const peer: Member = {
  id: "leo",
  name: "Leo Martins",
  initials: "LM",
  email: "leo@example.com",
  title: "Engineer",
  role: "member",
  color: "#5b8def",
  availability: "available",
  online: true,
};

const incomingCall: ActiveCall = {
  callId: "call",
  peerUserId: peer.id,
  direction: "incoming",
  state: "ringing",
};

afterEach(cleanup);

describe("CallNotice", () => {
  it("locks call responses after the first command and unlocks on a state transition", () => {
    const onRespond = vi.fn(() => true);
    const { rerender } = render(<CallNotice call={incomingCall} peer={peer} onRespond={onRespond} onEnd={vi.fn(() => true)} />);

    const accept = screen.getByRole("button", { name: "Accept call from Leo Martins" }) as HTMLButtonElement;
    const decline = screen.getByRole("button", { name: "Decline call from Leo Martins" }) as HTMLButtonElement;
    fireEvent.click(accept);
    fireEvent.click(decline);

    expect(onRespond).toHaveBeenCalledOnce();
    expect(onRespond).toHaveBeenCalledWith("call", true);
    expect(accept.disabled).toBe(true);
    expect(decline.disabled).toBe(true);

    rerender(<CallNotice call={{ ...incomingCall, state: "connected" }} peer={peer} onRespond={onRespond} onEnd={vi.fn(() => true)} />);
    expect((screen.getByRole("button", { name: "End call with Leo Martins" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps actions available when the command cannot be sent", () => {
    render(<CallNotice call={incomingCall} peer={peer} onRespond={() => false} onEnd={() => false} />);

    const accept = screen.getByRole("button", { name: "Accept call from Leo Martins" }) as HTMLButtonElement;
    fireEvent.click(accept);

    expect(accept.disabled).toBe(false);
  });

  it("prevents duplicate cancellation commands", () => {
    const onEnd = vi.fn(() => true);
    render(
      <CallNotice
        call={{ ...incomingCall, direction: "outgoing" }}
        peer={peer}
        onRespond={() => false}
        onEnd={onEnd}
      />,
    );

    const cancel = screen.getByRole("button", { name: "Cancel call to Leo Martins" });
    fireEvent.click(cancel);
    fireEvent.click(cancel);

    expect(onEnd).toHaveBeenCalledOnce();
  });
});
