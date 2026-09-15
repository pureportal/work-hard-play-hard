import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGameRequest } from "./useGameRequest";

describe("multiplayer request feedback", () => {
  it("prevents duplicate actions until the matching acknowledgement arrives", () => {
    const { result } = renderHook(useGameRequest);
    const send = vi.fn(() => true);
    const command = { type: "chess.match_open" as const, requestId: "open", matchId: "match" };
    act(() => {
      expect(result.current.run(send, command)).toBe(true);
      expect(result.current.run(send, { ...command, requestId: "duplicate" })).toBe(false);
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);
    act(() => result.current.handleEvent({ type: "command.ack", requestId: "unrelated" }));
    expect(result.current.pending).toBe(true);
    act(() => result.current.handleEvent({ type: "command.ack", requestId: "open" }));
    expect(result.current.pending).toBe(false);
  });

  it("allows recovery after rejection, failed sends and disconnects", () => {
    const { result } = renderHook(useGameRequest);
    const command = { type: "chess.match_open" as const, requestId: "open", matchId: "match" };
    act(() => { result.current.run(() => false, command); });
    expect(result.current.pending).toBe(false);
    act(() => { result.current.run(() => true, command); });
    act(() => result.current.handleEvent({ type: "command.error", requestId: "open", code: "CHESS_TOO_FAR", message: "Move closer." }));
    expect(result.current.pending).toBe(false);
    act(() => { result.current.run(() => true, command); });
    act(() => result.current.clear());
    expect(result.current.pending).toBe(false);
  });
});
