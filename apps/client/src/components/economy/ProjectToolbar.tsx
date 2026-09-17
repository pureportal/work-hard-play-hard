import { useState } from "react";
import { Coins, PencilRuler } from "lucide-react";
import { availablePublicMoney, canManageUnit, publicFundMemberIds, type BuildProject, type OrganisationState, type PublicEconomy } from "@workhard/shared";
import "../../public-economy.css";

export function ProjectToolbar({ economy, organisation, userId, fundId, project, pending, reviewing, stale = false, onFundChange, onSubmit, onDiscard }: {
  economy: PublicEconomy; organisation: OrganisationState; userId: string; fundId: string;
  project: BuildProject | undefined; pending: boolean; reviewing: boolean;
  stale?: boolean;
  onFundChange: (id: string) => void; onSubmit: (title: string) => void; onDiscard: () => void;
}) {
  const [title, setTitle] = useState("");
  const fund = economy.funds.find((entry) => entry.id === fundId)!;
  const allowance = fund.allowances.find((entry) => entry.userId === userId)?.remaining ?? 0;
  const needsVote = Boolean(project && (project.quote.requiresApproval || project.spawn || project.quote.cost > allowance));
  const affordable = !project || project.quote.cost <= (needsVote ? availablePublicMoney(economy, fundId) : allowance);
  return <section className="project-toolbar" aria-label={reviewing ? "Project review" : "Shared building"}>
    <label>Fund<select value={fundId} disabled={Boolean(project) || pending} onChange={(event) => onFundChange(event.target.value)}>
      {economy.funds.filter((entry) => publicFundMemberIds(entry, organisation, [userId]).includes(userId) || canManageUnit(organisation, userId, entry.unitId))
        .map((entry) => <option key={entry.id} value={entry.id}>{entry.unitId ? organisation.units.find((unit) => unit.id === entry.unitId)?.name : "Workspace"}</option>)}
    </select></label>
    <div className="fund-totals"><span>Balance <strong>{fund.balance}</strong></span><span>Your allowance <strong>{allowance}</strong></span></div>
    {project && <>
      <div className="project-state"><PencilRuler size={16} />{stale ? "Layout changed · start a new draft" : reviewing ? "Proposal preview" : "Draft · not placed"}</div>
      <div className="project-quote"><strong><Coins size={17} />{project.quote.cost.toLocaleString()} coins</strong>{project.quote.refund > 0 && <span>+{project.quote.refund} to shared funds</span>}</div>
      {reviewing ? <button className="secondary-button" onClick={onDiscard}>Back to votes</button> : <form onSubmit={(event) => {
        event.preventDefault(); onSubmit(title.trim() || "Building project");
      }}>
        {needsVote && <label>Project name<input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} /></label>}
        <div className="economy-actions">
          <button className="secondary-button" type="button" disabled={pending} onClick={onDiscard}>Discard</button>
          <button className="primary-button" disabled={pending || !affordable || stale}>{pending ? "Saving…" : needsVote ? "Propose project" : "Buy & place"}</button></div>
        {!affordable && <p role="status">{needsVote ? "Add money to the project reserve or reduce the cost." : "Reduce the cost to fit your allowance."}</p>}
      </form>}
    </>}
  </section>;
}
