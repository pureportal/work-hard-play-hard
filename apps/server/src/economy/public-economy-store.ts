import { randomUUID } from "node:crypto";
import {
  WORKSPACE_FUND_ID, availablePublicMoney, canManageUnit, createPublicEconomy,
  publicFundMemberIds, projectRequiredMoney, type ConstructionReceipt, type FloorLayout, type OrganisationState, type PublicAction,
  type PublicEconomy, type PublicFund, type PublicTransaction, type SpendingProposal,
} from "@workhard/shared";

export interface PublicEconomyState extends PublicEconomy {
  receipts: ConstructionReceipt[];
  operations: { userId: string; key: string; fingerprint: string; result: string }[];
}

export class PublicEconomyStore {
  private state: PublicEconomyState;
  private readonly approvalDeadlineMs = process.env.NODE_ENV === "production" ? 7 * 86_400_000 : 10_000;
  resolutionRevision = 0;

  constructor(initial: PublicEconomy = createPublicEconomy()) {
    this.state = { ...structuredClone(initial), receipts: [], operations: [] };
  }

  exportState(): PublicEconomyState {
    return structuredClone(this.state);
  }

  restoreState(state: PublicEconomyState): void {
    validatePublicEconomy(state);
    this.state = structuredClone(state);
  }

  view(): PublicEconomy {
    const { receipts: _receipts, operations: _operations, ...view } = this.state;
    return structuredClone(view);
  }

  get receipts(): ConstructionReceipt[] { return this.state.receipts; }
  get inventory() { return this.state.inventory; }

  fund(id: string): PublicFund {
    const fund = this.state.funds.find((candidate) => candidate.id === id);
    if (!fund) throw new Error("PUBLIC_FUND_NOT_FOUND");
    return fund;
  }

  refresh(organisation: OrganisationState, memberIds: string[], now = new Date()): void {
    for (const proposal of this.state.proposals) {
      if (!["open", "approved"].includes(proposal.status)) continue;
      if (proposal.organisationRevision !== organisation.revision || proposal.policyRevision !== this.state.revision
        || proposal.electorate.some((id) => !memberIds.includes(id))) {
        proposal.status = "cancelled";
        this.resolutionRevision += 1;
      } else this.closeVoting(proposal, now);
    }
  }

  hasDueProposals(now = new Date()): boolean {
    return this.state.proposals.some((proposal) => proposal.status === "open" && Date.parse(proposal.expiresAt) <= now.getTime());
  }

  private closeVoting(proposal: SpendingProposal, now: Date): void {
    if (proposal.status !== "open" || Date.parse(proposal.expiresAt) > now.getTime()) return;
    proposal.required = Math.floor(proposal.ballots.length / 2) + 1;
    const approvals = proposal.ballots.filter((ballot) => ballot.approve).length;
    proposal.status = !proposal.ballots.length ? "expired" : approvals >= proposal.required ? "approved" : "rejected";
    this.resolutionRevision += 1;
  }

  invalidateLayoutProposals(layouts: readonly FloorLayout[]): boolean {
    let changed = false;
    for (const proposal of this.state.proposals) {
      if (!["open", "approved"].includes(proposal.status)) continue;
      const action = proposal.action;
      const stale = action.kind === "project" && layouts.find((layout) => layout.floorId === action.project.floorId)?.revision !== action.project.baseRevision
        || action.kind === "room.settings" && layouts.find((layout) => layout.rooms.some((room) => room.id === action.roomId))?.revision !== action.baseRevision;
      if (stale) { proposal.status = "cancelled"; this.resolutionRevision += 1; changed = true; }
    }
    return changed;
  }

  findOperation(userId: string, key: string, fingerprint: string): string | undefined {
    const operation = this.state.operations.find((entry) => entry.userId === userId && entry.key === key);
    if (operation && operation.fingerprint !== fingerprint) throw new Error("ECONOMY_REQUEST_CONFLICT");
    return operation?.result;
  }

  recordOperation(userId: string, key: string, fingerprint: string, result: string): void {
    this.state.operations.push({ userId, key, fingerprint, result });
  }

  record(fundId: string, userId: string, kind: PublicTransaction["kind"], amount: number, sourceId: string, now = new Date()): void {
    const fund = this.fund(fundId);
    const balance = fund.balance + amount;
    if (!Number.isSafeInteger(balance) || balance < 0 || balance > 2_000_000_000) throw new Error("PUBLIC_FUNDS_INSUFFICIENT");
    fund.balance = balance;
    this.state.transactions.push({ id: randomUUID(), fundId, userId, kind, amount, sourceId, balanceAfter: balance, createdAt: now.toISOString() });
  }

  propose(userId: string, title: string, action: PublicAction, fundId: string, organisation: OrganisationState, memberIds: string[], now = new Date()): SpendingProposal {
    this.refresh(organisation, memberIds, now);
    const fund = this.fund(fundId);
    const members = publicFundMemberIds(fund, organisation, memberIds);
    if (!memberIds.includes(userId) || (!members.includes(userId) && !canManageUnit(organisation, userId, fund.unitId))) throw new Error("PUBLIC_FUND_FORBIDDEN");
    const electorate = members;
    if (!electorate.length) throw new Error("PROPOSAL_NO_APPROVERS");
    if (this.state.proposals.filter((entry) => entry.proposedBy === userId && ["open", "approved"].includes(entry.status)).length >= 20) throw new Error("PROPOSAL_LIMIT");
    const reserved = action.kind === "project" ? projectRequiredMoney(action.project) : action.kind === "fund.transfer" ? action.amount : 0;
    if (reserved > availablePublicMoney(this.state, fundId)) throw new Error("PUBLIC_FUNDS_INSUFFICIENT");
    const required = Math.floor(electorate.length / 2) + 1;
    const ballots = electorate.includes(userId) ? [{ userId, approve: true }] : [];
    const proposal: SpendingProposal = {
      id: randomUUID(), title, proposedBy: userId, fundId, action: structuredClone(action), electorate, required, ballots,
      status: ballots.length >= required ? "approved" : "open", reserved,
      createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + this.approvalDeadlineMs).toISOString(),
      organisationRevision: organisation.revision, policyRevision: this.state.revision,
    };
    this.state.proposals.push(proposal);
    return structuredClone(proposal);
  }

  proposal(id: string): SpendingProposal {
    const proposal = this.state.proposals.find((entry) => entry.id === id);
    if (!proposal) throw new Error("PROPOSAL_NOT_FOUND");
    return proposal;
  }

  vote(userId: string, id: string, approve: boolean, now = new Date()): void {
    const proposal = this.proposal(id);
    this.closeVoting(proposal, now);
    if (proposal.status !== "open") throw new Error("PROPOSAL_CLOSED");
    if (!proposal.electorate.includes(userId)) throw new Error("PROPOSAL_VOTE_FORBIDDEN");
    if (proposal.ballots.some((ballot) => ballot.userId === userId)) throw new Error("PROPOSAL_ALREADY_VOTED");
    proposal.ballots.push({ userId, approve });
    const yes = proposal.ballots.filter((ballot) => ballot.approve).length;
    if (yes >= proposal.required) proposal.status = "approved";
    else if (yes + proposal.electorate.length - proposal.ballots.length < proposal.required) proposal.status = "rejected";
  }

  cancel(userId: string, id: string): void {
    const proposal = this.proposal(id);
    if (proposal.proposedBy !== userId) throw new Error("PROPOSAL_VOTE_FORBIDDEN");
    if (!["open", "approved"].includes(proposal.status)) throw new Error("PROPOSAL_CLOSED");
    proposal.status = "cancelled";
  }

  applyProject(userId: string, project: Extract<PublicAction, { kind: "project" }>["project"]): void {
    const { quote } = project;
    for (const id of quote.inventoryIds) {
      if (!this.state.inventory.some((asset) => asset.id === id && asset.fundId === project.fundId)) throw new Error("PUBLIC_ASSET_UNAVAILABLE");
    }
    for (const refund of quote.refunds) this.record(refund.fundId, userId, "refund", refund.amount, project.id);
    this.record(project.fundId, userId, "purchase", -quote.cost, project.id);
    this.state.receipts = this.state.receipts.filter((receipt) => receipt.floorId !== project.floorId || !quote.removedKeys.includes(receipt.key));
    this.state.receipts.push(...structuredClone(quote.purchases));
    this.state.inventory = this.state.inventory.filter((asset) => !quote.inventoryIds.includes(asset.id));
  }

  addDonation(asset: PublicEconomy["inventory"][number], floorId?: string, objectId?: string): void {
    if (floorId && objectId) this.state.receipts.push({ key: `asset:${objectId}`, floorId, fundId: asset.fundId, paid: asset.paid });
    else this.state.inventory.push(structuredClone(asset));
  }

  storePlacedAsset(objectId: string, assetId: string, floorId: string, fundId: string): void {
    const receipt = this.state.receipts.find((entry) => entry.floorId === floorId && entry.key === `asset:${objectId}`);
    this.state.inventory.push({ id: randomUUID(), assetId, fundId: receipt?.fundId ?? fundId, paid: receipt?.paid ?? 0 });
    this.state.receipts = this.state.receipts.filter((entry) => entry !== receipt);
  }

  applyFundAction(userId: string, action: PublicAction, sourceId: string): void {
    if (action.kind === "fund.create") {
      if (this.state.funds.some((fund) => fund.unitId === action.unitId)) throw new Error("PUBLIC_FUND_EXISTS");
      this.state.funds.push({ id: action.unitId, unitId: action.unitId, balance: 0, mode: action.mode });
    } else if (action.kind === "fund.transfer") {
      if (action.fromFundId === action.toFundId) throw new Error("PUBLIC_FUND_SCOPE");
      this.fund(action.toFundId);
      this.record(action.fromFundId, userId, "transfer", -action.amount, sourceId);
      this.record(action.toFundId, userId, "transfer", action.amount, sourceId);
    } else if (action.kind === "governance") {
      this.fund(WORKSPACE_FUND_ID).mode = action.mode;
      this.state.revision += 1;
    } else if (action.kind === "asset.sell") {
      const asset = this.state.inventory.find((entry) => entry.id === action.publicAssetId);
      if (!asset) throw new Error("PUBLIC_ASSET_UNAVAILABLE");
      this.record(asset.fundId, userId, "asset_sale", Math.floor(asset.paid / 3), sourceId);
      this.state.inventory = this.state.inventory.filter((entry) => entry.id !== asset.id);
    }
  }
}

export function validatePublicEconomy(state: PublicEconomyState): void {
  const validMoney = (amount: number) => Number.isSafeInteger(amount) && amount >= 0 && amount <= 2_000_000_000;
  if (!state || !Array.isArray(state.funds) || !Array.isArray(state.receipts) || !Array.isArray(state.operations)
    || !Array.isArray(state.inventory) || !Array.isArray(state.transactions) || !Array.isArray(state.proposals)
    || !Number.isSafeInteger(state.revision) || state.revision < 0) throw new Error("PUBLIC_ECONOMY_INVALID");
  const ids = new Set(state.funds.map((fund) => fund.id));
  if (!ids.has(WORKSPACE_FUND_ID) || ids.size !== state.funds.length) throw new Error("PUBLIC_ECONOMY_INVALID");
  for (const fund of state.funds) {
    if (!validMoney(fund.balance) || !["equal", "hierarchical"].includes(fund.mode)
      || availablePublicMoney(state, fund.id) < 0) throw new Error("PUBLIC_ECONOMY_INVALID");
    let balance = 0;
    for (const transaction of state.transactions.filter((entry) => entry.fundId === fund.id)) {
      balance += transaction.amount;
      if (!validMoney(balance) || transaction.balanceAfter !== balance) throw new Error("PUBLIC_ECONOMY_INVALID");
    }
    if (balance !== fund.balance) throw new Error("PUBLIC_ECONOMY_INVALID");
  }
  const keys = state.receipts.map((receipt) => `${receipt.floorId}:${receipt.key}`);
  if (new Set(keys).size !== keys.length || state.receipts.some((receipt) => !ids.has(receipt.fundId) || !validMoney(receipt.paid))
    || state.inventory.some((asset) => !ids.has(asset.fundId) || !validMoney(asset.paid))
    || state.transactions.some((transaction) => !ids.has(transaction.fundId))) throw new Error("PUBLIC_ECONOMY_INVALID");
  for (const proposal of state.proposals) {
    if (!ids.has(proposal.fundId) || !validMoney(proposal.reserved) || !proposal.electorate.length
      || new Set(proposal.electorate).size !== proposal.electorate.length
      || new Set(proposal.ballots.map((ballot) => ballot.userId)).size !== proposal.ballots.length
      || proposal.ballots.some((ballot) => !proposal.electorate.includes(ballot.userId))
      || !Number.isSafeInteger(proposal.required) || proposal.required < 1 || proposal.required > proposal.electorate.length
      || !Number.isFinite(Date.parse(proposal.expiresAt))) throw new Error("PUBLIC_ECONOMY_INVALID");
  }
}
