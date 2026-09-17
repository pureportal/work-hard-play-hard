import { z } from "zod";
import { publicEconomyCommands } from "./economy/public-economy-schema.js";
import { organisationEditSchema, roomPermissionSchema, gameSettingsSchema } from "./organisation/organisation-schema.js";
import { meetingCommands } from "./meetings/meeting-protocol.js";
import { mediaSignalSchema } from "./media/media-protocol.js";
import { workObjectEditSchema } from "./work/work-object-state.js";
import {
  ASSIGNABLE_MEMBER_PERMISSIONS,
  BOT_DIFFICULTIES,
  CHESS_ACCESS_MODES,
  CHESS_PROMOTION_PIECES,
  CHESS_TIME_CONTROLS,
  KIDNAPPING_POLICY_MODES,
  REACTION_KINDS,
  FALLING_BLOCKS_COMMANDS,
  FALLING_BLOCKS_DEFINITION_ID,
  FALLING_BLOCKS_MODES,
  FALLING_BLOCKS_ATTACK_TARGETS,
  TIC_TAC_TOE_DEFINITION_ID,
  TIC_TAC_TOE_PIECE_SIZES,
  TIC_TAC_TOE_VARIANTS,
  isValidEmailDomain,
  normalizeEmailDomain,
} from "@workhard/shared";

const requestId = z.string().min(1).max(80);
const position = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const roomAccess = roomPermissionSchema.extend({ knockable: z.boolean() });
const assetRotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const assetVariantId = z.string().min(1).max(40).regex(/^[a-z0-9-]+$/);
const gameSettings = gameSettingsSchema;
const ticTacToeCell = z.number().int().min(0).max(8);
const ticTacToeCommand = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("classic.place"), cell: ticTacToeCell }).strict(),
  z.object({ kind: z.literal("ultimate.place"), board: ticTacToeCell, cell: ticTacToeCell }).strict(),
  z.object({ kind: z.literal("stacking.place"), cell: ticTacToeCell, size: z.enum(TIC_TAC_TOE_PIECE_SIZES) }).strict(),
  z.object({ kind: z.literal("stacking.move"), fromCell: ticTacToeCell, toCell: ticTacToeCell }).strict(),
]);
const gameBot = z.object({ difficulty: z.enum(BOT_DIFFICULTIES) }).strict();
const gameStart = z.object({
  type: z.literal("game.start"),
  requestId,
  definitionId: z.enum([FALLING_BLOCKS_DEFINITION_ID, TIC_TAC_TOE_DEFINITION_ID]),
  objectId: z.string().min(1).max(128),
  variantId: z.enum(TIC_TAC_TOE_VARIANTS.map((variant) => variant.id)).optional(),
  bot: gameBot.optional(),
  solo: z.boolean().optional(),
  settings: z.object({
    mode: z.enum(FALLING_BLOCKS_MODES),
    attackTarget: z.enum(FALLING_BLOCKS_ATTACK_TARGETS),
  }).strict().optional(),
}).strict().superRefine(({ definitionId, variantId, bot, solo, settings }, context) => {
  if ((definitionId === TIC_TAC_TOE_DEFINITION_ID) !== (variantId !== undefined)) {
    context.addIssue({ code: "custom", message: "Variant does not match the game." });
  }
  if ((bot && definitionId !== TIC_TAC_TOE_DEFINITION_ID) || (solo !== undefined && definitionId !== FALLING_BLOCKS_DEFINITION_ID)) {
    context.addIssue({ code: "custom", message: "Opponent does not match the game." });
  }
  if (settings && definitionId !== FALLING_BLOCKS_DEFINITION_ID) {
    context.addIssue({ code: "custom", message: "Settings do not match the game." });
  }
});
const chessMatchId = z.string().uuid();
const chessMatchSettings = z.object({
  timeControl: z.enum(CHESS_TIME_CONTROLS),
  pauseWeekends: z.boolean(),
  access: z.enum(CHESS_ACCESS_MODES),
  opponentUserId: z.string().min(1).max(100).optional(),
  bot: gameBot.optional(),
}).strict().refine(
  ({ access, opponentUserId, bot }) => bot
    ? access === "locked" && opponentUserId === undefined
    : access === "locked" ? Boolean(opponentUserId) : opponentUserId === undefined,
).refine(({ timeControl, pauseWeekends }) => !pauseWeekends || timeControl === "daily");
const chessMove = z.object({
  from: z.string().regex(/^[a-h][1-8]$/),
  to: z.string().regex(/^[a-h][1-8]$/),
  promotion: z.enum(CHESS_PROMOTION_PIECES).optional(),
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
    tool: z.enum(["door", "window", "erase", "spawn"]),
    position,
  }).strict(),
]);

export const clientCommandSchema = z.discriminatedUnion("type", [
  ...publicEconomyCommands(z.union([layoutEdit, z.object({ tool: z.literal("public_asset"), publicAssetId: z.string().uuid(), position, variantId: assetVariantId, rotation: assetRotation }).strict()])),
  z.object({ type: z.literal("organisation.edit"), requestId, baseRevision: z.number().int().nonnegative(), edit: organisationEditSchema }).strict(),
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
  z.object({ type: z.literal("proximity.set_media"), requestId, sessionId: z.string().uuid(), microphone: z.boolean(), camera: z.boolean() }).strict(),
  z.object({ type: z.literal("proximity.leave"), requestId, sessionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("proximity.signal"), requestId, sessionId: z.string().uuid(), targetSessionId: z.string().uuid(), signal: mediaSignalSchema }).strict(),
  z.object({ type: z.literal("chat.send"), requestId, conversationId: z.string().min(1).max(100), body: z.string().trim().min(1).max(500) }),
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
  z.object({ type: z.literal("work.update"), requestId, objectId: z.string().min(1).max(100), baseRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1), edit: workObjectEditSchema }).strict(),
  z.object({ type: z.literal("work.approach"), requestId, objectId: z.string().min(1).max(100) }).strict(),
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
      build: roomPermissionSchema.optional(),
      organisationUnitId: z.string().min(1).max(100).optional(),
    }).strict(),
  }).strict(),
  z.object({ type: z.literal("room.knock"), requestId, roomId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("room.inspect_access"), requestId, userId: z.string().min(1).max(100).nullable() }).strict(),
  z.object({ type: z.literal("room.knock_respond"), requestId, knockId: z.string().min(1).max(100), accept: z.boolean() }),
  z.object({ type: z.literal("interaction.wave"), requestId, targetUserId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("interaction.react"), requestId, reaction: z.enum(REACTION_KINDS) }),
  z.object({ type: z.literal("interaction.ring_gong"), requestId, objectId: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("interaction.use_prop"), requestId, objectId: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("call.request"), requestId, targetUserId: z.string().min(1).max(100) }),
  z.object({ type: z.literal("call.respond"), requestId, callId: z.string().min(1).max(100), accept: z.boolean() }),
  z.object({ type: z.literal("call.end"), requestId, callId: z.string().min(1).max(100) }),
  ...meetingCommands,
  gameStart,
  z.object({ type: z.literal("game.end"), requestId, roundId: z.string().uuid() }).strict(),
  z.object({
    type: z.literal("game.command"),
    requestId,
    roundId: z.string().uuid(),
    command: z.union([z.enum(FALLING_BLOCKS_COMMANDS), ticTacToeCommand]),
  }).strict(),
  z.object({ type: z.literal("chess.match_create"), requestId, settings: chessMatchSettings }).strict(),
  z.object({ type: z.literal("chess.match_join"), requestId, matchId: chessMatchId }).strict(),
  z.object({ type: z.literal("chess.match_open"), requestId, matchId: chessMatchId }).strict(),
  z.object({ type: z.literal("chess.match_close"), requestId, matchId: chessMatchId }).strict(),
  z.object({ type: z.literal("chess.match_cancel"), requestId, matchId: chessMatchId }).strict(),
  z.object({ type: z.literal("chess.move"), requestId, matchId: chessMatchId, move: chessMove }).strict(),
  z.object({ type: z.literal("chess.resign"), requestId, matchId: chessMatchId }).strict(),
  z.object({ type: z.literal("chess.draw_offer"), requestId, matchId: chessMatchId }).strict(),
  z.object({ type: z.literal("chess.draw_claim"), requestId, matchId: chessMatchId, move: chessMove.optional() }).strict(),
  z.object({ type: z.literal("chess.draw_respond"), requestId, matchId: chessMatchId, accept: z.boolean() }).strict(),
]);

const memberPermissionsSchema = z.array(z.enum(ASSIGNABLE_MEMBER_PERMISSIONS))
  .max(ASSIGNABLE_MEMBER_PERMISSIONS.length)
  .refine((permissions) => new Set(permissions).size === permissions.length);

const emailAddressSchema = z.string().trim().max(254).pipe(z.email());

export const invitationBodySchema = z.object({
  email: emailAddressSchema,
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
  email: emailAddressSchema,
  password: passwordSchema,
  invitationToken: invitationTokenSchema.optional(),
}).strict();

export const loginBodySchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
}).strict();

export const magicLinkRequestBodySchema = z.object({
  email: emailAddressSchema,
  invitationToken: invitationTokenSchema.optional(),
}).strict();

export const magicLinkVerifyBodySchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();

export const passwordResetRequestBodySchema = z.object({
  email: emailAddressSchema,
  invitationToken: invitationTokenSchema.optional(),
}).strict();

export const passwordResetBodySchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: passwordSchema,
}).strict();
