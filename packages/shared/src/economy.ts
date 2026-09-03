export const WELCOME_COIN_REWARD = 250;
export const DAILY_REWARD_AMOUNTS = [50, 60, 70, 80, 90, 100, 150] as const;
export const GAME_REWARD_DAILY_CAP = 200;
export const MAX_OWNED_ASSETS = 500;

export interface GameSettings {
  allowPlayerAssetPlacementInPublicRooms: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  allowPlayerAssetPlacementInPublicRooms: false,
};

export interface DailyRewardProgress {
  streak: number;
  lastClaimedDay?: string;
}

export interface DailyRewardStatus {
  claimable: boolean;
  streak: number;
  amount: number;
  nextClaimAt: string;
}

export interface OwnedAssetPlacement {
  objectId: string;
  floorId: string;
  placedAt: string;
}

export interface OwnedAsset {
  id: string;
  assetId: string;
  acquiredAt: string;
  placement?: OwnedAssetPlacement;
}

export type CoinTransactionKind = "welcome" | "daily_bonus" | "game_reward" | "shop_purchase";

export interface CoinTransaction {
  id: string;
  kind: CoinTransactionKind;
  amount: number;
  balanceAfter: number;
  createdAt: string;
  assetId?: string;
  ownedAssetId?: string;
  sourceId?: string;
}

export interface PlayerEconomy {
  coinBalance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  dailyReward: DailyRewardStatus;
  inventory: OwnedAsset[];
  recentTransactions: CoinTransaction[];
}

export interface GameCoinReward {
  userId: string;
  amount: number;
}

export function getUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getDailyRewardStatus(progress: DailyRewardProgress, now = new Date()): DailyRewardStatus {
  const today = getUtcDayKey(now);
  const todayNumber = utcDayNumber(today);
  const lastClaimedNumber = progress.lastClaimedDay ? utcDayNumber(progress.lastClaimedDay) : undefined;
  const claimable = lastClaimedNumber === undefined || lastClaimedNumber < todayNumber;
  const continuesStreak = lastClaimedNumber === todayNumber - 1;
  const activeStreak = continuesStreak || (lastClaimedNumber !== undefined && lastClaimedNumber >= todayNumber)
    ? progress.streak
    : 0;
  const nextStreak = claimable
    ? activeStreak + 1
    : progress.streak + 1;
  const nextClaimDay = claimable ? todayNumber : (lastClaimedNumber ?? todayNumber) + 1;
  return {
    claimable,
    streak: activeStreak,
    amount: DAILY_REWARD_AMOUNTS[Math.min(nextStreak, DAILY_REWARD_AMOUNTS.length) - 1]!,
    nextClaimAt: new Date(nextClaimDay * 86_400_000).toISOString(),
  };
}

export function calculateGameCoinReward(lines: number, won: boolean): number {
  return 20 + Math.min(Math.max(Math.trunc(lines), 0), 20) * 3 + (won ? 40 : 0);
}

function utcDayNumber(day: string): number {
  const timestamp = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) {
    throw new Error("DAILY_REWARD_DATE_INVALID");
  }
  return Math.floor(timestamp / 86_400_000);
}
