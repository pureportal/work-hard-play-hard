export const APPROVAL_DESK_GOAL = 1_000_000;
export const APPROVAL_DESK_DAILY_COIN_CAP = 80;
export const APPROVAL_MILESTONES = [
  { forms: 100, unlock: "Permit cases", coins: 5 },
  { forms: 500, unlock: "+10% case forms", coins: 8 },
  { forms: 2_500, unlock: "Audit cases", coins: 10 },
  { forms: 10_000, unlock: "10% faster cases", coins: 12 },
  { forms: 50_000, unlock: "+10% case coins", coins: 15 },
  { forms: 250_000, unlock: "+10% case forms", coins: 20 },
  { forms: 1_000_000, unlock: "Next shared project", coins: 30 },
] as const;

export const APPROVAL_CASES = [
  { id: "memo", name: "Memo", hours: 0.5, forms: 18, coins: 3, unlock: 0 },
  { id: "permit", name: "Permit", hours: 2, forms: 100, coins: 9, unlock: 100 },
  { id: "audit", name: "Audit", hours: 8, forms: 600, coins: 24, unlock: 2_500 },
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
  case?: { id: ApprovalCaseId; startedAt: string; readyAt: string; stampsApplied?: number };
  stageForms?: number;
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
  project: number;
  stageStart: number;
  milestone: (typeof APPROVAL_MILESTONES)[number];
  contributionTarget: number;
  players: Array<{ userId: string; name: string; forms: number; stamps: number; level: number; lastContribution?: { forms: number; at: string } }>;
  player: ApprovalDeskPlayer;
  balance: number;
  economy: import("./economy.js").PlayerEconomy;
  earnedToday: number;
  dailyCoinCap: number;
  now: string;
}

export function newApprovalDeskPlayer(userId: string): ApprovalDeskPlayer {
  return { userId, forms: 0, stamps: 0, stageForms: 0, levels: { stamp: 0, inbox: 0, clerk: 0, printer: 0, routing: 0 }, earnedToday: 0 };
}

export function approvalUpgradeCost(id: ApprovalUpgradeId, level: number): number {
  const upgrade = APPROVAL_UPGRADES.find((item) => item.id === id)!;
  return Math.ceil(upgrade.baseCost * 1.3 ** level / 5) * 5;
}

export function approvalCaseDurationMs(id: ApprovalCaseId, routingLevel: number, totalForms = 0): number {
  const selected = APPROVAL_CASES.find((item) => item.id === id)!;
  return Math.round(selected.hours * 3_600_000 * 0.92 ** routingLevel * (totalForms >= 10_000 ? 0.9 : 1));
}

export function approvalCaseOutput(id: ApprovalCaseId, levels: ApprovalDeskPlayer["levels"], totalForms = 0): number {
  const selected = APPROVAL_CASES.find((item) => item.id === id)!;
  const automatic = levels.clerk * selected.hours * (8 + levels.clerk * 2);
  const sharedBonus = (totalForms >= 500 ? 0.1 : 0) + (totalForms >= 250_000 ? 0.1 : 0);
  return Math.floor((selected.forms + automatic) * (1 + levels.inbox * 0.12 + sharedBonus));
}

export function approvalCaseCoins(id: ApprovalCaseId, printerLevel: number, totalForms = 0): number {
  const selected = APPROVAL_CASES.find((item) => item.id === id)!;
  return Math.ceil((selected.coins + printerLevel * Math.ceil(selected.coins * 0.12)) * (totalForms >= 50_000 ? 1.1 : 1));
}

export function approvalStage(totalForms: number) {
  const project = Math.floor(totalForms / APPROVAL_DESK_GOAL);
  const projectStart = project * APPROVAL_DESK_GOAL;
  const projectForms = totalForms - projectStart;
  const milestone = APPROVAL_MILESTONES.find((item) => item.forms > projectForms)!;
  const previous = APPROVAL_MILESTONES[APPROVAL_MILESTONES.indexOf(milestone) - 1]?.forms ?? 0;
  const stageStart = projectStart + previous;
  return { project, stageStart, milestone, target: Math.max(5, Math.ceil((milestone.forms - previous) * 0.01)) };
}

export function approvalDeskLevel(player: ApprovalDeskPlayer): number {
  return Object.values(player.levels).reduce((sum, level) => sum + level, 0);
}
