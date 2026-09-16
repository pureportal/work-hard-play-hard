import { getAssetDefinition } from "./assets.js";
import type { FloorLayout, LayoutEdit, RoomSettings } from "./building.js";
import type { GameSettings } from "./economy.js";
import { isUnitWithin, type OrganisationEdit, type OrganisationState } from "./organisation.js";

export const WORKSPACE_FUND_ID = "workspace";
export const DEFAULT_WEEKLY_ALLOWANCE = 50;
export const PROJECT_EXPIRY_MS = 7 * 86_400_000;
export const BUILD_PRICES = { wall: 12, door: 40, window: 60 } as const;

export type DecisionMode = "equal" | "hierarchical";

export interface PublicFund {
  id: string;
  unitId: string | null;
  balance: number;
  mode: DecisionMode;
  weeklyAllowance: number;
  spendingLimits: { userId: string; amount: number }[];
  period: string;
  allowances: { userId: string; remaining: number; spent: number }[];
}

export interface PublicAsset {
  id: string;
  assetId: string;
  fundId: string;
  paid: number;
}

export interface ConstructionReceipt {
  key: string;
  floorId: string;
  fundId: string;
  paid: number;
}

export interface ProjectQuote {
  cost: number;
  refund: number;
  refunds: { fundId: string; amount: number }[];
  structural: boolean;
  destructive: boolean;
  requiresApproval: boolean;
  purchases: ConstructionReceipt[];
  removedKeys: string[];
  inventoryIds: string[];
}

export interface BuildProject {
  id: string;
  fundId: string;
  floorId: string;
  baseRevision: number;
  layout: FloorLayout;
  quote: ProjectQuote;
  edits: number;
  spawn?: { x: number; y: number };
}

export type PublicAction =
  | { kind: "project"; project: BuildProject }
  | { kind: "fund.create"; unitId: string; mode: DecisionMode; weeklyAllowance: number }
  | { kind: "fund.transfer"; fromFundId: string; toFundId: string; amount: number }
  | { kind: "fund.policy"; fundId: string; mode: DecisionMode; weeklyAllowance: number; spendingLimits: PublicFund["spendingLimits"] }
  | { kind: "governance"; mode: DecisionMode; ceoIds: string[] }
  | { kind: "organisation"; baseRevision: number; edit: OrganisationEdit }
  | { kind: "room.settings"; roomId: string; baseRevision: number; settings: RoomSettings }
  | { kind: "game.settings"; settings: GameSettings }
  | { kind: "asset.sell"; publicAssetId: string };

export interface SpendingProposal {
  id: string;
  title: string;
  proposedBy: string;
  fundId: string;
  action: PublicAction;
  electorate: string[];
  required: number;
  ballots: { userId: string; approve: boolean }[];
  status: "open" | "approved" | "applied" | "rejected" | "expired" | "cancelled";
  reserved: number;
  createdAt: string;
  expiresAt: string;
  organisationRevision: number;
  policyRevision: number;
}

export interface PublicTransaction {
  id: string;
  fundId: string;
  userId: string;
  kind: "donation" | "purchase" | "refund" | "transfer" | "asset_donation" | "asset_sale";
  amount: number;
  balanceAfter: number;
  createdAt: string;
  sourceId: string;
}

export interface PublicEconomy {
  revision: number;
  funds: PublicFund[];
  inventory: PublicAsset[];
  proposals: SpendingProposal[];
  transactions: PublicTransaction[];
}

export function createPublicEconomy(mode: DecisionMode = "equal"): PublicEconomy {
  return {
    revision: 0,
    funds: [{ id: WORKSPACE_FUND_ID, unitId: null, balance: 0, mode, weeklyAllowance: DEFAULT_WEEKLY_ALLOWANCE,
      spendingLimits: [], period: "", allowances: [] }],
    inventory: [], proposals: [], transactions: [],
  };
}

export function publicFundMemberIds(fund: PublicFund, organisation: OrganisationState, memberIds: string[]): string[] {
  return fund.unitId === null ? memberIds : memberIds.filter((userId) => organisation.assignments.some((assignment) =>
    assignment.userId === userId && isUnitWithin(organisation, assignment.unitId, fund.unitId!)));
}

export function publicFundForUnit(economy: PublicEconomy, organisation: OrganisationState, unitId?: string): PublicFund {
  let current = unitId;
  while (current) {
    const fund = economy.funds.find((entry) => entry.unitId === current);
    if (fund) return fund;
    current = organisation.units.find((unit) => unit.id === current)?.parentId ?? undefined;
  }
  return economy.funds.find((fund) => fund.id === WORKSPACE_FUND_ID)!;
}

export function availablePublicMoney(economy: PublicEconomy, fundId: string): number {
  const fund = economy.funds.find((candidate) => candidate.id === fundId);
  if (!fund) return 0;
  return fund.balance - fund.allowances.reduce((sum, allowance) => sum + allowance.remaining, 0)
    - economy.proposals.filter((proposal) => proposal.fundId === fundId && ["open", "approved"].includes(proposal.status))
      .reduce((sum, proposal) => sum + proposal.reserved, 0);
}

export function assetResaleValue(paid: number): number {
  return Math.floor(paid / 3);
}

export function isPermanentAsset(assetId: string): boolean {
  return getAssetDefinition(assetId)?.category === "floor-types";
}

export type ProjectEdit = LayoutEdit | {
  tool: "public_asset"; publicAssetId: string; position: { x: number; y: number }; variantId: string; rotation: 0 | 90 | 180 | 270;
};
