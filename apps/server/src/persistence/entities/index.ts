import { authAccountSchema, authSessionSchema, magicLinkSchema } from "./auth-entities.js";
import { playerAvatarSchema } from "./avatar-entity.js";
import { brandingLogoSchema } from "./branding-logo-entity.js";
import {
  chatMessageSchema,
  coinTransactionSchema,
  conversationParticipantSchema,
  conversationSchema,
  economyAccountSchema,
  floorLayoutSchema,
  gameScoreSchema,
  invitationSchema,
  meetingParticipantSchema,
  meetingSchema,
  memberSchema,
  ownedAssetSchema,
  playerGameStatisticsSchema,
  workspaceSettingsSchema,
  worldPlayerSchema,
} from "./workspace-entities.js";

export const databaseEntities = [
  authAccountSchema,
  authSessionSchema,
  magicLinkSchema,
  playerAvatarSchema,
  brandingLogoSchema,
  memberSchema,
  floorLayoutSchema,
  conversationSchema,
  conversationParticipantSchema,
  chatMessageSchema,
  invitationSchema,
  meetingSchema,
  meetingParticipantSchema,
  gameScoreSchema,
  playerGameStatisticsSchema,
  economyAccountSchema,
  ownedAssetSchema,
  coinTransactionSchema,
  workspaceSettingsSchema,
  worldPlayerSchema,
];

export * from "./auth-entities.js";
export * from "./avatar-entity.js";
export * from "./branding-logo-entity.js";
export * from "./workspace-entities.js";
