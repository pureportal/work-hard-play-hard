import { randomUUID } from "node:crypto";
import type { LayoutEdit, ServerEvent } from "@workhard/shared";
import type { WorkspaceStore } from "../store.js";
import type { WorldRuntime } from "../world/world-runtime.js";

export function applyBuildingProject(runtime: WorldRuntime, store: WorkspaceStore, peer: string, events: ServerEvent[], command: {
  requestId: string; baseRevision: number; edit: LayoutEdit;
}): void {
  store.updateGameSettings({ roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } });
  for (const layout of store.getLayouts()) for (const room of layout.rooms) room.build = { mode: "open", assignedPersonIds: [] };
  const fund = store.publicEconomy.fund("workspace");
  if (fund.balance === 0) store.publicEconomy.record("workspace", "user-maya", "donation", 100_000, "geometry-fixture");
  store.getPublicEconomy();
  runtime.handleCommand(peer, { type: "project.edit", fundId: "workspace", ...command });
  const preview = events.filter((event) => event.type === "project.preview" && event.requestId === command.requestId).at(-1);
  if (preview?.type !== "project.preview") return;
  const submitId = randomUUID();
  runtime.handleCommand(peer, { type: "project.submit", requestId: submitId, draftId: preview.project.id, title: "Geometry test" });
  const submitted = events.filter((event) => event.type === "project.submitted" && event.requestId === submitId).at(-1);
  if (submitted?.type !== "project.submitted" || !submitted.proposalId) return;
  const proposal = store.publicEconomy.proposal(submitted.proposalId);
  while (proposal.status === "open") {
    const approverId = proposal.electorate.find((userId) => !proposal.ballots.some((ballot) => ballot.userId === userId))!;
    const approver = runtime.connect(approverId, "floor-studio", () => undefined);
    runtime.handleCommand(approver, { type: "public_economy.vote", requestId: randomUUID(), proposalId: proposal.id, approve: true });
    runtime.disconnect(approver);
  }
  runtime.handleCommand(peer, { type: "public_economy.execute", requestId: command.requestId, proposalId: proposal.id });
}
