import type { GameSettings, KidnappingConfiguration, PlayerEconomy } from "@workhard/shared";

export function createTestEconomy(): PlayerEconomy {
  return {
    coinBalance: 250,
    lifetimeEarned: 250,
    lifetimeSpent: 0,
    dailyReward: {
      claimable: true,
      streak: 0,
      amount: 50,
      nextClaimAt: "2026-09-03T00:00:00.000Z",
    },
    inventory: [],
    recentTransactions: [],
  };
}

export function createTestGameSettings(): GameSettings {
  return { allowPlayerAssetPlacementInPublicRooms: false };
}

export function createTestKidnappingConfiguration(): KidnappingConfiguration {
  return {
    global: {
      enabled: true,
      targetPolicy: { mode: "allow_all", userIds: [] },
    },
    player: {
      carrierPolicy: { mode: "allow_all", userIds: [] },
    },
  };
}
