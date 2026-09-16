import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkspaceCommand } from "./useWorkspaceCommand";

const donation = { type: "economy.donate" as const, requestId: "donation", amount: 25, fundId: "workspace" };

describe("workspace command feedback", () => {
  it("keeps an action pending when unrelated events arrive and prevents duplicate clicks", () => {
    const send = vi.fn(() => true);
    const { result } = renderHook(useWorkspaceCommand);
    act(() => { result.current.run(send, donation); });
    act(() => {
      result.current.handleEvent({ type: "command.ack", requestId: "someone-else" });
      result.current.run(send, { ...donation, requestId: "duplicate" });
    });
    expect(result.current.pending).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    act(() => { result.current.handleEvent({ type: "command.ack", requestId: donation.requestId }); });
    expect(result.current.pending).toBe(false);
  });

  it("shows the matching server error and clears it when the user retries", () => {
    const { result } = renderHook(useWorkspaceCommand);
    act(() => { result.current.run(() => true, donation); });
    act(() => { result.current.handleEvent({ type: "command.error", requestId: donation.requestId, code: "COINS_INSUFFICIENT", message: "You do not have enough coins." }); });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe("You do not have enough coins.");
    act(() => { result.current.run(() => true, { ...donation, requestId: "retry" }); });
    expect(result.current.pending).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it("leaves a disconnected action ready to retry", () => {
    const { result } = renderHook(useWorkspaceCommand);
    act(() => { expect(result.current.run(() => false, donation)).toBe(false); });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe("Connection unavailable. Reconnect and try again.");
  });
});
