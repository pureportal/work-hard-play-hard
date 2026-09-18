import { randomUUID } from "node:crypto";
import {
  WORKSPACE_FUND_ID, canManageUnit, publicFundForUnit, publicFundMemberIds, validatePersonalSpaces, type BuildProject, type FloorLayout,
  type ProjectEdit, type PublicAction, type ServerEvent,
} from "@workhard/shared";
import type { WorkspaceStore } from "../store.js";
import { validateRoomPermission } from "../organisation/organisation-store.js";
import { assertProjectScope, quoteProject } from "./project-quote.js";

export interface ProjectPeer {
  userId: string;
  floorId: string;
  send: (event: ServerEvent) => void;
}

interface Draft {
  project: BuildProject;
  donatedObjects: Map<string, string>;
  submitted: boolean;
}

export class ProjectRuntime {
  private readonly drafts = new Map<string, Draft>();
  private publishedResolutionRevision = 0;

  constructor(private readonly store: WorkspaceStore, private readonly callbacks: {
    edit: (peer: ProjectPeer, layout: FloorLayout, edit: ProjectEdit, fundId: string) => FloorLayout;
    apply: (peer: ProjectPeer, action: PublicAction, requestId: string) => void;
    broadcast: (event: ServerEvent) => void;
  }) {}

  edit(peer: ProjectPeer, requestId: string, baseRevision: number, fundId: string, edit: ProjectEdit, draftId?: string): void {
    const original = this.store.getLayout(peer.floorId);
    if (!original || original.revision !== baseRevision) throw new Error("PROJECT_STALE");
    const existing = draftId ? this.drafts.get(peer.userId) : undefined;
    if (draftId && (!existing || existing.project.id !== draftId || existing.submitted)) throw new Error("PROJECT_STALE");
    if (existing && (existing.project.baseRevision !== baseRevision || existing.project.floorId !== peer.floorId || existing.project.fundId !== fundId)) throw new Error("PROJECT_STALE");
    if ((existing?.project.edits ?? 0) >= 200) throw new Error("PROJECT_LIMIT");
    const fund = this.store.publicEconomy.fund(fundId);
    this.assertFundMember(peer.userId, fundId);
    const layout = this.callbacks.edit(peer, existing?.project.layout ?? original, edit, fundId);
    const donatedObjects = new Map(existing?.donatedObjects);
    if (edit.tool === "public_asset") {
      const object = layout.objects.at(-1)!;
      donatedObjects.set(`asset:${object.id}`, edit.publicAssetId);
    }
    assertProjectScope(original, layout, fund, peer.userId, this.store.getGameSettings(), this.store.getOrganisation());
    const quote = quoteProject(original, layout, fundId, this.store.publicEconomy.receipts, this.store.publicEconomy.inventory, donatedObjects);
    const spawn = edit.tool === "spawn" ? { x: Math.round(edit.position.x / 32) * 32, y: Math.round(edit.position.y / 32) * 32 } : existing?.project.spawn;
    if (spawn && fundId !== WORKSPACE_FUND_ID) throw new Error("PUBLIC_FUND_SCOPE");
    const project: BuildProject = { id: existing?.project.id ?? randomUUID(), fundId, floorId: peer.floorId, baseRevision,
      layout: { ...layout, revision: baseRevision + 1 }, quote, edits: (existing?.project.edits ?? 0) + 1, ...(spawn ? { spawn } : {}) };
    this.drafts.set(peer.userId, { project, donatedObjects, submitted: false });
    peer.send({ type: "project.preview", requestId, project: structuredClone(project) });
  }

  submit(peer: ProjectPeer, requestId: string, draftId: string, title: string): void {
    const fingerprint = `project:${draftId}:${title}`;
    const replay = this.store.publicEconomy.findOperation(peer.userId, requestId, fingerprint);
    if (replay !== undefined) {
      peer.send({ type: "project.submitted", requestId, ...(replay ? { proposalId: replay } : {}) });
      return;
    }
    const draft = this.drafts.get(peer.userId);
    if (!draft || draft.project.id !== draftId || draft.submitted) throw new Error("PROJECT_STALE");
    this.store.getPublicEconomy();
    this.validateProject(peer.userId, draft.project);
    const action: PublicAction = { kind: "project", project: draft.project };
    const proposalId = this.store.publicEconomy.propose(peer.userId, title, action, draft.project.fundId,
      this.store.getOrganisation(), this.store.getMembers().map((member) => member.id)).id;
    draft.submitted = true;
    this.store.publicEconomy.recordOperation(peer.userId, requestId, fingerprint, proposalId);
    this.publish(requestId);
    peer.send({ type: "project.submitted", requestId, ...(proposalId ? { proposalId } : {}) });
  }

  propose(peer: ProjectPeer, requestId: string, title: string, action: Exclude<PublicAction, { kind: "project" }>): void {
    const fingerprint = JSON.stringify({ title, action });
    const replay = this.store.publicEconomy.findOperation(peer.userId, requestId, fingerprint);
    if (replay !== undefined) { this.publish(requestId); return; }
    this.store.getPublicEconomy();
    const fundId = this.validateAction(peer.userId, action);
    const proposal = this.store.publicEconomy.propose(peer.userId, title, action, fundId,
      this.store.getOrganisation(), this.store.getMembers().map((member) => member.id));
    this.store.publicEconomy.recordOperation(peer.userId, requestId, fingerprint, proposal.id);
    this.publish(requestId);
  }

  vote(peer: ProjectPeer, requestId: string, proposalId: string, approve: boolean): void {
    this.store.getPublicEconomy();
    const fingerprint = `vote:${proposalId}:${approve}`;
    if (this.store.publicEconomy.findOperation(peer.userId, requestId, fingerprint) === undefined) {
      this.store.publicEconomy.vote(peer.userId, proposalId, approve);
      this.store.publicEconomy.recordOperation(peer.userId, requestId, fingerprint, proposalId);
    }
    this.publish(requestId);
  }

  execute(peer: ProjectPeer, requestId: string, proposalId: string): void {
    this.store.getPublicEconomy();
    const proposal = this.store.publicEconomy.proposal(proposalId);
    if (proposal.status === "applied") { this.publish(requestId); return; }
    if (proposal.action.kind === "project" && this.store.getLayout(proposal.action.project.floorId)?.revision !== proposal.action.project.baseRevision) throw new Error("PROJECT_STALE");
    if (proposal.status !== "approved") throw new Error("PROJECT_APPROVAL_REQUIRED");
    if (proposal.proposedBy !== peer.userId && !proposal.electorate.includes(peer.userId)) throw new Error("PROPOSAL_VOTE_FORBIDDEN");
    if (proposal.action.kind === "project") this.validateProject(proposal.proposedBy, proposal.action.project);
    else this.validateAction(proposal.proposedBy, proposal.action);
    const checkpoint = this.store.exportMutableState();
    try {
      proposal.status = "applied";
      this.callbacks.apply({ ...peer, userId: proposal.proposedBy }, proposal.action, requestId);
    } catch (error) {
      this.store.restoreMutableState(checkpoint);
      throw error;
    }
    this.publish(requestId);
  }

  cancel(peer: ProjectPeer, requestId: string, proposalId: string): void {
    this.store.getPublicEconomy();
    this.store.publicEconomy.cancel(peer.userId, proposalId);
    this.publish(requestId);
  }

  publish(requestId?: string): void {
    this.callbacks.broadcast({ type: "public_economy.updated", economy: this.store.getPublicEconomy(), ...(requestId ? { requestId } : {}) });
    this.publishedResolutionRevision = this.store.publicEconomy.resolutionRevision;
  }

  tick(): void {
    if (this.store.publicEconomy.hasDueProposals() || this.publishedResolutionRevision !== this.store.publicEconomy.resolutionRevision) this.publish();
  }

  private assertFundMember(userId: string, fundId: string): void {
    const organisation = this.store.getOrganisation();
    const fund = this.store.publicEconomy.fund(fundId);
    if (!this.store.getMember(userId) || (!publicFundMemberIds(fund, organisation, this.store.getMembers().map((member) => member.id)).includes(userId)
      && !canManageUnit(organisation, userId, fund.unitId))) throw new Error("PUBLIC_FUND_FORBIDDEN");
  }

  private validateProject(userId: string, project: BuildProject): void {
    const layout = this.store.getLayout(project.floorId);
    if (!layout || layout.revision !== project.baseRevision) throw new Error("PROJECT_STALE");
    if (JSON.stringify({ ...project.layout, revision: layout.revision }) === JSON.stringify(layout)
      && (!project.spawn || JSON.stringify(project.spawn) === JSON.stringify(this.store.getFloor(project.floorId)!.spawn))) throw new Error("PROJECT_EMPTY");
    this.assertFundMember(userId, project.fundId);
    assertProjectScope(layout, project.layout, this.store.publicEconomy.fund(project.fundId), userId,
      this.store.getGameSettings(), this.store.getOrganisation());
    for (const object of project.layout.objects) {
      if (!object.ownedAssetId || !object.ownerUserId) continue;
      const original = layout.objects.find((candidate) => candidate.id === object.id);
      if (JSON.stringify(original) === JSON.stringify(object)) continue;
      if (object.ownerUserId !== userId) throw new Error("PRIVATE_ASSET_PROTECTED");
      const owned = this.store.getOwnedAsset(userId, object.ownedAssetId);
      if (owned.assetId !== object.assetId || owned.placement && owned.placement.objectId !== object.id) throw new Error("ASSET_ALREADY_PLACED");
    }
  }

  private validateAction(userId: string, action: Exclude<PublicAction, { kind: "project" }>): string {
    if (action.kind === "record") throw new Error("PROPOSAL_CLOSED");
    const organisation = this.store.getOrganisation();
    const memberIds = this.store.getMembers().map((member) => member.id);
    if (!memberIds.includes(userId)) throw new Error("USER_NOT_FOUND");
    if (action.kind === "fund.create") {
      if (!organisation.units.some((unit) => unit.id === action.unitId)) throw new Error("ORGANISATION_UNIT_NOT_FOUND");
      if (this.store.publicEconomy.view().funds.some((fund) => fund.unitId === action.unitId)) throw new Error("PUBLIC_FUND_EXISTS");
    } else if (action.kind === "fund.transfer") {
      this.store.publicEconomy.fund(action.fromFundId);
      this.store.publicEconomy.fund(action.toFundId);
      if (action.fromFundId === action.toFundId) throw new Error("PUBLIC_FUND_SCOPE");
      return action.fromFundId;
    } else if (action.kind === "governance") {
      if (action.mode === "hierarchical" ? action.ceoIds.length === 0 : action.ceoIds.length !== 0) throw new Error("GOVERNANCE_INVALID");
      if (new Set(action.ceoIds).size !== action.ceoIds.length || action.ceoIds.some((id) => !memberIds.includes(id))) throw new Error("GOVERNANCE_INVALID");
    } else if (action.kind === "organisation") {
      if (this.store.publicEconomy.fund(WORKSPACE_FUND_ID).mode === "equal" && action.edit.type.startsWith("ceo.")) throw new Error("GOVERNANCE_INVALID");
      this.store.previewOrganisationEdit(userId, action.baseRevision, action.edit);
    } else if (action.kind === "room.settings") {
      const room = this.store.getRoom(action.roomId);
      if (!room) throw new Error("ROOM_NOT_FOUND");
      if (this.store.getLayout(room.floorId)?.revision !== action.baseRevision) throw new Error("PROJECT_STALE");
      const accessMode = action.settings.access.mode === "default" ? this.store.getGameSettings().roomAccess.mode : action.settings.access.mode;
      if (!room.privateEligible && accessMode !== "open") throw new Error("ROOM_NOT_PRIVATE_ELIGIBLE");
      if (action.settings.access.knockable && accessMode === "open") throw new Error("ROOM_KNOCK_REQUIRES_PRIVATE");
      validateRoomPermission(action.settings.access, organisation, memberIds);
      validatePersonalSpaces(room, action.settings, memberIds);
      if (action.settings.build) validateRoomPermission(action.settings.build, organisation, memberIds);
      if (action.settings.organisationUnitId && !organisation.units.some((unit) => unit.id === action.settings.organisationUnitId)) throw new Error("ORGANISATION_UNIT_NOT_FOUND");
      if (room.organisationUnitId === action.settings.organisationUnitId) {
        return publicFundForUnit(this.store.publicEconomy.view(), organisation, room.organisationUnitId).id;
      }
    } else if (action.kind === "game.settings") {
      validateRoomPermission(action.settings.roomAccess, organisation, memberIds);
      validateRoomPermission(action.settings.roomBuild, organisation, memberIds);
    } else if (action.kind === "kidnapping.settings") {
      if (action.settings.targetPolicy.userIds.some((id) => !memberIds.includes(id))) throw new Error("USER_NOT_FOUND");
    } else if (action.kind === "asset.sell") {
      const asset = this.store.publicEconomy.inventory.find((entry) => entry.id === action.publicAssetId);
      if (!asset) throw new Error("PUBLIC_ASSET_UNAVAILABLE");
      return asset.fundId;
    }
    return WORKSPACE_FUND_ID;
  }
}
