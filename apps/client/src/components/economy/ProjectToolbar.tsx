import { Coins, PencilRuler } from "lucide-react";
import { availablePublicMoney, canManageUnit, projectRequiredMoney, publicFundMemberIds, type BuildProject, type OrganisationState, type PublicEconomy } from "@workhard/shared";
import "../../public-economy.css";

export function ProjectToolbar({ economy, organisation, userId, fundId, project, title, onTitleChange, pending, reviewing, stale = false, conflicts = [], overlap = false, editing = false, error, onFundChange, onSubmit, onDiscard }: {
  economy: PublicEconomy; organisation: OrganisationState; userId: string; fundId: string;
  project: BuildProject | undefined; pending: boolean; reviewing: boolean;
  title: string; onTitleChange: (title: string) => void;
  stale?: boolean;
  conflicts?: string[]; overlap?: boolean; editing?: boolean; error?: string | undefined;
  onFundChange: (id: string) => void; onSubmit: (title: string) => void; onDiscard: () => void;
}) {
  const fund = economy.funds.find((entry) => entry.id === fundId)!;
  const shortfall = project ? Math.max(0, projectRequiredMoney(project) - availablePublicMoney(economy, fundId)) : 0;
  return <section className="project-toolbar" aria-label={reviewing ? "Project review" : "Shared building"}>
    <label>Fund<select value={fundId} disabled={Boolean(project) || pending} onChange={(event) => onFundChange(event.target.value)}>
      {economy.funds.filter((entry) => publicFundMemberIds(entry, organisation, [userId]).includes(userId) || canManageUnit(organisation, userId, entry.unitId))
        .map((entry) => <option key={entry.id} value={entry.id}>{entry.unitId ? organisation.units.find((unit) => unit.id === entry.unitId)?.name : "Workspace"}</option>)}
    </select></label>
    <div className="fund-totals"><span>Balance <strong>{fund.balance}</strong></span><span>Available <strong>{availablePublicMoney(economy, fundId)}</strong></span></div>
    {error && !reviewing && <p role="alert">{error}</p>}
    {project && <>
      <div className="project-state"><PencilRuler size={16} />{reviewing ? "Proposal" : editing ? "Edit draft" : "Draft"}</div>
      {conflicts.length > 0 && <p role="status">{overlap ? "Overlaps" : "Conflicts"}: {conflicts.join(", ")}. {reviewing ? "The creator must edit the draft." : "Move or remove these items."}</p>}
      {stale && conflicts.length === 0 && !reviewing && <p role="status">Make a change before submitting.</p>}
      <div className="project-quote"><strong><Coins size={17} />{projectRequiredMoney(project).toLocaleString()} coins needed</strong>
        <span>Purchases {project.quote.cost} · Refund {project.quote.refund}</span></div>
      {reviewing ? <button className="secondary-button" onClick={onDiscard}>Back to approvals</button> : <form onSubmit={(event) => {
        event.preventDefault(); onSubmit(title.trim() || "Building project");
      }}>
        <label>Project name<input value={title} maxLength={80} onChange={(event) => onTitleChange(event.target.value)} /></label>
        <div className="economy-actions">
          <button className="secondary-button" type="button" disabled={pending} onClick={onDiscard}>Discard</button>
          <button className="primary-button" disabled={pending || stale || conflicts.length > 0}>{pending ? "Submitting…" : editing ? "Submit revision" : "Propose project"}</button></div>
        {shortfall > 0 && <p role="status">Needs {shortfall.toLocaleString()} more coins to apply.</p>}
      </form>}
    </>}
  </section>;
}
