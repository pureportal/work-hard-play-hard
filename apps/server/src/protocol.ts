import { z } from "zod";
import { REACTION_KINDS } from "@workhard/shared";

const requestId = z.string().min(1).max(80);

export const clientCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("movement.input"), sequence: z.number().int().nonnegative(), dx: z.number().min(-1).max(1), dy: z.number().min(-1).max(1) }),
  z.object({ type: z.literal("movement.set_destination"), requestId, x: z.number().finite(), y: z.number().finite() }),
  z.object({ type: z.literal("movement.approach_user"), requestId, targetUserId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("floor.change"), requestId, floorId: z.string().min(1).max(80) }),
  z.object({ type: z.literal("presence.set_availability"), requestId, availability: z.enum(["available", "busy", "dnd", "away"]) }),
  z.object({ type: z.literal("chat.send"), requestId, conversationId: z.string().min(1).max(100), body: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal("layout.apply"), requestId, baseRevision: z.number().int().nonnegative(), tool: z.enum(["wall", "door", "desk", "sofa", "plant", "erase"]), x: z.number().finite(), y: z.number().finite() }),
  z.object({
    type: z.literal("area.update_settings"),
    requestId,
    areaId: z.string().min(1).max(100),
    settings: z.object({
      type: z.enum(["meeting", "private"]),
      locked: z.boolean(),
      visibility: z.enum(["public", "members"]),
    }).strict(),
  }),
  z.object({ type: z.literal("area.knock"), requestId, areaId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("area.knock_respond"), requestId, knockId: z.string().min(1).max(100), accept: z.boolean() }),
  z.object({ type: z.literal("interaction.wave"), requestId, targetUserId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("interaction.react"), requestId, reaction: z.enum(REACTION_KINDS) }),
  z.object({ type: z.literal("call.request"), requestId, targetUserId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("call.respond"), requestId, callId: z.string().min(1).max(100), accept: z.boolean() }),
  z.object({ type: z.literal("call.end"), requestId, callId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("meeting.join"), requestId, meetingId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("meeting.leave"), requestId, meetingId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("game.start"), requestId, definitionId: z.literal("game-stack") }),
  z.object({ type: z.literal("game.end"), requestId }),
  z.object({ type: z.literal("game.command"), requestId, command: z.enum(["left", "right", "rotate", "down", "drop", "pause"]) }),
]);

export const invitationBodySchema = z.object({
  email: z.email(),
  role: z.enum(["admin", "member", "guest"]).default("member"),
});

export const roleBodySchema = z.object({
  role: z.enum(["admin", "member", "guest"]),
});

export const directConversationBodySchema = z.object({
  targetUserId: z.string().min(1).max(100),
}).strict();

const usernameSchema = z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/);
const passwordSchema = z.string().min(8).max(128);

export const registerBodySchema = z.object({
  username: usernameSchema,
  email: z.email(),
  password: passwordSchema,
}).strict();

export const loginBodySchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: passwordSchema,
}).strict();

export const magicLinkRequestBodySchema = z.object({
  email: z.email(),
}).strict();

export const magicLinkVerifyBodySchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();
