import { randomUUID } from "node:crypto";
import type { Meeting, MediaIceServer, MeetingInvitation, MediaParticipant, MeetingMediaSession, MediaSignal, ServerEvent } from "@workhard/shared";
import { readMediaIceServers } from "../media/ice-servers.js";

interface Session extends MediaParticipant {
  meetingId: string;
  peerId: string;
  send: (event: ServerEvent) => void;
}

interface MeetingAccess {
  hostUserId: string;
  locked: boolean;
}

export class MeetingSessions {
  private readonly sessions = new Map<string, Session>();
  private readonly access = new Map<string, MeetingAccess>();
  private readonly invitations = new Map<string, MeetingInvitation>();
  private readonly iceServers: MediaIceServer[];

  constructor() {
    this.iceServers = readMediaIceServers();
  }

  forPeer(peerId: string): Session | undefined {
    return [...this.sessions.values()].find((session) => session.peerId === peerId);
  }

  require(peerId: string, sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session || session.peerId !== peerId) throw new Error("MEETING_NOT_JOINED");
    return session;
  }

  join(peer: { id: string; userId: string; send: Session["send"] }, meeting: Meeting, requestId: string): void {
    const previous = [...this.sessions.values()].find((session) => session.userId === peer.userId);
    if (previous?.meetingId === meeting.id) {
      this.sessions.delete(previous.sessionId);
      previous.send({ type: "meeting.left", meetingId: previous.meetingId, sessionId: previous.sessionId });
    } else {
      this.removeUser(peer.userId);
    }
    const session: Session = { sessionId: randomUUID(), meetingId: meeting.id, peerId: peer.id, userId: peer.userId,
      microphone: false, camera: false, screen: false, send: peer.send };
    this.sessions.set(session.sessionId, session);
    if (!this.access.has(meeting.id)) this.access.set(meeting.id, { hostUserId: peer.userId, locked: false });
    peer.send({ type: "meeting.joined", requestId, meeting, session: this.snapshot(session) });
    this.publish(meeting.id);
  }

  removeUser(userId: string, requestId?: string): void {
    for (const session of this.sessions.values()) {
      if (session.userId !== userId) continue;
      this.sessions.delete(session.sessionId);
      session.send({ type: "meeting.left", meetingId: session.meetingId, sessionId: session.sessionId, ...(requestId ? { requestId } : {}) });
      const next = [...this.sessions.values()].find((candidate) => candidate.meetingId === session.meetingId);
      const access = this.access.get(session.meetingId);
      if (!next) this.access.delete(session.meetingId);
      else if (access?.hostUserId === userId) access.hostUserId = next.userId;
      for (const [id, invitation] of this.invitations) {
        if (invitation.inviterUserId === userId && invitation.meetingId === session.meetingId) this.invitations.delete(id);
      }
      this.publish(session.meetingId);
    }
  }

  authorizeJoin(userId: string, meetingId: string, invitationId?: string): boolean {
    const invitation = invitationId ? this.invitations.get(invitationId) : undefined;
    const invited = Boolean(invitation && invitation.targetUserId === userId && invitation.meetingId === meetingId
      && Date.parse(invitation.expiresAt) > Date.now());
    if (invitationId && !invited) throw new Error("MEETING_INVITATION_EXPIRED");
    const alreadyJoined = [...this.sessions.values()].some((session) => session.userId === userId && session.meetingId === meetingId);
    if (this.access.get(meetingId)?.locked && !invited && !alreadyJoined) throw new Error("MEETING_LOCKED");
    return invited;
  }

  consumeInvitation(id?: string): void {
    if (id) this.invitations.delete(id);
  }

  revokeInvitations(meetingId: string): void {
    for (const [id, invitation] of this.invitations) {
      if (invitation.meetingId === meetingId) this.invitations.delete(id);
    }
  }

  invite(peerId: string, sessionId: string, targetUserId: string): MeetingInvitation {
    const session = this.require(peerId, sessionId);
    if (targetUserId === session.userId || [...this.sessions.values()].some((candidate) => candidate.meetingId === session.meetingId && candidate.userId === targetUserId)) {
      throw new Error("MEETING_ALREADY_JOINED");
    }
    for (const [id, invitation] of this.invitations) {
      if (Date.parse(invitation.expiresAt) <= Date.now()) this.invitations.delete(id);
      else if (invitation.meetingId === session.meetingId && invitation.targetUserId === targetUserId) throw new Error("MEETING_INVITATION_PENDING");
    }
    const invitation: MeetingInvitation = { id: randomUUID(), meetingId: session.meetingId, inviterUserId: session.userId,
      targetUserId, expiresAt: new Date(Date.now() + 60_000).toISOString() };
    this.invitations.set(invitation.id, invitation);
    return invitation;
  }

  lock(peerId: string, sessionId: string, locked: boolean): void {
    const session = this.require(peerId, sessionId);
    const access = this.access.get(session.meetingId)!;
    if (access.hostUserId !== session.userId) throw new Error("MEETING_HOST_REQUIRED");
    access.locked = locked;
    this.publish(session.meetingId);
  }

  updateMedia(peerId: string, sessionId: string, media: Pick<MediaParticipant, "microphone" | "camera" | "screen">): void {
    const session = this.require(peerId, sessionId);
    Object.assign(session, media);
    this.publish(session.meetingId);
  }

  signal(peerId: string, sessionId: string, targetSessionId: string, signal: MediaSignal): void {
    const session = this.require(peerId, sessionId);
    const target = this.sessions.get(targetSessionId);
    if (!target || target.sessionId === sessionId || target.meetingId !== session.meetingId) throw new Error("MEETING_PEER_UNAVAILABLE");
    target.send({ type: "meeting.signal", sessionId: targetSessionId, fromSessionId: sessionId, signal });
  }

  private snapshot(session: Session): MeetingMediaSession {
    const participants = [...this.sessions.values()].filter((candidate) => candidate.meetingId === session.meetingId)
      .map(({ sessionId, userId, microphone, camera, screen }) => ({ sessionId, userId, microphone, camera, screen }));
    return { sessionId: session.sessionId, meetingId: session.meetingId, participants, ...this.access.get(session.meetingId)!, iceServers: this.iceServers };
  }

  private publish(meetingId: string): void {
    for (const session of this.sessions.values()) {
      if (session.meetingId === meetingId) session.send({ type: "meeting.media_state", session: this.snapshot(session) });
    }
  }
}
