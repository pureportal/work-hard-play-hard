import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@workhard/shared";
import { ProximitySessions } from "./proximity-sessions.js";

function fixture() {
  const sessions = new ProximitySessions();
  const peer = (userId: string, id = userId) => {
    const events: ServerEvent[] = [];
    return { id, userId, events, send: (event: ServerEvent) => events.push(event) };
  };
  return { sessions, maya: peer("maya"), leo: peer("leo"), theo: peer("theo"), viewer: peer("maya", "viewer") };
}

describe("open call sessions", () => {
  it("admits nearby participants, publishes media changes once, and scopes signaling to their call", () => {
    const { sessions, maya, leo, theo, viewer } = fixture();
    sessions.set(maya, "maya-session", true, true);
    sessions.set(leo, "leo-session", true, false);
    sessions.set(theo, "theo-session", true, true);
    const groups = new Map([["maya", "call"], ["leo", "call"]]);
    sessions.reconcile(groups);
    expect(maya.events.at(-1)).toMatchObject({ type: "proximity.media_state", session: { participants: [
      { userId: "maya", microphone: true, camera: true }, { userId: "leo", microphone: true, camera: false },
    ] } });
    const count = maya.events.length;
    sessions.reconcile(groups);
    expect(maya.events).toHaveLength(count);
    expect(() => sessions.signal(viewer.id, "maya-session", "leo-session", { type: "restart" })).toThrow("PROXIMITY_PEER_UNAVAILABLE");
    expect(() => sessions.signal(maya.id, "maya-session", "theo-session", { type: "restart" })).toThrow("PROXIMITY_PEER_UNAVAILABLE");
    sessions.signal(maya.id, "maya-session", "leo-session", { type: "restart" });
    expect(leo.events.at(-1)).toEqual({ type: "proximity.signal", sessionId: "leo-session", fromSessionId: "maya-session", signal: { type: "restart" } });
    groups.set("theo", "call");
    sessions.reconcile(groups);
    expect(theo.events.at(-1)).toMatchObject({ type: "proximity.media_state", session: { callId: "call", participants: expect.any(Array) } });
    sessions.signal(theo.id, "theo-session", "maya-session", { type: "restart" });
    expect(maya.events.at(-1)).toMatchObject({ type: "proximity.signal", fromSessionId: "theo-session" });
  });

  it("stops readiness after separation, rejects departed peers, and requires explicitly enabling media again", () => {
    const { sessions, maya, leo } = fixture();
    sessions.set(maya, "maya-session", true, true);
    sessions.set(leo, "leo-session", true, true);
    sessions.reconcile(new Map([["maya", "call"], ["leo", "call"]]));
    sessions.reconcile(new Map());
    expect(maya.events.at(-1)).toEqual({ type: "proximity.left", sessionId: "maya-session" });
    expect(leo.events.at(-1)).toEqual({ type: "proximity.left", sessionId: "leo-session" });
    expect([...sessions.values()]).toEqual([]);
    expect(() => sessions.signal(maya.id, "maya-session", "leo-session", { type: "restart" })).toThrow();
  });

  it("owns capture by tab and ignores stale leave requests after a new session", () => {
    const { sessions, maya, viewer } = fixture();
    sessions.set(maya, "old", true, true);
    sessions.set(viewer, "new", true, false);
    expect(maya.events.at(-1)).toEqual({ type: "proximity.left", sessionId: "old" });
    sessions.leave(maya.id, "old");
    sessions.disconnect(maya.id);
    expect([...sessions.values()]).toHaveLength(1);
    sessions.disconnect(viewer.id);
    expect(viewer.events.at(-1)).toEqual({ type: "proximity.left", sessionId: "new" });
    expect([...sessions.values()]).toEqual([]);
  });

  it("rejects reuse of another participant's session identifier", () => {
    const { sessions, maya, leo } = fixture();
    sessions.set(maya, "session", true, true);
    expect(() => sessions.set(leo, "session", true, true)).toThrow("PROXIMITY_SESSION_INVALID");
    expect([...sessions.values()]).toHaveLength(1);
  });
});
