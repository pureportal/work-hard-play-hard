import { getAssetDefinition } from "./assets.js";
import type { WorldObject } from "./assets.js";
import type { FloorLayout, LayoutEdit, RoomSettings } from "./building.js";
import type { GameSettings } from "./economy.js";
import type { GlobalKidnappingSettings } from "./kidnapping.js";
import { isUnitWithin, type OrganisationEdit, type OrganisationState } from "./organisation.js";

export const WORKSPACE_FUND_ID = "workspace";
export const BUILD_PRICES = { wall: 12, door: 40, window: 60 } as const;

export interface ApprovalRates {
  serverSettings: number;
  building: number;
  organisation: number;
  funds: number;
}

export const DEFAULT_APPROVAL_RATES: ApprovalRates = {
  serverSettings: 51,
  building: 51,
  organisation: 51,
  funds: 51,
};

export type DecisionMode = "equal" | "hierarchical";

export interface PublicFund {
  id: string;
  unitId: string | null;
  balance: number;
  mode: DecisionMode;

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
  assetChanges: { object: WorldObject; change: "place" | "move" | "remove" }[];
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
  baseLayout: FloorLayout;
  layout: FloorLayout;
  quote: ProjectQuote;
  donatedAssets?: { key: string; id: string }[];
  edits: number;
  spawn?: { x: number; y: number };
  floorCount?: number;
}

export type PublicAction =
  | { kind: "record"; summary: string }
  | { kind: "project"; project: BuildProject }
  | { kind: "fund.create"; unitId: string; mode: DecisionMode }
  | { kind: "fund.transfer"; fromFundId: string; toFundId: string; amount: number }
  | { kind: "governance"; mode: DecisionMode; ceoIds: string[] }
  | { kind: "organisation"; baseRevision: number; edit: OrganisationEdit }
  | { kind: "room.settings"; roomId: string; baseRevision: number; settings: RoomSettings }
  | { kind: "game.settings"; settings: GameSettings }
  | { kind: "kidnapping.settings"; settings: GlobalKidnappingSettings }
  | { kind: "asset.sell"; publicAssetId: string };

export function approvalRateForAction(rates: ApprovalRates, action: PublicAction): number {
  switch (action.kind) {
    case "game.settings":
    case "kidnapping.settings":
      return rates.serverSettings;
    case "project":
    case "room.settings":
      return rates.building;
    case "organisation":
    case "governance":
      return rates.organisation;
    case "fund.create":
    case "fund.transfer":
    case "asset.sell":
    case "record":
      return rates.funds;
  }
}

export interface SpendingProposal {
  id: string;
  title: string;
  proposedBy: string;
  fundId: string;
  action: PublicAction;
  electorate: string[];
  approvalRate: number;
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
  approvalRates: ApprovalRates;
  funds: PublicFund[];
  inventory: PublicAsset[];
  proposals: SpendingProposal[];
  transactions: PublicTransaction[];
}

export function createPublicEconomy(mode: DecisionMode = "equal"): PublicEconomy {
  return {
    revision: 0,
    approvalRates: { ...DEFAULT_APPROVAL_RATES },
    funds: [{ id: WORKSPACE_FUND_ID, unitId: null, balance: 0, mode }],
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
  return fund.balance - economy.proposals.filter((proposal) => proposal.fundId === fundId && ["open", "approved"].includes(proposal.status))
      .reduce((sum, proposal) => sum + proposal.reserved, 0);
}

export function projectRequiredMoney(project: BuildProject): number {
  return Math.max(0, project.quote.cost - project.quote.refunds.filter((refund) => refund.fundId === project.fundId)
    .reduce((sum, refund) => sum + refund.amount, 0));
}

export function assetResaleValue(paid: number): number {
  return Math.floor(paid / 3);
}

export function isPermanentAsset(assetId: string): boolean {
  return getAssetDefinition(assetId)?.category === "floor-types";
}

export type ProjectEdit = LayoutEdit | {
  tool: "public_asset"; publicAssetId: string; position: { x: number; y: number }; variantId: string; rotation: 0 | 90 | 180 | 270;
} | {
  tool: "personal_asset"; ownedAssetId: string; position: { x: number; y: number }; variantId: string; rotation: 0 | 90 | 180 | 270;
};
