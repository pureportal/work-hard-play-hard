import { z } from "zod";
import {
  ASSIGNABLE_MEMBER_PERMISSIONS,
  KIDNAPPING_POLICY_MODES,
  REACTION_KINDS,
  TETRIS_COMMANDS,
  TETRIS_DEFINITION_ID,
  isValidEmailDomain,
  normalizeEmailDomain,
} from "@workhard/shared";

const requestId = z.string().min(1).max(80);
const position = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const roomAccess = z.object({
  mode: z.enum(["open", "assigned"]),
  assignedPersonIds: z.array(z.string().min(1).max(100)).max(100),
  knockable: z.boolean(),
}).strict();
const assetRotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const assetVariantId = z.string().min(1).max(40).regex(/^[a-z0-9-]+$/);
const gameSettings = z.object({
  allowPlayerAssetPlacementInPublicRooms: z.boolean(),
}).strict();
const kidnappingUserIds = z.array(z.string().min(1).max(100))
  .max(100)
  .refine((userIds) => new Set(userIds).size === userIds.length);
const kidnappingPolicy = z.object({
  mode: z.enum(KIDNAPPING_POLICY_MODES),
  userIds: kidnappingUserIds,
}).strict();
const globalKidnappingSettings = z.object({
  enabled: z.boolean(),
  targetPolicy: kidnappingPolicy,
}).strict();
const playerKidnappingSettings = z.object({
  carrierPolicy: kidnappingPolicy,
}).strict();
const layoutItem = z.discriminatedUnion("type", [
  z.object({ type: z.literal("asset"), id: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("wall"), id: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("opening"), id: z.string().min(1).max(100) }).strict(),
]);
const layoutEdit = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("wall"), start: position, end: position }).strict(),
  z.object({
    tool: z.literal("asset"),
    position,
    assetId: z.string().min(1).max(100),
    variantId: assetVariantId,
    rotation: assetRotation,
  }).strict(),
  z.object({
    tool: z.literal("asset.move"),
    objectId: z.string().min(1).max(100),
    position,
    variantId: assetVariantId,
    rotation: assetRotation,
  }).strict(),
  z.object({
    tool: z.literal("wall.move"),
    wallId: z.string().min(1).max(100),
    start: position,
    end: position,
  }).strict(),
  z.object({
    tool: z.literal("opening.move"),
    openingId: z.string().min(1).max(100),
    position,
  }).strict(),
  z.object({ tool: z.literal("item.remove"), item: layoutItem }).strict(),
  z.object({
    tool: z.enum(["door", "window", "erase"]),
    position,
  }).strict(),
]);

export const clientCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("movement.input"), sequence: z.number().int().nonnegative(), dx: z.number().min(-1).max(1), dy: z.number().min(-1).max(1) }),
  z.object({
    type: z.literal("movement.set_destination"),
    requestId,
    floorId: z.string().min(1).max(80),
    x: z.number().finite(),
    y: z.number().finite(),
  }).strict(),
  z.object({ type: z.literal("movement.stop"), requestId }).strict(),
  z.object({ type: z.literal("movement.approach_user"), requestId, targetUserId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("kidnapping.start"), requestId, targetUserId: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("kidnapping.stop"), requestId }).strict(),
  z.object({ type: z.literal("kidnapping.global_settings_update"), requestId, settings: globalKidnappingSettings }).strict(),
  z.object({ type: z.literal("kidnapping.player_settings_update"), requestId, settings: playerKidnappingSettings }).strict(),
  z.object({ type: z.literal("presence.set_availability"), requestId, availability: z.enum(["available", "busy", "dnd", "away"]) }),
  z.object({ type: z.literal("proximity.set_media"), requestId, microphone: z.boolean(), camera: z.boolean() }),
  z.object({ type: z.literal("chat.send"), requestId, conversationId: z.string().min(1).max(100), body: z.string().trim().min(1).max(500) }),
  z.object({
    type: z.literal("layout.apply"),
    requestId,
    baseRevision: z.number().int().nonnegative(),
    edit: layoutEdit,
  }).strict(),
  z.object({
    type: z.literal("player_asset.place"),
    requestId,
    baseRevision: z.number().int().nonnegative(),
    ownedAssetId: z.string().uuid(),
    position,
    variantId: assetVariantId,
    rotation: assetRotation,
  }).strict(),
  z.object({
    type: z.literal("player_asset.move"),
    requestId,
    baseRevision: z.number().int().nonnegative(),
    objectId: z.string().uuid(),
    position,
    variantId: assetVariantId,
    rotation: assetRotation,
  }).strict(),
  z.object({
    type: z.literal("player_asset.remove"),
    requestId,
    baseRevision: z.number().int().nonnegative(),
    objectId: z.string().uuid(),
  }).strict(),
  z.object({ type: z.literal("economy.claim_daily"), requestId }).strict(),
  z.object({ type: z.literal("economy.purchase_asset"), requestId, assetId: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("game.settings_update"), requestId, settings: gameSettings }).strict(),
  z.object({ type: z.literal("asset.interact"), requestId, objectId: z.string().min(1).max(100), interactionId: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("seat.leave"), requestId }).strict(),
  z.object({
    type: z.literal("room.update_settings"),
    requestId,
    baseRevision: z.number().int().nonnegative(),
    roomId: z.string().min(1).max(100),
    settings: z.object({
      name: z.string().trim().min(1).max(60),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      access: roomAccess,
    }).strict(),
  }).strict(),
  z.object({ type: z.literal("room.knock"), requestId, roomId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("room.knock_respond"), requestId, knockId: z.string().min(1).max(100), accept: z.boolean() }),
  z.object({ type: z.literal("interaction.wave"), requestId, targetUserId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("interaction.react"), requestId, reaction: z.enum(REACTION_KINDS) }),
  z.object({ type: z.literal("interaction.ring_gong"), requestId, objectId: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("call.request"), requestId, targetUserId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("call.respond"), requestId, callId: z.string().min(1).max(100), accept: z.boolean() }),
  z.object({ type: z.literal("call.end"), requestId, callId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("meeting.join"), requestId, meetingId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("meeting.leave"), requestId, meetingId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("game.start"), requestId, definitionId: z.literal(TETRIS_DEFINITION_ID) }),
  z.object({ type: z.literal("game.end"), requestId }),
  z.object({ type: z.literal("game.command"), requestId, command: z.enum(TETRIS_COMMANDS) }),
]);

const memberPermissionsSchema = z.array(z.enum(ASSIGNABLE_MEMBER_PERMISSIONS))
  .max(ASSIGNABLE_MEMBER_PERMISSIONS.length)
  .refine((permissions) => new Set(permissions).size === permissions.length);

export const invitationBodySchema = z.object({
  email: z.email(),
  role: z.enum(["admin", "member", "guest"]).default("member"),
  permissions: memberPermissionsSchema.default([]),
}).strict().refine(({ role, permissions }) => role === "member" || permissions.length === 0);

const invitationTokenSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/);

export const invitationAcceptBodySchema = z.object({
  token: invitationTokenSchema,
}).strict();

export const memberAccessBodySchema = z.object({
  role: z.enum(["admin", "member", "guest"]),
  permissions: memberPermissionsSchema,
}).strict().refine(({ role, permissions }) => role === "member" || permissions.length === 0);

const emailDomainSchema = z.string().max(253)
  .transform(normalizeEmailDomain)
  .refine(isValidEmailDomain);

export const registrationSettingsBodySchema = z.object({
  enabled: z.boolean(),
  invitationRequired: z.boolean(),
  whitelistedDomains: z.array(emailDomainSchema)
    .max(100)
    .refine((domains) => new Set(domains).size === domains.length),
  defaultRole: z.enum(["admin", "member", "guest"]),
}).strict();

const brandColorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).transform((color) => color.toLowerCase());

export const corporateIdentityBodySchema = z.object({
  applicationName: z.string().trim().min(1).max(60),
  primaryColor: brandColorSchema,
  secondaryColor: brandColorSchema,
  authenticationLayout: z.enum(["split", "centered"]),
}).strict();

export const directConversationBodySchema = z.object({
  targetUserId: z.string().min(1).max(100),
}).strict();

const usernameSchema = z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/);
const passwordSchema = z.string().min(8).max(128);

export const registerBodySchema = z.object({
  username: usernameSchema,
  email: z.email(),
  password: passwordSchema,
  invitationToken: invitationTokenSchema.optional(),
}).strict();

export const loginBodySchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: passwordSchema,
}).strict();

export const magicLinkRequestBodySchema = z.object({
  email: z.email(),
  invitationToken: invitationTokenSchema.optional(),
}).strict();

export const magicLinkVerifyBodySchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();
