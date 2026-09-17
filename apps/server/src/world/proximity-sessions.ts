import type { MediaSignal, ProximityMediaSession, ServerEvent } from "@workhard/shared";
import { readMediaIceServers } from "../media/ice-servers.js";

interface ProximitySession {
  userId: string;
  peerId: string;
  sessionId: string;
  microphone: boolean;
  camera: boolean;
  callId?: string;
  published?: string;
  send: (event: ServerEvent) => void;
}

export class ProximitySessions {
  private readonly sessions = new Map<string, ProximitySession>();
  private readonly iceServers = readMediaIceServers();

  values(): IterableIterator<ProximitySession> {
    return this.sessions.values();
  }

  set(peer: { id: string; userId: string; send: ProximitySession["send"] }, sessionId: string, microphone: boolean, camera: boolean): void {
    if ([...this.sessions.values()].some((session) => session.sessionId === sessionId && session.peerId !== peer.id)) throw new Error("PROXIMITY_SESSION_INVALID");
    const current = this.sessions.get(peer.userId);
    if (current && (current.peerId !== peer.id || current.sessionId !== sessionId)) this.delete(peer.userId);
    const session = this.sessions.get(peer.userId);
    if (session) Object.assign(session, { microphone, camera });
    else this.sessions.set(peer.userId, { userId: peer.userId, peerId: peer.id, sessionId, microphone, camera, send: peer.send });
  }

  leave(peerId: string, sessionId: string): void {
    const session = [...this.sessions.values()].find((candidate) => candidate.peerId === peerId && candidate.sessionId === sessionId);
    if (session) this.delete(session.userId);
  }

  disconnect(peerId: string): void {
    for (const session of this.sessions.values()) if (session.peerId === peerId) this.delete(session.userId);
  }

  delete(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    this.sessions.delete(userId);
    session.send({ type: "proximity.left", sessionId: session.sessionId });
  }

  clear(): void {
    for (const userId of this.sessions.keys()) this.delete(userId);
  }

  reconcile(memberships: Map<string, string>): void {
    for (const session of this.sessions.values()) {
      const callId = memberships.get(session.userId);
      if (session.callId && !callId) this.delete(session.userId);
      else if (callId) session.callId = callId;
    }
    for (const session of this.sessions.values()) {
      const participants = [...this.sessions.values()]
        .filter((candidate) => candidate === session || Boolean(session.callId && candidate.callId === session.callId))
        .map(({ sessionId, userId, microphone, camera }) => ({ sessionId, userId, microphone, camera, screen: false }));
      const snapshot: ProximityMediaSession = { sessionId: session.sessionId, callId: session.callId ?? null, participants, iceServers: this.iceServers };
      const serialized = JSON.stringify(snapshot);
      if (serialized === session.published) continue;
      session.published = serialized;
      session.send({ type: "proximity.media_state", session: snapshot });
    }
  }

  signal(peerId: string, sessionId: string, targetSessionId: string, signal: MediaSignal): void {
    const session = [...this.sessions.values()].find((candidate) => candidate.peerId === peerId && candidate.sessionId === sessionId);
    const target = [...this.sessions.values()].find((candidate) => candidate.sessionId === targetSessionId);
    if (!session?.callId || !target || target === session || target.callId !== session.callId) throw new Error("PROXIMITY_PEER_UNAVAILABLE");
    target.send({ type: "proximity.signal", sessionId: targetSessionId, fromSessionId: sessionId, signal });
  }
}
