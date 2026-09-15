import { authAccountSchema, authSessionSchema, magicLinkSchema } from "./auth-entities.js";
import { brandingLogoSchema } from "./branding-logo-entity.js";
import { spotifyConnectionSchema } from "./spotify-entity.js";
import { githubConnectionSchema } from "./github-entity.js";
import { whiteboardImageSchema, whiteboardImageReferenceSchema } from "./whiteboard-image-entity.js";
import {
  chatMessageSchema,
  chessMatchSchema,
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
  brandingLogoSchema,
  whiteboardImageSchema,
  whiteboardImageReferenceSchema,
  spotifyConnectionSchema,
  githubConnectionSchema,
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
  chessMatchSchema,
  economyAccountSchema,
  ownedAssetSchema,
  coinTransactionSchema,
  workspaceSettingsSchema,
  worldPlayerSchema,
];

export * from "./auth-entities.js";
export * from "./branding-logo-entity.js";
export * from "./workspace-entities.js";
