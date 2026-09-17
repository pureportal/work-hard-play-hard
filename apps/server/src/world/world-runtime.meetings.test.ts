import { applyRoomSettings } from "../testing/approved-action.js";
import { createTestData } from "../testing/workspace-data.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientCommand, ServerEvent } from "@workhard/shared";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

const runtimes: WorldRuntime[] = [];
afterEach(() => { runtimes.splice(0).forEach((runtime) => runtime.stop()); vi.useRealTimers(); });

function setup() {
  const store = new WorkspaceStore(createTestData());
  const runtime = new WorldRuntime(store);
  runtimes.push(runtime);
  const connect = (userId: string) => {
    const events: ServerEvent[] = [];
    const id = runtime.connect(userId, "floor-studio", (event) => events.push(structuredClone(event)));
    const send = (command: ClientCommand) => runtime.handleCommand(id, command);
    const join = (meetingId = "meeting-product-crit", invitationId?: string) => {
      send({ type: "meeting.join", meetingId, requestId: crypto.randomUUID(), ...(invitationId ? { invitationId } : {}) });
      const event = events.findLast((candidate) => candidate.type === "meeting.joined");
      if (event?.type !== "meeting.joined") throw new Error(JSON.stringify(events.at(-1)));
      return event.session;
    };
    return { id, events, send, join };
  };
  return { store, runtime, connect };
}

describe("meeting sessions and access", () => {
  it("acknowledges requests on the requesting tab and clears stored participants at startup", () => {
    const { store, connect } = setup();
    expect(store.getMeetings().every((meeting) => meeting.participantIds.length === 0)).toBe(true);
    const maya = connect("user-maya");
    const viewer = connect("user-maya");
    maya.send({ type: "meeting.join", requestId: "open", meetingId: "meeting-product-crit" });
    expect(maya.events).toContainEqual(expect.objectContaining({ type: "meeting.joined", requestId: "open" }));
    expect(viewer.events.some((event) => event.type === "meeting.joined")).toBe(false);
  });

  it("relays media only between live sessions in the same meeting", () => {
    const { connect } = setup();
    const maya = connect("user-maya");
    const leo = connect("user-leo");
    const theo = connect("user-theo");
    const first = maya.join();
    const second = leo.join();
    const third = theo.join("meeting-planning");
    leo.events.length = 0;
    theo.events.length = 0;
    const signal = { type: "description" as const, description: { type: "offer" as const, sdp: "v=0" } };
    maya.send({ type: "meeting.signal", requestId: "valid", sessionId: first.sessionId, targetSessionId: second.sessionId, signal });
    expect(leo.events).toContainEqual({ type: "meeting.signal", sessionId: second.sessionId, fromSessionId: first.sessionId, signal });
    maya.send({ type: "meeting.signal", requestId: "cross-room", sessionId: first.sessionId, targetSessionId: third.sessionId, signal });
    expect(theo.events.some((event) => event.type === "meeting.signal")).toBe(false);
    expect(maya.events.at(-1)).toMatchObject({ type: "command.error", code: "MEETING_PEER_UNAVAILABLE" });
    theo.send({ type: "meeting.media", requestId: "spoof", sessionId: first.sessionId, microphone: true, camera: true, screen: true });
    expect(theo.events.at(-1)).toMatchObject({ type: "command.error", code: "MEETING_NOT_JOINED" });
  });

  it("rejects a stale leave after rejoining and ends the owning tab on disconnect", () => {
    const { store, runtime, connect } = setup();
    const maya = connect("user-maya");
    const viewer = connect("user-maya");
    const first = maya.join();
    const second = maya.join();
    expect(second.sessionId).not.toBe(first.sessionId);
    maya.send({ type: "meeting.leave", requestId: "stale", meetingId: first.meetingId, sessionId: first.sessionId });
    expect(maya.events.at(-1)).toMatchObject({ type: "command.error", code: "MEETING_NOT_JOINED" });
    expect(store.getMeeting(first.meetingId)?.participantIds).toContain("user-maya");
    runtime.disconnect(maya.id);
    expect(store.getMeeting(first.meetingId)?.participantIds).not.toContain("user-maya");
    expect(store.getMember("user-maya")?.online).toBe(true);
    expect(viewer.events.some((event) => event.type === "meeting.joined")).toBe(false);
  });

  it("restricts meeting chat and attachments to participants, including bootstrap and broadcasts", () => {
    const { store, connect } = setup();
    const maya = connect("user-maya");
    const leo = connect("user-leo");
    const theo = connect("user-theo");
    const session = maya.join();
    leo.join();
    const conversationId = "conversation-daily";
    theo.events.length = 0;
    expect(store.getBootstrap("user-theo").conversations.some((conversation) => conversation.id === conversationId)).toBe(false);
    theo.send({ type: "chat.send", requestId: "unauthorized", conversationId, body: "private" });
    expect(theo.events.at(-1)).toMatchObject({ type: "command.error" });
    maya.send({ type: "chat.send", requestId: "send", conversationId, body: "hello" });
    expect(leo.events).toContainEqual(expect.objectContaining({ type: "chat.message_created", message: expect.objectContaining({ body: "hello" }) }));
    expect(theo.events.some((event) => event.type === "chat.message_created")).toBe(false);
    maya.send({ type: "meeting.leave", requestId: "leave", meetingId: session.meetingId, sessionId: session.sessionId });
    expect(store.canAccessConversation("user-maya", conversationId)).toBe(false);
    expect(maya.events).toContainEqual({ type: "meeting.left", requestId: "leave", meetingId: session.meetingId, sessionId: session.sessionId });
  });

  it("locks entry, admits a matching invitation, rejects reuse, and transfers the host", () => {
    const { connect } = setup();
    const maya = connect("user-maya");
    const leo = connect("user-leo");
    const theo = connect("user-theo");
    const host = maya.join();
    maya.send({ type: "meeting.lock", requestId: "lock", sessionId: host.sessionId, locked: true });
    leo.send({ type: "meeting.join", requestId: "denied", meetingId: host.meetingId });
    expect(leo.events.at(-1)).toMatchObject({ type: "command.error", code: "MEETING_LOCKED" });
    maya.send({ type: "meeting.invite", requestId: "invite", sessionId: host.sessionId, targetUserId: "user-leo" });
    const invite = leo.events.findLast((event) => event.type === "meeting.invited");
    if (invite?.type !== "meeting.invited") throw new Error("Missing invitation");
    theo.send({ type: "meeting.join", requestId: "stolen", meetingId: host.meetingId, invitationId: invite.invitation.id });
    expect(theo.events.at(-1)).toMatchObject({ type: "command.error", code: "MEETING_INVITATION_EXPIRED" });
    const guest = leo.join(host.meetingId, invite.invitation.id);
    expect(guest.locked).toBe(true);
    leo.send({ type: "meeting.lock", requestId: "guest-lock", sessionId: guest.sessionId, locked: false });
    expect(leo.events.at(-1)).toMatchObject({ type: "command.error", code: "MEETING_HOST_REQUIRED" });
    maya.send({ type: "meeting.leave", requestId: "leave", sessionId: host.sessionId, meetingId: host.meetingId });
    expect(leo.events).toContainEqual(expect.objectContaining({ type: "meeting.media_state", session: expect.objectContaining({ hostUserId: "user-leo", locked: true }) }));
    leo.send({ type: "meeting.join", requestId: "reused", meetingId: host.meetingId, invitationId: invite.invitation.id });
    expect(leo.events.at(-1)).toMatchObject({ type: "command.error", code: "MEETING_INVITATION_EXPIRED" });
  });

  it("expires invitations and preserves the current meeting after a denied switch", () => {
    vi.useFakeTimers();
    const { store, connect } = setup();
    const maya = connect("user-maya");
    const leo = connect("user-leo");
    const host = maya.join();
    const guest = leo.join("meeting-planning");
    maya.send({ type: "meeting.invite", requestId: "invite", sessionId: host.sessionId, targetUserId: "user-leo" });
    const invite = leo.events.findLast((event) => event.type === "meeting.invited");
    if (invite?.type !== "meeting.invited") throw new Error("Missing invitation");
    vi.advanceTimersByTime(60_001);
    leo.send({ type: "meeting.join", requestId: "expired", meetingId: host.meetingId, invitationId: invite.invitation.id });
    expect(leo.events.at(-1)).toMatchObject({ type: "command.error", code: "MEETING_INVITATION_EXPIRED" });
    expect(store.getMeeting(guest.meetingId)?.participantIds).toContain("user-leo");
  });

  it("preserves the lock, host and invitations when a participant replaces their session", () => {
    const { connect } = setup();
    const maya = connect("user-maya");
    const leo = connect("user-leo");
    const host = maya.join();
    maya.send({ type: "meeting.lock", requestId: "lock", sessionId: host.sessionId, locked: true });
    maya.send({ type: "meeting.invite", requestId: "invite", sessionId: host.sessionId, targetUserId: "user-leo" });
    const invitation = leo.events.findLast((event) => event.type === "meeting.invited");
    if (invitation?.type !== "meeting.invited") throw new Error("Missing invitation");
    const replacement = maya.join();
    expect(replacement).toMatchObject({ hostUserId: "user-maya", locked: true });
    expect(replacement.participants).toHaveLength(1);
    const guest = leo.join(host.meetingId, invitation.invitation.id);
    expect(guest.locked).toBe(true);
    expect(maya.join()).toMatchObject({ hostUserId: "user-maya", locked: true });
    maya.send({ type: "meeting.media", requestId: "stale-media", sessionId: host.sessionId, microphone: true, camera: true, screen: true });
    expect(maya.events.at(-1)).toMatchObject({ type: "command.error", code: "MEETING_NOT_JOINED" });
  });

  it("enforces private room access and capacity, and revokes remote participants when room access changes", () => {
    const { store, runtime, connect } = setup();
    const room = store.getRoom("room-daily")!;
    room.access = { mode: "assigned", assignedPersonIds: ["user-maya"], knockable: true };
    room.capacity = 2;
    const maya = connect("user-maya");
    const leo = connect("user-leo");
    const theo = connect("user-theo");
    const host = maya.join("meeting-product-crit");
    leo.send({ type: "meeting.join", requestId: "private", meetingId: host.meetingId });
    expect(leo.events.at(-1)).toMatchObject({ type: "command.error", code: "ROOM_ACCESS_REQUIRED" });
    maya.send({ type: "meeting.invite", requestId: "invite", sessionId: host.sessionId, targetUserId: "user-leo" });
    const invite = leo.events.findLast((event) => event.type === "meeting.invited");
    if (invite?.type !== "meeting.invited") throw new Error("Missing invitation");
    const guest = leo.join(host.meetingId, invite.invitation.id);
    leo.send({ type: "meeting.invite", requestId: "guest-invite", sessionId: guest.sessionId, targetUserId: "user-theo" });
    expect(leo.events.at(-1)).toMatchObject({ type: "command.error", code: "ROOM_ACCESS_REQUIRED" });
    maya.send({ type: "meeting.invite", requestId: "full-invite", sessionId: host.sessionId, targetUserId: "user-theo" });
    const fullInvite = theo.events.findLast((event) => event.type === "meeting.invited");
    if (fullInvite?.type !== "meeting.invited") throw new Error("Missing invitation");
    theo.send({ type: "meeting.join", requestId: "full", meetingId: host.meetingId, invitationId: fullInvite.invitation.id });
    expect(theo.events.at(-1)).toMatchObject({ type: "command.error", code: "ROOM_FULL" });
    applyRoomSettings(runtime, store, maya.id, { requestId: "revoke", roomId: room.id, baseRevision: store.getLayout(room.floorId)!.revision,
      settings: { name: room.name, color: room.color, access: room.access } });
    expect(leo.events).toContainEqual({ type: "meeting.left", meetingId: guest.meetingId, sessionId: guest.sessionId });
    expect(store.getMeeting(host.meetingId)?.participantIds).not.toContain("user-leo");
    theo.send({ type: "meeting.join", requestId: "revoked-invite", meetingId: host.meetingId, invitationId: fullInvite.invitation.id });
    expect(theo.events.at(-1)).toMatchObject({ type: "command.error", code: "MEETING_INVITATION_EXPIRED" });
    expect(store.getMeeting(host.meetingId)?.participantIds).not.toContain("user-theo");
  });
});
