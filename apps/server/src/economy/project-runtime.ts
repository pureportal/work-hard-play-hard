import { assertPublicReachability, assertTeleportersRetained } from "../world/public-reachability.js";
import { randomUUID } from "node:crypto";
import {
  WORKSPACE_FUND_ID, approvalRateForAction, availablePublicMoney, detectLayoutRooms, getAssetDefinition, canManageUnit, permissionAllows, projectRequiredMoney, publicFundForUnit, publicFundMemberIds, rebaseProjectLayout, roomBuildAllows, validatePersonalSpaces, type BuildProject, type FloorLayout,
  type ProjectEdit, type PublicAction, type ServerEvent, type SpendingProposal,
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
  proposalId?: string;
}

export class ProjectRuntime {
  private readonly drafts = new Map<string, Draft>();
  private publishedResolutionRevision = 0;

  constructor(private readonly store: WorkspaceStore, private readonly callbacks: {
    edit: (peer: ProjectPeer, layout: FloorLayout, edit: ProjectEdit, fundId: string) => FloorLayout;
    apply: (peer: ProjectPeer, action: PublicAction, requestId: string) => void;
    broadcast: (event: ServerEvent) => void;
  }) {}

  edit(peer: ProjectPeer, requestId: string, baseRevision: number, fundId: string, edit: ProjectEdit, draftId?: string, proposalId?: string): void {
    const original = this.store.getLayout(peer.floorId);
    if (!original || original.revision !== baseRevision) throw new Error("PROJECT_STALE");
    let existing = draftId ? this.drafts.get(peer.userId) : undefined;
    if (proposalId && (!existing || existing.project.id !== draftId || existing.proposalId !== proposalId)) {
      const proposal = this.store.publicEconomy.proposal(proposalId);
      if (proposal.proposedBy !== peer.userId || !["open", "approved"].includes(proposal.status)
        || proposal.action.kind !== "project" || proposal.action.project.id !== draftId) throw new Error("PROJECT_STALE");
      const current = this.store.getLayout(proposal.action.project.floorId);
      const floor = this.store.getFloor(proposal.action.project.floorId);
      if (!current || !floor) throw new Error("PROJECT_STALE");
      const rebased = rebaseProjectLayout(proposal.action.project, current, floor);
      existing = { project: { ...proposal.action.project, baseRevision: current.revision, baseLayout: structuredClone(current), layout: rebased.layout,
        quote: quoteProject(current, rebased.layout, fundId, this.store.publicEconomy.receipts, this.store.publicEconomy.inventory,
          new Map(proposal.action.project.donatedAssets?.map(({ key, id }) => [key, id])), this.store.getFloors().length) },
        donatedObjects: new Map(proposal.action.project.donatedAssets?.map(({ key, id }) => [key, id])), submitted: false, proposalId };
    }
    if (draftId && (!existing || existing.project.id !== draftId || existing.submitted)) throw new Error("PROJECT_STALE");
    if (existing && (existing.project.floorId !== peer.floorId || existing.project.fundId !== fundId)) throw new Error("PROJECT_STALE");
    if (existing && existing.project.baseRevision !== baseRevision) {
      const rebased = rebaseProjectLayout(existing.project, original, this.store.getFloor(peer.floorId)!);
      existing.project = { ...existing.project, baseRevision, baseLayout: structuredClone(original), layout: rebased.layout };
    }
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
    const quote = quoteProject(original, layout, fundId, this.store.publicEconomy.receipts, this.store.publicEconomy.inventory, donatedObjects, this.store.getFloors().length);
    const spawn = edit.tool === "spawn" ? { x: Math.round(edit.position.x / 32) * 32, y: Math.round(edit.position.y / 32) * 32 } : existing?.project.spawn;
    if (spawn && fundId !== WORKSPACE_FUND_ID) throw new Error("PUBLIC_FUND_SCOPE");
    const project: BuildProject = { id: existing?.project.id ?? randomUUID(), fundId, floorId: peer.floorId, baseRevision, baseLayout: structuredClone(existing?.project.baseLayout ?? original),
      layout: { ...layout, revision: baseRevision + 1 }, quote,
      donatedAssets: [...donatedObjects].map(([key, id]) => ({ key, id })),
      ...(quote.assetChanges.some(({ object, change }) => change === "place" && getAssetDefinition(object.assetId)?.kind === "portal")
        ? { floorCount: this.store.getFloors().length } : {}), edits: (existing?.project.edits ?? 0) + 1, ...(spawn ? { spawn } : {}) };
    assertTeleportersRetained(original, layout);
    assertPublicReachability({ ...this.store.getFloor(peer.floorId)!, ...(spawn ? { spawn } : {}) }, layout, this.store.getGameSettings());
    this.drafts.set(peer.userId, { project, donatedObjects, submitted: false, ...(existing?.proposalId ? { proposalId: existing.proposalId } : {}) });
    peer.send({ type: "project.preview", requestId, project: structuredClone(project) });
  }

  submit(peer: ProjectPeer, requestId: string, draftId: string, title: string, proposalId?: string): void {
    const fingerprint = `project:${draftId}:${title}`;
    const replay = this.store.publicEconomy.findOperation(peer.userId, requestId, fingerprint);
    if (replay !== undefined) {
      peer.send({ type: "project.submitted", requestId, ...(replay ? { proposalId: replay } : {}) });
      return;
    }
    const draft = this.drafts.get(peer.userId);
    if (!draft || draft.project.id !== draftId || draft.submitted) throw new Error("PROJECT_STALE");
    this.store.getPublicEconomy();
    const project = this.validateProject(peer.userId, draft.project);
    const action: PublicAction = { kind: "project", project };
    const options = this.projectApproval(peer.userId, project);
    let submittedProposalId: string;
    if (proposalId) {
      if (draft.proposalId !== proposalId) throw new Error("PROJECT_STALE");
      const proposal = this.store.publicEconomy.proposal(proposalId);
      if (proposal.proposedBy !== peer.userId || !["open", "approved"].includes(proposal.status)) throw new Error("PROJECT_STALE");
      if (!options.electorate.length && !options.direct && approvalRateForAction(this.store.publicEconomy.getApprovalRates(), action) > 0) throw new Error("PROPOSAL_NO_APPROVERS");
      const revisedAutomaticProposal = proposal.approvalRate === 0 && !options.direct;
      proposal.title = title;
      proposal.action = structuredClone(action);
      proposal.electorate = options.electorate;
      proposal.approvalRate = options.direct ? 0 : approvalRateForAction(this.store.publicEconomy.getApprovalRates(), action);
      proposal.ballots = [];
      proposal.required = revisedAutomaticProposal ? 1 : Math.ceil(proposal.electorate.length * proposal.approvalRate / 100);
      proposal.status = proposal.required === 0 ? "approved" : "open";
      proposal.expiresAt = new Date(Date.now() + (process.env.NODE_ENV === "production" ? 7 * 86_400_000 : 10_000)).toISOString();
      if (proposal.required === 0 && projectRequiredMoney(project) <= availablePublicMoney(this.store.publicEconomy.view(), project.fundId)) this.execute(peer, requestId, proposal.id);
      else this.publish(requestId);
      submittedProposalId = proposal.id;
    } else submittedProposalId = this.submitProposal(peer, requestId, title, action, project.fundId, options);
    draft.submitted = true;
    this.store.publicEconomy.recordOperation(peer.userId, requestId, fingerprint, submittedProposalId);
    peer.send({ type: "project.submitted", requestId, proposalId: submittedProposalId });
  }

  propose(peer: ProjectPeer, requestId: string, title: string, action: Exclude<PublicAction, { kind: "project" }>): void {
    const fingerprint = JSON.stringify({ title, action });
    const replay = this.store.publicEconomy.findOperation(peer.userId, requestId, fingerprint);
    if (replay !== undefined) { this.publish(requestId); return; }
    this.store.getPublicEconomy();
    const fundId = this.validateAction(peer.userId, action);
    const proposalId = this.submitProposal(peer, requestId, title, action, fundId);
    this.store.publicEconomy.recordOperation(peer.userId, requestId, fingerprint, proposalId);
  }

  vote(peer: ProjectPeer, requestId: string, proposalId: string, approve: boolean): void {
    this.store.getPublicEconomy();
    const fingerprint = `vote:${proposalId}:${approve}`;
    if (this.store.publicEconomy.findOperation(peer.userId, requestId, fingerprint) === undefined) {
      this.assertProjectElectorateCurrent(this.store.publicEconomy.proposal(proposalId));
      this.store.publicEconomy.vote(peer.userId, proposalId, approve);
      this.store.publicEconomy.recordOperation(peer.userId, requestId, fingerprint, proposalId);
    }
    this.publish(requestId);
  }

  execute(peer: ProjectPeer, requestId: string, proposalId: string): void {
    this.store.getPublicEconomy();
    const proposal = this.store.publicEconomy.proposal(proposalId);
    if (proposal.status === "applied") { this.publish(requestId); return; }
    if (proposal.status !== "approved") throw new Error("PROJECT_APPROVAL_REQUIRED");
    if (proposal.proposedBy !== peer.userId && !proposal.electorate.includes(peer.userId)) throw new Error("PROPOSAL_VOTE_FORBIDDEN");
    this.assertProjectElectorateCurrent(proposal);
    const action: PublicAction = proposal.action.kind === "project"
      ? { kind: "project", project: this.validateProject(proposal.proposedBy, proposal.action.project) }
      : proposal.action;
    if (action.kind !== "project") this.validateAction(proposal.proposedBy, action);
    const checkpoint = this.store.exportMutableState();
    try {
      proposal.status = "applied";
      this.callbacks.apply({ ...peer, userId: proposal.proposedBy }, action, requestId);
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

  private submitProposal(peer: ProjectPeer, requestId: string, title: string, action: PublicAction, fundId: string, options: { electorate?: string[]; direct?: boolean } = {}): string {
    const automatic = options.direct || approvalRateForAction(this.store.publicEconomy.getApprovalRates(), action) === 0;
    const checkpoint = automatic ? this.store.exportMutableState() : undefined;
    const wasDirty = this.store.dirty;
    try {
      const proposal = this.store.publicEconomy.propose(peer.userId, title, action, fundId,
        this.store.getOrganisation(), this.store.getMembers().map((member) => member.id), new Date(),
        { ...(options.electorate ? { electorate: options.electorate } : {}), ...(options.direct ? { approvalRate: 0 } : {}) });
      if (automatic && (action.kind !== "project" || projectRequiredMoney(action.project) <= availablePublicMoney(this.store.publicEconomy.view(), fundId))) {
        this.execute(peer, requestId, proposal.id);
      }
      else this.publish(requestId);
      return proposal.id;
    } catch (error) {
      if (checkpoint) {
        this.store.restoreMutableState(checkpoint);
        if (wasDirty) this.store.markDirty();
      }
      throw error;
    }
  }

  private projectApproval(userId: string, project: BuildProject): { electorate: string[]; direct: boolean } {
    const layout = this.store.getLayout(project.floorId)!;
    const organisation = this.store.getOrganisation();
    const settings = this.store.getGameSettings();
    const members = this.store.getMembers().map((member) => member.id);
    const fund = this.store.publicEconomy.fund(project.fundId);
    const impact = assertProjectScope(layout, project.layout, fund, userId, settings, organisation);
    const fundMembers = publicFundMemberIds(fund, organisation, members);
    const affectedRooms = layout.rooms.filter((room) => impact.roomIds.includes(room.id));
    const electorate = affectedRooms.length && !impact.affectsSharedSpace
      ? members.filter((id) => affectedRooms.some((room) => roomBuildAllows(room, id, settings, organisation)))
      : fundMembers;
    const ownerRoom = affectedRooms.length === 1 ? affectedRooms[0] : undefined;
    const direct = Boolean(ownerRoom && ownerRoom.ownerUserId === userId && ownerRoom.ownerBuildApproval === "direct"
      && impact.containedRoomIds.includes(ownerRoom.id) && !project.quote.structural && !project.spawn
      && project.quote.assetChanges.length > 0 && JSON.stringify(layout.tiles) === JSON.stringify(project.layout.tiles)
      && roomBuildAllows(ownerRoom, userId, settings, organisation));
    return { electorate, direct };
  }

  private assertProjectElectorateCurrent(proposal: SpendingProposal): void {
    if (proposal.action.kind !== "project" || !["open", "approved"].includes(proposal.status)) return;
    const project = this.validateProject(proposal.proposedBy, proposal.action.project);
    const current = this.projectApproval(proposal.proposedBy, project);
    const delegationRevoked = proposal.approvalRate === 0 && this.store.publicEconomy.getApprovalRates().building > 0 && !current.direct;
    if (!delegationRevoked && JSON.stringify(current.electorate) === JSON.stringify(proposal.electorate)) return;
    proposal.status = "cancelled";
    this.publish();
    throw new Error("PROJECT_STALE");
  }

  private assertFundMember(userId: string, fundId: string): void {
    const organisation = this.store.getOrganisation();
    const fund = this.store.publicEconomy.fund(fundId);
    if (!this.store.getMember(userId) || (!publicFundMemberIds(fund, organisation, this.store.getMembers().map((member) => member.id)).includes(userId)
      && !canManageUnit(organisation, userId, fund.unitId))) throw new Error("PUBLIC_FUND_FORBIDDEN");
  }

  private validateProject(userId: string, project: BuildProject): BuildProject {
    const layout = this.store.getLayout(project.floorId);
    const floor = this.store.getFloor(project.floorId);
    if (!layout || !floor) throw new Error("PROJECT_STALE");
    if (JSON.stringify(detectLayoutRooms(project.layout, floor).rooms) !== JSON.stringify(project.layout.rooms)) throw new Error("PROJECT_CONFLICT");
    const rebased = rebaseProjectLayout(project, layout, floor);
    if (rebased.conflicts.length) throw new Error("PROJECT_CONFLICT");
    const next = rebased.layout;
    if (JSON.stringify({ ...next, revision: layout.revision }) === JSON.stringify(layout)
      && (!project.spawn || JSON.stringify(project.spawn) === JSON.stringify(this.store.getFloor(project.floorId)!.spawn))) throw new Error("PROJECT_EMPTY");
    if (project.floorCount !== undefined && project.floorCount !== this.store.getFloors().length) throw new Error("PROJECT_CONFLICT");
    assertTeleportersRetained(layout, next);
    assertPublicReachability({ ...floor, ...(project.spawn ? { spawn: project.spawn } : {}) }, next, this.store.getGameSettings());
    this.assertFundMember(userId, project.fundId);
    assertProjectScope(layout, next, this.store.publicEconomy.fund(project.fundId), userId,
      this.store.getGameSettings(), this.store.getOrganisation());
    for (const object of next.objects) {
      if (!object.ownedAssetId || !object.ownerUserId) continue;
      const original = layout.objects.find((candidate) => candidate.id === object.id);
      if (JSON.stringify(original) === JSON.stringify(object)) continue;
      if (object.ownerUserId !== userId) throw new Error("PRIVATE_ASSET_PROTECTED");
      const owned = this.store.getOwnedAsset(userId, object.ownedAssetId);
      if (owned.assetId !== object.assetId || owned.placement && owned.placement.objectId !== object.id) throw new Error("ASSET_ALREADY_PLACED");
    }
    return { ...project, baseRevision: layout.revision, baseLayout: structuredClone(layout), layout: next,
      quote: quoteProject(layout, next, project.fundId, this.store.publicEconomy.receipts, this.store.publicEconomy.inventory,
        new Map(project.donatedAssets?.map(({ key, id }) => [key, id])), this.store.getFloors().length) };
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
      if (action.settings.ownerBuildApproval === "direct" && (!action.settings.ownerUserId || !room.privateEligible
        || !permissionAllows(action.settings.access.mode === "default" ? this.store.getGameSettings().roomAccess : action.settings.access, action.settings.ownerUserId, organisation))) throw new Error("PERSONAL_AREA_INVALID");
      if (action.settings.build) validateRoomPermission(action.settings.build, organisation, memberIds);
      if (action.settings.organisationUnitId && !organisation.units.some((unit) => unit.id === action.settings.organisationUnitId)) throw new Error("ORGANISATION_UNIT_NOT_FOUND");
      const layout = structuredClone(this.store.getLayout(room.floorId)!);
      const nextRoom = layout.rooms.find((candidate) => candidate.id === room.id)!;
      nextRoom.access = action.settings.access;
      nextRoom.personalAreas = action.settings.personalAreas ?? [];
      if (action.settings.ownerUserId) nextRoom.ownerUserId = action.settings.ownerUserId;
      else delete nextRoom.ownerUserId;
      assertPublicReachability(this.store.getFloor(room.floorId)!, layout, this.store.getGameSettings());
      if (room.organisationUnitId === action.settings.organisationUnitId) {
        return publicFundForUnit(this.store.publicEconomy.view(), organisation, room.organisationUnitId).id;
      }
    } else if (action.kind === "game.settings") {
      validateRoomPermission(action.settings.roomAccess, organisation, memberIds);
      validateRoomPermission(action.settings.roomBuild, organisation, memberIds);
      for (const floor of this.store.getFloors()) assertPublicReachability(floor, this.store.getLayout(floor.id)!, action.settings);
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
