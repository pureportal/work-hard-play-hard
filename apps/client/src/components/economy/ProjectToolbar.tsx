import { Coins, PencilRuler } from "lucide-react";
import { availablePublicMoney, projectRequiredMoney, type BuildProject, type PublicEconomy } from "@workhard/shared";
import "../../public-economy.css";

export function ProjectToolbar({ economy, fundId, project, title, onTitleChange, pending, reviewing, stale = false, conflicts = [], overlap = false, editing = false, error, onSubmit, onDiscard }: {
  economy: PublicEconomy; fundId: string;
  project: BuildProject | undefined; pending: boolean; reviewing: boolean;
  title: string; onTitleChange: (title: string) => void;
  stale?: boolean;
  conflicts?: string[]; overlap?: boolean; editing?: boolean; error?: string | undefined;
  onSubmit: (title: string) => void; onDiscard: () => void;
}) {
  const shortfall = project ? Math.max(0, projectRequiredMoney(project) - availablePublicMoney(economy, fundId)) : 0;
  return <section className="project-toolbar" aria-label={reviewing ? "Project review" : "Shared building"}>
    <div className="fund-totals"><span>Available <strong>{availablePublicMoney(economy, fundId).toLocaleString()}</strong></span></div>
    {error && !reviewing && <p role="alert">{error}</p>}
    {project && <>
      {(reviewing || project.quote.structural || editing) && <div className="project-state"><PencilRuler size={16} />{reviewing ? "Proposal" : editing ? "Edit draft" : "Draft"}</div>}
      {conflicts.length > 0 && <p role="status">{overlap ? "Overlaps" : "Conflicts"}: {conflicts.join(", ")}. {reviewing ? "The creator must edit the draft." : "Move or remove these items."}</p>}
      {stale && conflicts.length === 0 && !reviewing && <p role="status">Make a change before submitting.</p>}
      <div className="project-quote"><strong><Coins size={17} />Shared funds · {projectRequiredMoney(project).toLocaleString()} coins</strong>
        <span>Purchases {project.quote.cost} · Refund {project.quote.refund}</span></div>
      {reviewing ? <button className="secondary-button" onClick={onDiscard}>Back to proposals</button> : <form onSubmit={(event) => {
        event.preventDefault(); onSubmit(title.trim() || "Building project");
      }}>
        {project.quote.requiresApproval && <label>Project name<input value={title} maxLength={80} onChange={(event) => onTitleChange(event.target.value)} /></label>}
        <div className="economy-actions">
          <button className="secondary-button" type="button" disabled={pending} onClick={onDiscard}>Discard</button>
          <button className="primary-button" disabled={pending || stale || conflicts.length > 0 || !project.quote.requiresApproval && shortfall > 0}>{pending ? "Submitting…" : !project.quote.requiresApproval ? "Apply changes" : editing ? "Submit revision" : "Propose project"}</button></div>
        {shortfall > 0 && <p role="status">Needs {shortfall.toLocaleString()} more coins to apply.</p>}
      </form>}
    </>}
  </section>;
}
