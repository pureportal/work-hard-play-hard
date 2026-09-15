import type { ClientCommand, MeetingMediaSession, ProximityMediaSession, MediaSignal, ServerEvent } from "@workhard/shared";

export interface MediaStreams {
  microphone?: MediaStream;
  camera?: MediaStream;
  screen?: MediaStream;
}

export interface RemoteMedia {
  camera: MediaStream;
  screen: MediaStream;
  audio: MediaStream;
  state: "connecting" | "connected" | "failed";
}

interface Peer {
  connection: RTCPeerConnection;
  media: RemoteMedia;
  queue: Promise<void>;
  candidates: RTCIceCandidateInit[];
  timer?: ReturnType<typeof setTimeout>;
  restarts: number;
}

export class MediaConnection<Session extends MeetingMediaSession | ProximityMediaSession = MeetingMediaSession> {
  private readonly peers = new Map<string, Peer>();
  private readonly listeners = new Set<() => void>();
  private streams: MediaStreams = {};
  private closed = false;
  private snapshot: { session: Session; remote: ReadonlyMap<string, RemoteMedia> };

  constructor(session: Session, private readonly send: (command: ClientCommand) => boolean) {
    this.snapshot = { session, remote: new Map() };
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  handle(event: ServerEvent): void {
    if (this.closed) return;
    const current = this.snapshot.session;
    if ((event.type === "meeting.media_state" && "meetingId" in current && event.session.meetingId === current.meetingId
      || event.type === "proximity.media_state" && "callId" in current) && event.session.sessionId === current.sessionId) {
      this.snapshot = { ...this.snapshot, session: event.session as Session };
      this.synchronize();
    } else if ((event.type === "meeting.signal" && "meetingId" in current || event.type === "proximity.signal" && "callId" in current)
      && event.sessionId === current.sessionId) {
      this.synchronize();
      const peer = this.peers.get(event.fromSessionId);
      if (peer) this.enqueue(event.fromSessionId, peer, () => this.receive(event.fromSessionId, peer, event.signal));
    }
  }

  start(): void {
    this.synchronize();
  }

  setStreams(streams: MediaStreams): void {
    if (this.closed) return;
    this.streams = streams;
    for (const [id, peer] of this.peers) this.enqueue(id, peer, () => this.replaceTracks(peer));
    const media = { requestId: crypto.randomUUID(), sessionId: this.snapshot.session.sessionId,
      microphone: Boolean(streams.microphone), camera: Boolean(streams.camera) };
    this.command("callId" in this.snapshot.session
      ? { type: "proximity.set_media", ...media }
      : { type: "meeting.media", ...media, screen: Boolean(streams.screen) });
  }

  retry(): void {
    for (const [id, peer] of this.peers) {
      if (peer.media.state === "connected") continue;
      peer.restarts = 0;
      this.restart(id, peer);
    }
  }

  close(): void {
    this.closed = true;
    for (const peer of this.peers.values()) this.closePeer(peer);
    this.peers.clear();
    this.streams = {};
    this.listeners.clear();
  }

  private synchronize(): void {
    const { session } = this.snapshot;
    const remoteIds = new Set(session.participants.filter((participant) => participant.sessionId !== session.sessionId).map((participant) => participant.sessionId));
    for (const [id, peer] of this.peers) {
      if (!remoteIds.has(id)) {
        this.closePeer(peer);
        this.peers.delete(id);
      }
    }
    if (typeof RTCPeerConnection !== "undefined") {
      for (const id of remoteIds) if (!this.peers.has(id)) this.createPeer(id);
    }
    this.publish();
  }

  private createPeer(id: string): void {
    const connection = new RTCPeerConnection({ iceServers: this.snapshot.session.iceServers, bundlePolicy: "max-bundle" });
    const peer: Peer = { connection, media: { camera: new MediaStream(), screen: new MediaStream(), audio: new MediaStream(), state: "connecting" },
      queue: Promise.resolve(), candidates: [], restarts: 0 };
    this.peers.set(id, peer);
    connection.onicecandidate = ({ candidate }) => {
      if (candidate && this.peers.get(id) === peer) this.signal(id, { type: "candidate", candidate: candidate.toJSON() as Extract<MediaSignal, { type: "candidate" }>["candidate"] });
    };
    connection.ontrack = ({ track, transceiver }) => {
      const index = connection.getTransceivers().indexOf(transceiver);
      const stream = track.kind === "audio" ? peer.media.audio : index === 2 ? peer.media.screen : peer.media.camera;
      stream.addTrack(track);
      track.onunmute = () => this.publish();
      track.onended = () => { stream.removeTrack(track); this.publish(); };
      this.publish();
    };
    connection.onconnectionstatechange = () => {
      if (this.peers.get(id) !== peer) return;
      const state = connection.connectionState;
      if (state === "connected") {
        clearTimeout(peer.timer);
        peer.restarts = 0;
        peer.media.state = "connected";
      } else if (state === "failed") {
        this.restart(id, peer);
      } else if (state === "disconnected") {
        peer.media.state = "connecting";
        clearTimeout(peer.timer);
        peer.timer = setTimeout(() => this.restart(id, peer), 3_000);
      }
      this.publish();
    };
    if (this.isOfferer(id)) {
      for (const kind of ["audio", "video", "video", "audio"]) connection.addTransceiver(kind, { direction: "sendrecv" });
      connection.onnegotiationneeded = () => this.enqueue(id, peer, async () => {
        await this.replaceTracks(peer);
        await connection.setLocalDescription();
        this.sendDescription(id, connection);
      });
    }
    peer.timer = setTimeout(() => this.restart(id, peer), 15_000);
  }

  private isOfferer(id: string): boolean {
    return this.snapshot.session.sessionId < id;
  }

  private async replaceTracks(peer: Peer): Promise<void> {
    const tracks = [this.streams.microphone?.getAudioTracks()[0], this.streams.camera?.getVideoTracks()[0],
      this.streams.screen?.getVideoTracks()[0], this.streams.screen?.getAudioTracks()[0]];
    await Promise.all(peer.connection.getTransceivers().map((transceiver, index) => {
      transceiver.direction = "sendrecv";
      return transceiver.sender.replaceTrack(tracks[index] ?? null);
    }));
  }

  private async receive(id: string, peer: Peer, signal: MediaSignal): Promise<void> {
    const connection = peer.connection;
    if (signal.type === "restart") {
      if (this.isOfferer(id)) connection.restartIce();
      return;
    }
    if (signal.type === "candidate") {
      if (connection.remoteDescription) await connection.addIceCandidate(signal.candidate);
      else if (peer.candidates.length < 128) peer.candidates.push(signal.candidate);
      return;
    }
    if ((signal.description.type === "offer") === this.isOfferer(id)) return;
    await connection.setRemoteDescription(signal.description);
    for (const candidate of peer.candidates.splice(0)) await connection.addIceCandidate(candidate);
    if (signal.description.type === "offer") {
      await this.replaceTracks(peer);
      await connection.setLocalDescription();
      this.sendDescription(id, connection);
    }
  }

  private sendDescription(id: string, connection: RTCPeerConnection): void {
    const description = connection.localDescription;
    if (description && (description.type === "offer" || description.type === "answer")) {
      this.signal(id, { type: "description", description: { type: description.type, sdp: description.sdp } });
    }
  }

  private signal(id: string, signal: MediaSignal): void {
    this.command({ type: "callId" in this.snapshot.session ? "proximity.signal" : "meeting.signal", requestId: crypto.randomUUID(), sessionId: this.snapshot.session.sessionId, targetSessionId: id, signal });
  }

  private command(command: ClientCommand): void {
    if (!this.closed) this.send(command);
  }

  private enqueue(id: string, peer: Peer, operation: () => Promise<void>): void {
    peer.queue = peer.queue.then(async () => {
      if (!this.closed && this.peers.get(id) === peer) await operation();
    }).catch(() => {
      if (!this.closed && this.peers.get(id) === peer) {
        peer.media.state = "failed";
        this.publish();
      }
    });
  }

  private restart(id: string, peer: Peer): void {
    if (this.closed || this.peers.get(id) !== peer) return;
    clearTimeout(peer.timer);
    if (peer.restarts >= 2) {
      peer.media.state = "failed";
      this.publish();
      return;
    }
    peer.restarts += 1;
    peer.media.state = "connecting";
    if (this.isOfferer(id)) peer.connection.restartIce();
    else this.signal(id, { type: "restart" });
    peer.timer = setTimeout(() => this.restart(id, peer), 15_000);
    this.publish();
  }

  private closePeer(peer: Peer): void {
    clearTimeout(peer.timer);
    peer.connection.ontrack = null;
    peer.connection.onicecandidate = null;
    peer.connection.onnegotiationneeded = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.close();
    for (const stream of [peer.media.camera, peer.media.screen, peer.media.audio]) {
      for (const track of stream.getTracks()) { track.onunmute = null; track.onended = null; track.stop(); }
    }
  }

  private publish(): void {
    if (this.closed) return;
    this.snapshot = { ...this.snapshot, remote: new Map([...this.peers].map(([id, peer]) => [id, { ...peer.media }])) };
    for (const listener of this.listeners) listener();
  }
}
