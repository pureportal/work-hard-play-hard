import { describe, expect, it } from "vitest";
import { clientCommandSchema } from "../protocol.js";
import { mediaIceServersSchema } from "../media/media-protocol.js";

describe("meeting protocol", () => {
  const sessionId = "12345678-1234-4123-8123-123456789abc";
  it("requires a session for leave and bounds media signaling payloads", () => {
    expect(clientCommandSchema.safeParse({ type: "meeting.leave", requestId: "leave", meetingId: "meeting" }).success).toBe(false);
    const command = { type: "meeting.signal", requestId: "signal", sessionId, targetSessionId: sessionId,
      signal: { type: "description", description: { type: "offer", sdp: "x".repeat(24_001) } } };
    expect(clientCommandSchema.safeParse(command).success).toBe(false);
    command.signal.description.sdp = "v=0";
    expect(clientCommandSchema.safeParse(command).success).toBe(true);
  });

  it("accepts explicit STUN/TURN configuration and rejects other URL schemes", () => {
    expect(mediaIceServersSchema.safeParse([{ urls: ["stun:example.test:3478", "turns:example.test:5349"], username: "user", credential: "password" }]).success).toBe(true);
    expect(mediaIceServersSchema.safeParse([{ urls: ["https://example.test"] }]).success).toBe(false);
    expect(mediaIceServersSchema.safeParse([{ urls: ["turn:example.test:3478"] }]).success).toBe(false);
    expect(mediaIceServersSchema.safeParse([{ urls: ["turn:example.test:3478"], username: "user", credential: "" }]).success).toBe(false);
    expect(mediaIceServersSchema.safeParse([{ urls: ["stun:example.test:3478"] }]).success).toBe(true);
  });
});
