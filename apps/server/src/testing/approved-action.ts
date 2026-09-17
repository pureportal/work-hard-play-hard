import { randomUUID } from "node:crypto";
import type { PublicAction, RoomSettings, SpendingProposal } from "@workhard/shared";
import type { WorkspaceStore } from "../store.js";
import type { WorldRuntime } from "../world/world-runtime.js";

export function approveProposal(runtime: WorldRuntime, proposal: SpendingProposal): void {
  for (const userId of proposal.electorate) {
    if (proposal.status !== "open" || proposal.ballots.some((ballot) => ballot.userId === userId)) continue;
    const voter = runtime.connect(userId, "floor-studio", () => undefined);
    runtime.handleCommand(voter, { type: "public_economy.vote", requestId: randomUUID(), proposalId: proposal.id, approve: true });
    runtime.disconnect(voter);
  }
}

export function applyApprovedAction(runtime: WorldRuntime, store: WorkspaceStore, peer: string, action: Exclude<PublicAction, { kind: "project" }>, requestId: string = randomUUID()): void {
  const previousIds = new Set(store.getPublicEconomy().proposals.map((proposal) => proposal.id));
  runtime.handleCommand(peer, { type: "public_economy.propose", requestId, title: "Test proposal", action });
  const created = store.getPublicEconomy().proposals.find((proposal) => !previousIds.has(proposal.id));
  if (!created) return;
  const proposal = store.publicEconomy.proposal(created.id);
  approveProposal(runtime, proposal);
  runtime.handleCommand(peer, { type: "public_economy.execute", requestId, proposalId: proposal.id });
}

export function applyRoomSettings(runtime: WorldRuntime, store: WorkspaceStore, peer: string, command: { requestId: string; baseRevision: number; roomId: string; settings: RoomSettings }): void {
  const { requestId, ...settings } = command;
  applyApprovedAction(runtime, store, peer, { kind: "room.settings", ...settings }, requestId);
}
