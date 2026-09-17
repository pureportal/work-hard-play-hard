import { StrictMode, useEffect, useRef, useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientCommand, ServerEvent } from "@workhard/shared";
import { useProximitySession } from "./useProximitySession";

afterEach(cleanup);

function fixture(microphoneEnabled = true) {
  const send = vi.fn<(command: ClientCommand) => boolean>().mockReturnValue(true);
  return { send, ...renderHook(() => {
    const [muted, setMuted] = useState(!microphoneEnabled);
    const [cameraOn, setCameraOn] = useState(false);
    const sender = useRef(send);
    const session = useProximitySession(sender, setMuted, setCameraOn);
    useEffect(() => { if (!muted || cameraOn) session.start(); }, [muted, cameraOn, session.start]);
    return { ...session, muted, cameraOn, setMuted, setCameraOn };
  }, { wrapper: StrictMode }) };
}

describe("open call lifecycle", () => {
  it("joins explicitly with both devices off", () => {
    const { result } = fixture(false);
    expect(result.current.connection).toBeUndefined();
    act(() => result.current.start());
    expect(result.current.connection).toBeDefined();
    expect(result.current.muted).toBe(true);
    expect(result.current.cameraOn).toBe(false);
  });

  it("turns off both devices when the server ends this session and requires an explicit restart", () => {
    const { result } = fixture();
    const sessionId = result.current.connection!.getSnapshot().session.sessionId;
    act(() => result.current.handle({ type: "proximity.left", sessionId }));
    expect(result.current.muted).toBe(true);
    expect(result.current.cameraOn).toBe(false);
    expect(result.current.connection).toBeUndefined();
    act(() => result.current.setMuted(false));
    expect(result.current.connection!.getSnapshot().session.sessionId).not.toBe(sessionId);
    act(() => result.current.handle({ type: "proximity.left", sessionId }));
    expect(result.current.muted).toBe(false);
    expect(result.current.connection).toBeDefined();
  });

  it("leaves immediately and ignores media and signaling from the ended session", () => {
    const { result, send } = fixture();
    const connection = result.current.connection!;
    const session = connection.getSnapshot().session;
    act(() => result.current.leave());
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "proximity.leave", sessionId: session.sessionId }));
    expect(result.current.muted).toBe(true);
    expect(result.current.cameraOn).toBe(false);
    const events: ServerEvent[] = [
      { type: "proximity.media_state", session: { ...session, callId: "stale" } },
      { type: "proximity.signal", sessionId: session.sessionId, fromSessionId: "remote", signal: { type: "restart" } },
    ];
    act(() => events.forEach((event) => result.current.handle(event)));
    expect(result.current.connection).toBeUndefined();
    expect(connection.getSnapshot().session.callId).toBeNull();
  });

  it("keeps its session while muting every device and releases it on unmount", () => {
    const { result, send, unmount } = fixture();
    const connection = result.current.connection!;
    act(() => result.current.setMuted(true));
    expect(result.current.connection).toBe(connection);
    connection.setStreams({});
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "proximity.set_media" }));
    unmount();
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ type: "proximity.leave", sessionId: connection.getSnapshot().session.sessionId }));
  });
});
