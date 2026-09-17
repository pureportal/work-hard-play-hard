import { CheckCircle2, Clock3, Vote } from "lucide-react";
import type { BuildProject, ClientCommand, Member, OrganisationState, PublicEconomy, Room, SpendingProposal } from "@workhard/shared";
import { ProposalDetails } from "./ProposalDetails";

export function SpendingProposals({ proposals, economy, organisation, members, userId, pending, onCommand, onReview, rooms }: {
  proposals: SpendingProposal[]; economy: PublicEconomy; organisation: OrganisationState; members: Member[]; userId: string; pending: boolean;
  onCommand: (command: ClientCommand) => void; onReview: (project: BuildProject) => void;
  rooms: Room[];
}) {
  const active = proposals.filter((proposal) => ["open", "approved"].includes(proposal.status) && Date.parse(proposal.expiresAt) > Date.now());
  const history = proposals.filter((proposal) => !active.includes(proposal));
  const card = (proposal: SpendingProposal) => {
    const current = active.includes(proposal);
    const approvals = proposal.ballots.filter((ballot) => ballot.approve).length;
    const ballot = proposal.ballots.find((entry) => entry.userId === userId);
    const canVote = proposal.status === "open" && current && proposal.electorate.includes(userId) && !ballot;
    const status = !current && ["open", "approved"].includes(proposal.status) ? "Expired" : {
      open: "Needs votes", approved: "Ready to apply", applied: "Applied", rejected: "Rejected", expired: "Expired", cancelled: "Cancelled",
    }[proposal.status];
    return <article className={`spending-proposal proposal-${proposal.status}`} key={proposal.id} aria-label={proposal.title}>
      <header><h3>{proposal.title}</h3><span className="proposal-status">{current ? proposal.status === "approved" ? <CheckCircle2 size={15} /> : <Clock3 size={15} /> : null}{status}</span></header>
      <ProposalDetails action={proposal.action} economy={economy} organisation={organisation} members={members} rooms={rooms} />
      {current && <div className="proposal-progress"><progress value={approvals} max={proposal.required} aria-label={`${approvals} of ${proposal.required} approvals`} />
        <span>{approvals} / {proposal.required} approvals</span>{ballot && <span>{ballot.approve ? "You approved" : "You rejected"}</span>}</div>}
      <footer><span>{members.find((member) => member.id === proposal.proposedBy)?.name} · {proposal.fundId === "workspace" ? "Workspace" : organisation.units.find((unit) => unit.id === proposal.fundId)?.name}</span>
        {current && <time dateTime={proposal.expiresAt}>Until {new Date(proposal.expiresAt).toLocaleDateString()}</time>}</footer>
      <div className="economy-actions">
        {current && proposal.action.kind === "project" && <button className="secondary-button" onClick={() => { if (proposal.action.kind === "project") onReview(proposal.action.project); }}>View layout</button>}
        {canVote && <><button className="primary-button" disabled={pending} onClick={() => onCommand({ type: "public_economy.vote", requestId: crypto.randomUUID(), proposalId: proposal.id, approve: true })}>Approve</button>
          <button className="secondary-button" disabled={pending} onClick={() => onCommand({ type: "public_economy.vote", requestId: crypto.randomUUID(), proposalId: proposal.id, approve: false })}>Reject</button></>}
        {current && proposal.status === "approved" && (proposal.proposedBy === userId || proposal.electorate.includes(userId)) && <button className="primary-button" disabled={pending} onClick={() => onCommand({ type: "public_economy.execute", requestId: crypto.randomUUID(), proposalId: proposal.id })}>Apply proposal</button>}
        {current && proposal.proposedBy === userId && <button className="secondary-button" disabled={pending} onClick={() => onCommand({ type: "public_economy.cancel", requestId: crypto.randomUUID(), proposalId: proposal.id })}>Cancel proposal</button>}
      </div>
    </article>;
  };
  return <section className="spending-proposals" aria-label="Proposals">
    {active.length ? <div className="proposal-grid">{active.map(card)}</div> : <div className="dialog-empty"><Vote size={32} /><p>No votes waiting.</p></div>}
    {history.length > 0 && <details className="proposal-history"><summary>Past proposals ({history.length})</summary><div className="proposal-grid">{history.map(card)}</div></details>}
  </section>;
}
