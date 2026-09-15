export interface MediaParticipant {
  sessionId: string;
  userId: string;
  microphone: boolean;
  camera: boolean;
  screen: boolean;
}

export interface MediaIceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface MediaSession {
  sessionId: string;
  participants: MediaParticipant[];
  iceServers: MediaIceServer[];
}

export interface ProximityMediaSession extends MediaSession {
  callId: string | null;
}

export type MediaSignal =
  | { type: "description"; description: { type: "offer" | "answer"; sdp: string } }
  | { type: "candidate"; candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment?: string | null } }
  | { type: "restart" };
