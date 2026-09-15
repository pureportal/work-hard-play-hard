import {
  CHESS_DEFINITION_ID,
  DEFAULT_CORPORATE_IDENTITY,
  DEFAULT_GAME_SETTINGS,
  DEFAULT_GLOBAL_KIDNAPPING_SETTINGS,
  DEFAULT_PLAYER_KIDNAPPING_SETTINGS,
  FALLING_BLOCKS_DEFINITION_ID,
  TIC_TAC_TOE_DEFINITION_ID,
  createOrganisation,
  getDailyRewardStatus,
  type BootstrapData,
} from "@workhard/shared";
import { createStartingHouse } from "./world/starting-house.js";

export function createInitialData(now = new Date()): BootstrapData {
  const house = createStartingHouse();
  return structuredClone({
    currentUserId: "",
    corporateIdentity: DEFAULT_CORPORATE_IDENTITY,
    team: { id: "team", name: "Team", slug: "team", accent: DEFAULT_CORPORATE_IDENTITY.primaryColor },
    office: { id: "office", teamId: "team", name: "Office" },
    floors: [house.floor],
    layouts: [house.layout],
    members: [],
    organisation: createOrganisation(),
    conversations: [{ id: "conversation-team", name: "Team", type: "team", unread: 0 }],
    messages: [],
    invitations: [],
    meetings: [],
    miniGames: [
      { id: FALLING_BLOCKS_DEFINITION_ID, name: "Falling Blocks", accent: "#ff7a66", assetId: "equipment-falling-blocks" },
      { id: TIC_TAC_TOE_DEFINITION_ID, name: "Tic-Tac-Toe", accent: "#5b8def", assetId: "equipment-tic-tac-toe" },
      { id: CHESS_DEFINITION_ID, name: "Chess", accent: "#79664f", assetId: "equipment-chess" },
    ],
    scores: [],
    gameStatistics: [],
    economy: {
      coinBalance: 0, lifetimeEarned: 0, lifetimeSpent: 0,
      dailyReward: getDailyRewardStatus({ streak: 0 }, now), inventory: [], recentTransactions: [],
    },
    gameSettings: DEFAULT_GAME_SETTINGS,
    kidnapping: { global: DEFAULT_GLOBAL_KIDNAPPING_SETTINGS, player: DEFAULT_PLAYER_KIDNAPPING_SETTINGS },
  });
}
