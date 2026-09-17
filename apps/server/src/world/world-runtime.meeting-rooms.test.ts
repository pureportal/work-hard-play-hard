import { afterEach, describe, expect, it } from "vitest";
import { detectLayoutRooms, type ClientCommand, type RoomSettings, type ServerEvent } from "@workhard/shared";
import { clientCommandSchema } from "../protocol.js";
import { WorkspaceStore } from "../store.js";
import { createTestData } from "../testing/workspace-data.js";
import { applyBuildingProject } from "../testing/building-project.js";
import { applyRoomSettings, approveProposal } from "../testing/approved-action.js";
import { WorldRuntime } from "./world-runtime.js";

const runtimes: WorldRuntime[] = [];
afterEach(() => runtimes.splice(0).forEach((runtime) => runtime.stop()));

function setup() {
  const data = createTestData();
  data.meetings = [];
  const store = new WorkspaceStore(data);
  const runtime = new WorldRuntime(store);
  runtimes.push(runtime);
  const connect = (userId: string, floorId = "floor-studio") => {
    const events: ServerEvent[] = [];
    const id = runtime.connect(userId, floorId, (event) => events.push(structuredClone(event)));
    const send = (command: ClientCommand) => runtime.handleCommand(id, clientCommandSchema.parse(command) as ClientCommand);
    const join = (meetingId: string) => {
      send({ type: "meeting.join", requestId: crypto.randomUUID(), meetingId });
      const event = events.findLast((candidate) => candidate.type === "meeting.joined");
      if (event?.type !== "meeting.joined") throw new Error(JSON.stringify(events.at(-1)));
      return event.session;
    };
    return { id, events, send, join };
  };
  const settings = (meetingRoom: boolean): RoomSettings => ({ name: "Studio call", color: "#445566", meetingRoom,
    access: { mode: "open", assignedPersonIds: [], knockable: false } });
  const update = (peer: ReturnType<typeof connect>, meetingRoom: boolean, overrides: Partial<RoomSettings> = {}) => applyRoomSettings(runtime, store, peer.id, {
    requestId: crypto.randomUUID(), roomId: "room-daily",
    baseRevision: store.getLayout("floor-studio")!.revision, settings: { ...settings(meetingRoom), ...overrides },
  });
  return { store, runtime, connect, settings, update };
}

describe("meeting room configuration", () => {
  it("creates one reusable call and private chat, publishes across floors, and retains the setting through layout edits and reloads", () => {
    const { store, connect, update } = setup();
    const maya = connect("user-maya");
    const leo = connect("user-leo", "floor-rooftop");
    update(maya, true);
    const meeting = store.getMeetings()[0]!;
    expect(meeting).toMatchObject({ title: "Studio call", status: "idle", participantIds: [], location: { type: "room", roomId: "room-daily" } });
    expect(meeting.startsAt).toBeUndefined();
    expect(meeting.durationMinutes).toBeUndefined();
    expect(leo.events).toContainEqual(expect.objectContaining({ type: "workspace.access_updated", access: expect.objectContaining({ meetings: [meeting] }) }));
    const session = maya.join(meeting.id);
    const conversation = store.getBootstrap("user-maya").conversations.find((candidate) => candidate.meetingId === meeting.id)!;
    expect(conversation).toBeTruthy();
    expect(store.canAccessConversation("user-leo", conversation.id)).toBe(false);
    store.addMessage(conversation.id, "user-maya", "Room notes");
    maya.send({ type: "meeting.leave", requestId: "leave", meetingId: meeting.id, sessionId: session.sessionId });
    expect(store.getMeeting(meeting.id)).toMatchObject({ status: "idle", participantIds: [] });
    update(maya, true, { name: "Renamed room" });
    const layout = store.getLayout("floor-studio")!;
    store.replaceLayout(detectLayoutRooms({ ...layout, revision: layout.revision + 1 }, store.getFloor(layout.floorId)!));
    expect(store.getRoom("room-daily")?.meetingRoom).toBe(true);
    expect(store.getMeetings()).toHaveLength(1);
    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState(store.exportMutableState());
    expect(restored.getRoom("room-daily")?.meetingRoom).toBe(true);
    expect(restored.getMeeting(meeting.id)).toMatchObject({ title: "Renamed room", status: "idle" });
    restored.joinMeeting(meeting.id, "user-maya");
    expect(restored.getBootstrap("user-maya").conversations.find((candidate) => candidate.meetingId === meeting.id)?.name).toBe("Renamed room");
    expect(restored.getBootstrap("user-maya").messages).toContainEqual(expect.objectContaining({ body: "Room notes" }));
  });

  it("ends participants and revokes invitations on disable, then reopens without duplicate calls", () => {
    const { store, connect, update } = setup();
    const maya = connect("user-maya");
    const leo = connect("user-leo");
    const theo = connect("user-theo");
    update(maya, true);
    const meeting = store.getMeetings()[0]!;
    const host = maya.join(meeting.id);
    const guest = leo.join(meeting.id);
    maya.send({ type: "meeting.invite", requestId: "invite", sessionId: host.sessionId, targetUserId: "user-theo" });
    const invitation = theo.events.findLast((event) => event.type === "meeting.invited");
    expect(invitation?.type).toBe("meeting.invited");
    update(maya, false);
    expect(store.getMeeting(meeting.id)).toMatchObject({ status: "ended", participantIds: [] });
    expect(maya.events).toContainEqual({ type: "meeting.left", meetingId: meeting.id, sessionId: host.sessionId });
    expect(leo.events).toContainEqual({ type: "meeting.left", meetingId: meeting.id, sessionId: guest.sessionId });
    leo.send({ type: "meeting.join", requestId: "disabled", meetingId: meeting.id });
    expect(leo.events.at(-1)).toMatchObject({ type: "command.error", code: "MEETING_NOT_FOUND" });
    update(maya, true);
    expect(store.getMeetings()).toHaveLength(1);
    expect(store.getMeeting(meeting.id)?.status).toBe("idle");
    if (invitation?.type !== "meeting.invited") throw new Error("Missing invitation");
    theo.send({ type: "meeting.join", requestId: "expired", meetingId: meeting.id, invitationId: invitation.invitation.id });
    expect(theo.events.at(-1)).toMatchObject({ type: "command.error", code: "MEETING_INVITATION_EXPIRED" });
    expect(leo.join(meeting.id).locked).toBe(false);
  });

  it("requires permission and a current revision, and enforces room access and capacity", () => {
    const { store, runtime, connect, update, settings } = setup();
    store.getOrganisation().assignments = store.getOrganisation().assignments.filter((assignment) => assignment.userId !== "user-leo");
    store.getMember("user-leo")!.permissions = [];
    const maya = connect("user-maya");
    const leo = connect("user-leo");
    leo.send({ type: "room.update_settings", requestId: "direct", roomId: "room-daily", baseRevision: store.getLayout("floor-studio")!.revision, settings: settings(true) });
    expect(leo.events.at(-1)).toMatchObject({ type: "command.error", code: "PROJECT_APPROVAL_REQUIRED" });
    expect(store.getMeetings()).toHaveLength(0);
    applyRoomSettings(runtime, store, maya.id, { requestId: "stale", roomId: "room-daily", baseRevision: 999, settings: settings(true) });
    expect(maya.events.at(-1)).toMatchObject({ type: "command.error", code: "PROJECT_STALE" });
    expect(store.getMeetings()).toHaveLength(0);
    update(maya, true, { access: { mode: "assigned", assignedPersonIds: ["user-maya"], knockable: true } });
    const meeting = store.getMeetings()[0]!;
    leo.send({ type: "meeting.join", requestId: "private", meetingId: meeting.id });
    expect(leo.events.at(-1)).toMatchObject({ type: "command.error", code: "ROOM_ACCESS_REQUIRED" });
    update(maya, true);
    store.getRoom("room-daily")!.capacity = 1;
    maya.join(meeting.id);
    leo.send({ type: "meeting.join", requestId: "full", meetingId: meeting.id });
    expect(leo.events.at(-1)).toMatchObject({ type: "command.error", code: "ROOM_FULL" });
  });

  it("applies the setting through the proposal flow used by the UI", () => {
    const { store, runtime, connect, settings } = setup();
    store.getOrganisation().ceoIds = ["user-maya"];
    const maya = connect("user-maya");
    maya.send({ type: "public_economy.propose", requestId: "propose", title: "Enable meeting room", action: {
      kind: "room.settings", roomId: "room-daily", baseRevision: store.getLayout("floor-studio")!.revision, settings: settings(true),
    } });
    expect(store.getMeetings()).toHaveLength(0);
    const proposal = store.getPublicEconomy().proposals[0]!;
    expect(proposal.status).toBe("open");
    approveProposal(runtime, store.publicEconomy.proposal(proposal.id));
    maya.send({ type: "public_economy.execute", requestId: "apply", proposalId: proposal.id });
    expect(store.getRoom("room-daily")?.meetingRoom).toBe(true);
    expect(store.getMeetings()[0]?.status).toBe("idle");
  });

  it("ends a demolished room call while preserving calls on another floor", () => {
    const { store, runtime, connect, update } = setup();
    const maya = connect("user-maya");
    const leo = connect("user-leo");
    update(maya, true);
    const meeting = store.getMeetings()[0]!;
    const session = maya.join(meeting.id);
    const rooftopRoom = store.getLayout("floor-rooftop")!.rooms[0]!;
    store.updateRoomSettings(rooftopRoom.id, { name: rooftopRoom.name, color: rooftopRoom.color, access: { mode: "open", assignedPersonIds: [], knockable: false }, meetingRoom: true });
    const rooftopMeeting = store.getMeetings().find((candidate) => candidate.location.roomId === rooftopRoom.id)!;
    const otherSession = leo.join(rooftopMeeting.id);
    store.getRoom("room-focus")!.access = { mode: "open", assignedPersonIds: [], knockable: false };
    applyBuildingProject(runtime, store, maya.id, maya.events, {
      requestId: "remove-north-wall", baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "item.remove", item: { type: "wall", id: "wall-studio-top" } },
    });
    expect(maya.events.filter((event) => event.type === "command.error")).toEqual([]);
    expect(store.getRoom("room-daily")).toBeUndefined();
    expect(store.getMeeting(meeting.id)).toMatchObject({ status: "ended", participantIds: [] });
    expect(maya.events).toContainEqual({ type: "meeting.left", meetingId: meeting.id, sessionId: session.sessionId });
    expect(store.getMeeting(rooftopMeeting.id)).toMatchObject({ status: "live", participantIds: ["user-leo"] });
    expect(leo.events).not.toContainEqual({ type: "meeting.left", meetingId: rooftopMeeting.id, sessionId: otherSession.sessionId });
  });
});
