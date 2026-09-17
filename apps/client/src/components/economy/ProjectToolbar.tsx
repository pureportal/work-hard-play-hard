import { Coins, PencilRuler } from "lucide-react";
import { availablePublicMoney, canManageUnit, projectRequiredMoney, publicFundMemberIds, type BuildProject, type OrganisationState, type PublicEconomy } from "@workhard/shared";
import "../../public-economy.css";

export function ProjectToolbar({ economy, organisation, userId, fundId, project, title, onTitleChange, pending, reviewing, stale = false, onFundChange, onSubmit, onDiscard }: {
  economy: PublicEconomy; organisation: OrganisationState; userId: string; fundId: string;
  project: BuildProject | undefined; pending: boolean; reviewing: boolean;
  title: string; onTitleChange: (title: string) => void;
  stale?: boolean;
  onFundChange: (id: string) => void; onSubmit: (title: string) => void; onDiscard: () => void;
}) {
  const fund = economy.funds.find((entry) => entry.id === fundId)!;
  const affordable = !project || projectRequiredMoney(project) <= availablePublicMoney(economy, fundId);
  return <section className="project-toolbar" aria-label={reviewing ? "Project review" : "Shared building"}>
    <label>Fund<select value={fundId} disabled={Boolean(project) || pending} onChange={(event) => onFundChange(event.target.value)}>
      {economy.funds.filter((entry) => publicFundMemberIds(entry, organisation, [userId]).includes(userId) || canManageUnit(organisation, userId, entry.unitId))
        .map((entry) => <option key={entry.id} value={entry.id}>{entry.unitId ? organisation.units.find((unit) => unit.id === entry.unitId)?.name : "Workspace"}</option>)}
    </select></label>
    <div className="fund-totals"><span>Balance <strong>{fund.balance}</strong></span><span>Available <strong>{availablePublicMoney(economy, fundId)}</strong></span></div>
    {project && <>
      <div className="project-state"><PencilRuler size={16} />{stale ? "Layout changed · start a new draft" : reviewing ? "Proposal preview" : "Draft · not placed"}</div>
      <div className="project-quote"><strong><Coins size={17} />{projectRequiredMoney(project).toLocaleString()} coins needed</strong>
        <span>Purchases {project.quote.cost} · Refund {project.quote.refund}</span></div>
      {reviewing ? <button className="secondary-button" onClick={onDiscard}>Back to approvals</button> : <form onSubmit={(event) => {
        event.preventDefault(); onSubmit(title.trim() || "Building project");
      }}>
        <label>Project name<input value={title} maxLength={80} onChange={(event) => onTitleChange(event.target.value)} /></label>
        <div className="economy-actions">
          <button className="secondary-button" type="button" disabled={pending} onClick={onDiscard}>Discard</button>
          <button className="primary-button" disabled={pending || !affordable || stale}>{pending ? "Submitting…" : "Propose project"}</button></div>
        {!affordable && <p role="status">Add {projectRequiredMoney(project) - availablePublicMoney(economy, fundId)} coins to this fund or reduce the cost.</p>}
      </form>}
    </>}
  </section>;
}
