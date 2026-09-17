import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientCommand } from "@workhard/shared";
import { useCallRequest } from "./useCallRequest";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function fixture() {
  const send = vi.fn<(command: ClientCommand) => boolean>().mockReturnValue(true);
  const sender = { current: send };
  return { send, ...renderHook(() => useCallRequest(sender)) };
}

describe("call requests", () => {
  it("shows progress immediately, prevents duplicate requests, and waits for the matching outgoing call", () => {
    const { result, send } = fixture();
    act(() => {
      result.current.run("leo");
      result.current.run("leo");
    });
    expect(send).toHaveBeenCalledOnce();
    expect(result.current.pending).toBe(true);
    const command = result.current.status!.command;
    act(() => {
      result.current.handle({ type: "command.ack", requestId: command.requestId });
      result.current.handle({ type: "call.state", callId: "other", peerUserId: "maya", direction: "outgoing", state: "ringing" });
      result.current.handle({ type: "call.state", callId: "incoming", peerUserId: "leo", direction: "incoming", state: "ringing" });
    });
    expect(result.current.pending).toBe(true);
    act(() => result.current.handle({ type: "call.state", callId: "call", peerUserId: "leo", direction: "outgoing", state: "ringing" }));
    expect(result.current.status).toBeUndefined();
  });

  it("shows send failures and retries with a new request", () => {
    const { result, send } = fixture();
    send.mockReturnValueOnce(false);
    act(() => result.current.run("leo"));
    expect(result.current.pending).toBe(false);
    expect(result.current.status?.error).toBe("Connection unavailable. Reconnect and try again.");
    const failedId = result.current.status!.command.requestId;
    act(() => result.current.run("leo"));
    expect(result.current.pending).toBe(true);
    expect(result.current.status!.command.requestId).not.toBe(failedId);
    act(() => result.current.handle({ type: "command.error", requestId: failedId, code: "PERSON_OFFLINE", message: "They are offline." }));
    expect(result.current.pending).toBe(true);
  });

  it("retains the server error until retry or dismissal", () => {
    vi.useFakeTimers();
    const { result } = fixture();
    act(() => result.current.run("leo"));
    act(() => result.current.handle({ type: "command.error", requestId: result.current.status!.command.requestId, code: "CALL_OUT_OF_RANGE", message: "Move closer to call." }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.pending).toBe(false);
    expect(result.current.status?.error).toBe("Move closer to call.");
    act(() => result.current.clear());
    expect(result.current.status).toBeUndefined();
  });

  it.each(["call.request", "movement.approach_user"] as const)("bounds the wait for %s and allows retry", (type) => {
    vi.useFakeTimers();
    const { result } = fixture();
    act(() => result.current.run("leo", type));
    act(() => vi.advanceTimersByTime(type === "call.request" ? 10_000 : 60_000));
    expect(result.current.pending).toBe(false);
    expect(result.current.status?.error).toBe("The call did not start. Try again.");
    act(() => result.current.run("leo", type));
    expect(result.current.pending).toBe(true);
  });

  it("clears the timer when a call starts or the component unmounts", () => {
    vi.useFakeTimers();
    const { result, unmount } = fixture();
    act(() => result.current.run("leo"));
    act(() => result.current.handle({ type: "call.state", callId: "call", peerUserId: "leo", direction: "outgoing", state: "ringing" }));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.status).toBeUndefined();
    act(() => result.current.run("leo"));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
