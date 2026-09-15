import type { MediaSession } from "./media.js";

export interface MeetingMediaSession extends MediaSession {
  meetingId: string;
  hostUserId: string;
  locked: boolean;
}

export interface MeetingInvitation {
  id: string;
  meetingId: string;
  inviterUserId: string;
  targetUserId: string;
  expiresAt: string;
}
