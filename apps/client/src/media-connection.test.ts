import type { ClientCommand, MeetingMediaSession, MediaSignal } from "@workhard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaConnection } from "./media-connection";

class Stream extends EventTarget {
  private tracks: MediaStreamTrack[] = [];
  addTrack(track: MediaStreamTrack) { this.tracks.push(track); }
  removeTrack(track: MediaStreamTrack) { this.tracks = this.tracks.filter((item) => item !== track); }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === "audio"); }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === "video"); }
}

class PeerConnection {
  static instances: PeerConnection[] = [];
  transceivers: { direction: string; sender: { replaceTrack: ReturnType<typeof vi.fn> } }[] = [];
  remoteDescription: RTCSessionDescriptionInit | null = null;
  localDescription: RTCSessionDescriptionInit | null = null;
  connectionState = "new";
  iceConnectionState = "new";
  onnegotiationneeded?: (() => void) | null;
  onconnectionstatechange?: (() => void) | null;
  oniceconnectionstatechange?: (() => void) | null;
  onicecandidate?: unknown;
  ontrack?: ((event: { track: MediaStreamTrack; transceiver: unknown }) => void) | null;
  restartIce = vi.fn();
  close = vi.fn();
  addIceCandidate = vi.fn().mockResolvedValue(undefined);
  constructor(readonly configuration: RTCConfiguration) { PeerConnection.instances.push(this); }
  addTransceiver(_kind: string, options: { direction: string }) {
    const transceiver = { direction: options.direction, sender: { replaceTrack: vi.fn().mockResolvedValue(undefined) } };
    this.transceivers.push(transceiver);
    return transceiver;
  }
  getTransceivers() { return this.transceivers; }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    if (!this.transceivers.length) for (const kind of ["audio", "video", "video", "audio"]) this.addTransceiver(kind, { direction: "recvonly" });
  }
  async setLocalDescription() {
    this.localDescription = { type: this.remoteDescription?.type === "offer" ? "answer" : "offer", sdp: "v=0" };
  }
}

const connections: MediaConnection[] = [];
beforeEach(() => {
  PeerConnection.instances = [];
  vi.stubGlobal("RTCPeerConnection", PeerConnection);
  vi.stubGlobal("MediaStream", Stream);
});
afterEach(() => { connections.splice(0).forEach((connection) => connection.close()); vi.unstubAllGlobals(); vi.useRealTimers(); });

function fixture(localId = "b", remoteId = "a") {
  const session: MeetingMediaSession = { sessionId: localId, meetingId: "meeting", hostUserId: "local", locked: false, iceServers: [],
    participants: [{ sessionId: localId, userId: "local", microphone: false, camera: false, screen: false },
      { sessionId: remoteId, userId: "remote", microphone: false, camera: false, screen: false }] };
  const send = vi.fn<(command: ClientCommand) => boolean>().mockReturnValue(true);
  const connection = new MediaConnection(session, send);
  connections.push(connection);
  connection.start();
  const receive = (signal: MediaSignal) => connection.handle({ type: "meeting.signal", sessionId: localId, fromSessionId: remoteId, signal });
  return { connection, send, session, receive, peer: PeerConnection.instances[0]! };
}

function stream(kind: "audio" | "video") {
  const track = { kind, stop: vi.fn() } as unknown as MediaStreamTrack;
  const media = new Stream();
  media.addTrack(track);
  return media as unknown as MediaStream;
}

describe("meeting peer media", () => {
  it("passes the session's STUN and TURN configuration to each peer", () => {
    const { connection, session } = fixture();
    const iceServers = [{ urls: ["stun:media.example.test:3478"] },
      { urls: ["turns:media.example.test:5349"], username: "participant", credential: "test-credential" }];
    connection.handle({ type: "meeting.media_state", session: { ...session, iceServers,
      participants: [...session.participants, { sessionId: "c", userId: "third", microphone: false, camera: false, screen: false }] } });
    expect(PeerConnection.instances[1]!.configuration).toEqual({ iceServers, bundlePolicy: "max-bundle" });
  });

  it("answers with outgoing microphone, camera, screen and shared audio enabled", async () => {
    const { connection, send, receive, peer } = fixture();
    const microphone = stream("audio");
    const camera = stream("video");
    const screen = stream("video");
    screen.addTrack(stream("audio").getAudioTracks()[0]!);
    connection.setStreams({ microphone, camera, screen });
    receive({ type: "description", description: { type: "offer", sdp: "v=0" } });
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "meeting.signal", signal: { type: "description", description: { type: "answer", sdp: "v=0" } } })));
    expect(peer.transceivers.map((transceiver) => transceiver.direction)).toEqual(["sendrecv", "sendrecv", "sendrecv", "sendrecv"]);
    [microphone.getAudioTracks()[0], camera.getVideoTracks()[0], screen.getVideoTracks()[0], screen.getAudioTracks()[0]].forEach((track, index) => {
      expect(peer.transceivers[index]!.sender.replaceTrack).toHaveBeenLastCalledWith(track);
    });
    connection.setStreams({ camera });
    await vi.waitFor(() => expect(peer.transceivers[0]!.sender.replaceTrack).toHaveBeenLastCalledWith(null));
    expect(peer.transceivers[1]!.sender.replaceTrack).toHaveBeenLastCalledWith(camera.getVideoTracks()[0]);
    expect(peer.transceivers[2]!.sender.replaceTrack).toHaveBeenLastCalledWith(null);
    expect(peer.transceivers[3]!.sender.replaceTrack).toHaveBeenLastCalledWith(null);
  });

  it("buffers early ICE candidates and rejects signals for other sessions", async () => {
    const { connection, session, receive, peer, send } = fixture();
    const candidate = { candidate: "candidate", sdpMid: "0", sdpMLineIndex: 0 };
    receive({ type: "candidate", candidate });
    connection.handle({ type: "meeting.media_state", session: { ...session, sessionId: "stale", participants: [] } });
    connection.handle({ type: "meeting.media_state", session: { ...session, meetingId: "another", participants: [] } });
    connection.handle({ type: "meeting.signal", sessionId: "stale", fromSessionId: "a", signal: { type: "description", description: { type: "offer", sdp: "wrong" } } });
    await Promise.resolve();
    expect(peer.addIceCandidate).not.toHaveBeenCalled();
    expect(peer.remoteDescription).toBeNull();
    expect(peer.close).not.toHaveBeenCalled();
    receive({ type: "description", description: { type: "offer", sdp: "v=0" } });
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    expect(peer.addIceCandidate).toHaveBeenCalledExactlyOnceWith(candidate);
  });

  it("uses separate remote streams and releases departed peers without stopping local capture", async () => {
    const { connection, session, receive, peer } = fixture();
    const microphone = stream("audio");
    connection.setStreams({ microphone });
    receive({ type: "description", description: { type: "offer", sdp: "v=0" } });
    await vi.waitFor(() => expect(peer.transceivers).toHaveLength(4));
    const camera = stream("video").getVideoTracks()[0]!;
    const screen = stream("video").getVideoTracks()[0]!;
    const audio = stream("audio").getAudioTracks()[0]!;
    peer.ontrack?.({ track: camera, transceiver: peer.transceivers[1] });
    peer.ontrack?.({ track: screen, transceiver: peer.transceivers[2] });
    peer.ontrack?.({ track: audio, transceiver: peer.transceivers[3] });
    expect(connection.getSnapshot().remote.get("a")?.screen.getTracks()).toEqual([screen]);
    expect(connection.getSnapshot().remote.get("a")?.camera.getTracks()).toEqual([camera]);
    expect(connection.getSnapshot().remote.get("a")?.audio.getTracks()).toEqual([audio]);
    connection.handle({ type: "meeting.media_state", session: { ...session, participants: [session.participants[0]!] } });
    expect(connection.getSnapshot().remote.size).toBe(0);
    expect(peer.close).toHaveBeenCalledOnce();
    for (const track of [camera, screen, audio]) expect(track.stop).toHaveBeenCalledOnce();
    expect(microphone.getTracks()[0]!.stop).not.toHaveBeenCalled();
  });

  it("bounds ICE recovery and lets a participant retry", () => {
    vi.useFakeTimers();
    const { connection, peer } = fixture("a", "b");
    peer.connectionState = "disconnected";
    peer.onconnectionstatechange?.();
    vi.advanceTimersByTime(3_000);
    expect(peer.restartIce).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30_000);
    expect(peer.restartIce).toHaveBeenCalledTimes(2);
    expect(connection.getSnapshot().remote.get("b")?.state).toBe("failed");
    connection.retry();
    expect(peer.restartIce).toHaveBeenCalledTimes(3);
    peer.connectionState = "connected";
    peer.onconnectionstatechange?.();
    expect(connection.getSnapshot().remote.get("b")?.state).toBe("connected");
    vi.advanceTimersByTime(60_000);
    expect(peer.restartIce).toHaveBeenCalledTimes(3);
  });

  it("does not send queued offers or track updates after closing", async () => {
    const { connection, peer, send } = fixture("a", "b");
    peer.onnegotiationneeded?.();
    connection.close();
    await Promise.resolve();
    connection.setStreams({ microphone: stream("audio") });
    expect(send).not.toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalledOnce();
  });

  it("does not recreate peers when a closed connection is started again", () => {
    const { connection } = fixture();
    connection.close();
    connection.start();
    expect(PeerConnection.instances).toHaveLength(1);
    expect(connection.getSnapshot().remote.size).toBe(0);
  });

  it("abandons an in-flight offer after its participant leaves", async () => {
    const { connection, peer, session, send } = fixture("a", "b");
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => { complete = resolve; });
    peer.transceivers[0]!.sender.replaceTrack.mockReturnValueOnce(pending);
    const describe = vi.spyOn(peer, "setLocalDescription");
    peer.onnegotiationneeded?.();
    await vi.waitFor(() => expect(peer.transceivers[0]!.sender.replaceTrack).toHaveBeenCalled());
    connection.handle({ type: "meeting.media_state", session: { ...session, participants: [session.participants[0]!] } });
    complete();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(describe).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send a description that finishes after its participant leaves", async () => {
    const { connection, peer, session, receive, send } = fixture();
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => { complete = resolve; });
    const describe = vi.spyOn(peer, "setLocalDescription").mockImplementation(async () => {
      await pending;
      peer.localDescription = { type: "answer", sdp: "v=0" };
    });
    receive({ type: "description", description: { type: "offer", sdp: "v=0" } });
    await vi.waitFor(() => expect(describe).toHaveBeenCalled());
    connection.handle({ type: "meeting.media_state", session: { ...session, participants: [session.participants[0]!] } });
    complete();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(send).not.toHaveBeenCalled();
  });

  it("recovers ICE failures without waiting for the aggregate connection state", () => {
    vi.useFakeTimers();
    const { connection, peer } = fixture("a", "b");
    peer.connectionState = "connecting";
    peer.iceConnectionState = "failed";
    peer.oniceconnectionstatechange?.();
    expect(peer.restartIce).toHaveBeenCalledOnce();
    peer.connectionState = "failed";
    peer.onconnectionstatechange?.();
    expect(peer.restartIce).toHaveBeenCalledOnce();
    peer.iceConnectionState = "checking";
    peer.connectionState = "connecting";
    peer.oniceconnectionstatechange?.();
    peer.iceConnectionState = "connected";
    peer.connectionState = "connected";
    peer.onconnectionstatechange?.();
    expect(connection.getSnapshot().remote.get("b")?.state).toBe("connected");
    vi.advanceTimersByTime(60_000);
    expect(peer.restartIce).toHaveBeenCalledOnce();
    connection.close();
    expect(peer.oniceconnectionstatechange).toBeNull();
  });

  it("asks the offerer to restart when the answering peer loses ICE", () => {
    const { peer, send } = fixture();
    peer.iceConnectionState = "failed";
    peer.oniceconnectionstatechange?.();
    expect(peer.restartIce).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "meeting.signal", targetSessionId: "a", signal: { type: "restart" } }));
  });
});
