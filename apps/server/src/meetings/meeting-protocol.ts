import { z } from "zod";
import { mediaSignalSchema } from "../media/media-protocol.js";

const requestId = z.string().min(1).max(80);
const sessionId = z.string().uuid();

export const meetingCommands = [
  z.object({ type: z.literal("meeting.join"), requestId, meetingId: z.string().min(1).max(100), invitationId: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal("meeting.leave"), requestId, meetingId: z.string().min(1).max(100), sessionId }).strict(),
  z.object({ type: z.literal("meeting.media"), requestId, sessionId, microphone: z.boolean(), camera: z.boolean(), screen: z.boolean() }).strict(),
  z.object({ type: z.literal("meeting.signal"), requestId, sessionId, targetSessionId: sessionId, signal: mediaSignalSchema }).strict(),
  z.object({ type: z.literal("meeting.invite"), requestId, sessionId, targetUserId: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("meeting.lock"), requestId, sessionId, locked: z.boolean() }).strict(),
] as const;
