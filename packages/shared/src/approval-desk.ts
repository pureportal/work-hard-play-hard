export const APPROVAL_DESK_GOAL = 1_000_000;
export const APPROVAL_DESK_DAILY_COIN_CAP = 80;

export const APPROVAL_CASES = [
  { id: "memo", name: "Memo", hours: 2, forms: 36, coins: 5 },
  { id: "permit", name: "Permit", hours: 6, forms: 145, coins: 13 },
  { id: "audit", name: "Audit", hours: 12, forms: 360, coins: 23 },
] as const;

export const APPROVAL_UPGRADES = [
  { id: "stamp", name: "Rubber stamp", baseCost: 15 },
  { id: "inbox", name: "In tray", baseCost: 25 },
  { id: "clerk", name: "Clerk", baseCost: 35 },
  { id: "printer", name: "Printer", baseCost: 50 },
  { id: "routing", name: "Routing", baseCost: 60 },
] as const;

export type ApprovalCaseId = (typeof APPROVAL_CASES)[number]["id"];
export type ApprovalUpgradeId = (typeof APPROVAL_UPGRADES)[number]["id"];

export interface ApprovalDeskPlayer {
  userId: string;
  forms: number;
  stamps: number;
  levels: Record<ApprovalUpgradeId, number>;
  case?: { id: ApprovalCaseId; startedAt: string; readyAt: string };
  lastStampAt?: string;
  earnedDay?: string;
  earnedToday: number;
  lastContribution?: { forms: number; at: string };
}

export interface ApprovalDeskState {
  players: ApprovalDeskPlayer[];
  totalForms: number;
}

export interface ApprovalDeskView {
  goal: number;
  totalForms: number;
  players: Array<{ userId: string; name: string; forms: number; stamps: number; level: number; lastContribution?: { forms: number; at: string } }>;
  player: ApprovalDeskPlayer;
  balance: number;
  economy: import("./economy.js").PlayerEconomy;
  earnedToday: number;
  dailyCoinCap: number;
  now: string;
}

export function newApprovalDeskPlayer(userId: string): ApprovalDeskPlayer {
  return { userId, forms: 0, stamps: 0, levels: { stamp: 0, inbox: 0, clerk: 0, printer: 0, routing: 0 }, earnedToday: 0 };
}

export function approvalUpgradeCost(id: ApprovalUpgradeId, level: number): number {
  const upgrade = APPROVAL_UPGRADES.find((item) => item.id === id)!;
  return Math.ceil(upgrade.baseCost * 1.3 ** level / 5) * 5;
}

export function approvalCaseDurationMs(id: ApprovalCaseId, routingLevel: number): number {
  const selected = APPROVAL_CASES.find((item) => item.id === id)!;
  return Math.round(selected.hours * 3_600_000 * 0.93 ** routingLevel);
}

export function approvalCaseOutput(id: ApprovalCaseId, levels: ApprovalDeskPlayer["levels"]): number {
  const selected = APPROVAL_CASES.find((item) => item.id === id)!;
  const automatic = levels.clerk * selected.hours * (12 + levels.clerk * 3);
  return Math.floor((selected.forms + automatic) * (1 + levels.inbox * 0.22));
}

export function approvalCaseCoins(id: ApprovalCaseId, printerLevel: number): number {
  const selected = APPROVAL_CASES.find((item) => item.id === id)!;
  return selected.coins + printerLevel * Math.ceil(selected.coins * 0.18);
}

export function approvalDeskLevel(player: ApprovalDeskPlayer): number {
  return Object.values(player.levels).reduce((sum, level) => sum + level, 0);
}
