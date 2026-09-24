import { Check, CheckCircle2, Clock3, Eye, Pencil, Play, Trash2, Vote, X } from "lucide-react";
import { useEffect, useState } from "react";
import { availablePublicMoney, getAssetDefinition, projectRequiredMoney, rebaseProjectLayout, type BuildProject, type ClientCommand, type Floor, type FloorLayout, type Member, type OrganisationState, type PublicEconomy, type Room, type SpendingProposal } from "@workhard/shared";
import { ProposalDetails } from "./ProposalDetails";
import { useContextActions, type ContextAction } from "../ContextMenu";

export function SpendingProposals({ proposals, economy, organisation, members, userId, pending, onCommand, onReview, onEdit, onOpenBuild, rooms, layouts, floors }: {
  proposals: SpendingProposal[]; economy: PublicEconomy; organisation: OrganisationState; members: Member[]; userId: string; pending: boolean;
  onCommand: (command: ClientCommand) => void; onReview: (project: BuildProject) => void; onEdit: (proposal: SpendingProposal) => void;
  onOpenBuild?: () => void;
  rooms: Room[]; layouts: FloorLayout[]; floors: Floor[];
}) {
  const contextActions = useContextActions();
  const [now, setNow] = useState(Date.now);
  const votingOpen = proposals.some((proposal) => proposal.status === "open");
  useEffect(() => {
    if (!votingOpen) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [votingOpen]);
  const active = proposals.filter((proposal) => ["open", "approved"].includes(proposal.status));
  const history = proposals.filter((proposal) => !active.includes(proposal));
  const card = (proposal: SpendingProposal) => {
    const current = active.includes(proposal);
    const approvals = proposal.ballots.filter((ballot) => ballot.approve).length;
    const ballot = proposal.ballots.find((entry) => entry.userId === userId);
    const votingClosed = Date.parse(proposal.expiresAt) <= now;
    const canVote = proposal.status === "open" && !votingClosed && proposal.electorate.includes(userId) && !ballot;
    const project = proposal.action.kind === "project" ? proposal.action.project : undefined;
    const shortfall = project ? Math.max(0, projectRequiredMoney(project) - availablePublicMoney(economy, proposal.fundId)) : 0;
    const currentLayout = project && layouts.find((layout) => layout.floorId === project.floorId);
    const floor = project && floors.find((item) => item.id === project.floorId);
    const conflicts = project && currentLayout && floor ? rebaseProjectLayout(project, currentLayout, floor).conflicts : [];
    const conflictNames = conflicts.map((conflict) => {
      if (conflict.kind === "object") {
        const object = project?.layout.objects.find((item) => item.id === conflict.id);
        return getAssetDefinition(object?.assetId ?? "")?.name ?? "Object";
      }
      return conflict.kind === "layout" ? "Floor" : conflict.kind === "wall" ? "Wall" : "Opening";
    });
    const status = proposal.status === "open" && votingClosed ? "Counting votes…" : {
      open: conflicts.length ? "Layout conflict" : "Needs votes", approved: conflicts.length ? "Layout conflict" : shortfall > 0 ? "Waiting for funds" : "Ready to apply", applied: "Applied", rejected: "Rejected", expired: "Expired", cancelled: "Cancelled",
    }[proposal.status];
    return <article className={`spending-proposal proposal-${proposal.status}`} key={proposal.id} aria-label={proposal.title}
      tabIndex={current ? 0 : undefined} {...(current ? contextActions(() => {
        const actions: ContextAction[] = [];
        if (project) actions.push({ label: "View layout", icon: Eye, group: "Proposal", onSelect: () => onReview(project) });
        if (project && proposal.proposedBy === userId) actions.push({ label: "Edit draft", icon: Pencil, group: "Proposal", onSelect: () => onEdit(proposal), disabled: pending });
        if (canVote && !conflicts.length) {
          actions.push({ label: "Approve", icon: Check, group: "Vote", onSelect: () => onCommand({ type: "public_economy.vote", requestId: crypto.randomUUID(), proposalId: proposal.id, approve: true }), disabled: pending });
          actions.push({ label: "Reject", icon: X, group: "Vote", onSelect: () => onCommand({ type: "public_economy.vote", requestId: crypto.randomUUID(), proposalId: proposal.id, approve: false }), disabled: pending });
        }
        if (proposal.status === "approved" && (proposal.proposedBy === userId || proposal.electorate.includes(userId)))
          actions.push({ label: "Apply proposal", icon: Play, group: "Manage", onSelect: () => onCommand({ type: "public_economy.execute", requestId: crypto.randomUUID(), proposalId: proposal.id }), disabled: pending || shortfall > 0 || conflicts.length > 0 });
        if ((proposal.status === "approved" || !votingClosed) && proposal.proposedBy === userId)
          actions.push({ label: "Cancel proposal", icon: Trash2, group: "Manage", onSelect: () => onCommand({ type: "public_economy.cancel", requestId: crypto.randomUUID(), proposalId: proposal.id }), disabled: pending, danger: true });
        return actions;
      }) : {})}>
      <header><h3>{proposal.title}</h3><span className="proposal-status">{current ? proposal.status === "approved" ? <CheckCircle2 size={15} /> : <Clock3 size={15} /> : null}{status}</span></header>
      <ProposalDetails action={proposal.action} economy={economy} organisation={organisation} members={members} rooms={rooms} />
      {current && proposal.required > 0 && <div className="proposal-progress"><progress value={approvals} max={proposal.required} aria-label={`${approvals} of ${proposal.required} approvals`} />
        <span>{approvals} / {proposal.required} approvals</span>{ballot && <span>{ballot.approve ? "You approved" : "You rejected"}</span>}</div>}
      {proposal.status === "approved" && shortfall > 0 && <p role="status">Needs {shortfall.toLocaleString()} more coins in this fund.</p>}
      {current && conflicts.length > 0 && <p role="status">{conflicts.some((conflict) => conflict.reason === "overlap") ? "Overlaps" : "Conflicts"}: {conflictNames.join(", ")}. {proposal.proposedBy === userId ? "Edit the draft to apply it." : "The creator must edit the draft."}</p>}
      <footer><span>{members.find((member) => member.id === proposal.proposedBy)?.name} · {proposal.fundId === "workspace" ? "Workspace" : organisation.units.find((unit) => unit.id === proposal.fundId)?.name}</span>
        {proposal.status === "open" && !votingClosed && <time dateTime={proposal.expiresAt} title={new Date(proposal.expiresAt).toLocaleString()}>
          {Date.parse(proposal.expiresAt) - now < 60_000 ? `${Math.ceil((Date.parse(proposal.expiresAt) - now) / 1_000)}s left` : `Until ${new Date(proposal.expiresAt).toLocaleString()}`}
        </time>}</footer>
      <div className="economy-actions">
        {current && proposal.action.kind === "project" && <button className="secondary-button" onClick={() => { if (proposal.action.kind === "project") onReview(proposal.action.project); }}>View layout</button>}
        {current && project && proposal.proposedBy === userId && <button className="secondary-button" disabled={pending} onClick={() => onEdit(proposal)}>Edit draft</button>}
        {canVote && !conflicts.length && <button className="secondary-button" disabled={pending} onClick={() => onCommand({ type: "public_economy.vote", requestId: crypto.randomUUID(), proposalId: proposal.id, approve: false })}>Reject</button>}
        {current && proposal.status === "approved" && (proposal.proposedBy === userId || proposal.electorate.includes(userId)) && <button className="primary-button" disabled={pending || shortfall > 0 || conflicts.length > 0} onClick={() => onCommand({ type: "public_economy.execute", requestId: crypto.randomUUID(), proposalId: proposal.id })}>Apply proposal</button>}
        {current && (proposal.status === "approved" || !votingClosed) && proposal.proposedBy === userId && <button className="secondary-button" disabled={pending} onClick={() => onCommand({ type: "public_economy.cancel", requestId: crypto.randomUUID(), proposalId: proposal.id })}>Cancel proposal</button>}
      </div>
    </article>;
  };
  return <section className="spending-proposals" aria-label="Proposals" data-guide="proposals">
    {active.length ? <div className="proposal-grid">{active.map(card)}</div> : <div className="dialog-empty"><Vote size={32} /><p>No votes waiting.</p>{onOpenBuild && <button type="button" className="secondary-button" onClick={onOpenBuild}>Open Build</button>}</div>}
    {history.length > 0 && <details className="proposal-history"><summary>Past proposals ({history.length})</summary><div className="proposal-grid">{history.map(card)}</div></details>}
  </section>;
}
