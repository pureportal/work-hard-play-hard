import { useState } from "react";
import { Coins } from "lucide-react";
import { WORKSPACE_FUND_ID, availablePublicMoney, canManageUnit, publicFundMemberIds, type BuildProject, type ClientCommand, type Floor, type FloorLayout, type Member, type OrganisationState, type PublicAction, type PublicEconomy, type SpendingProposal } from "@workhard/shared";
import { WorkspaceDialog } from "../WorkspaceDialog";
import { DialogTabs } from "../DialogTabs";
import { FundSettings } from "./FundSettings";
import { SpendingProposals } from "./SpendingProposals";
import { GameRulesEditor } from "./GameRulesEditor";
import type { GlobalKidnappingSettings, Room } from "@workhard/shared";
import "../../public-economy.css";

type FundsView = "votes" | "activity" | "settings" | "rules";

export function FundsPanel({ economy, organisation, members, userId, personalBalance, pending, error, globalSettings, onOpenRooms, onOpenBuild, onCommand, onReview, onEdit, onClose, rooms, layouts, floors }: {
  economy: PublicEconomy; organisation: OrganisationState; members: Member[]; userId: string; personalBalance: number; pending: boolean;
  error?: string | undefined;
  globalSettings: GlobalKidnappingSettings; onOpenRooms: () => void;
  onOpenBuild?: () => void;
  rooms: Room[]; layouts: FloorLayout[]; floors: Floor[];
  onCommand: (command: ClientCommand) => void; onReview: (project: BuildProject) => void; onEdit: (proposal: SpendingProposal) => void;
  onClose: () => void;
}) {
  const fundId = WORKSPACE_FUND_ID;
  const [view, setView] = useState<FundsView>("votes");
  const fund = economy.funds.find((entry) => entry.id === fundId)!;
  const canPropose = publicFundMemberIds(fund, organisation, members.map((member) => member.id)).includes(userId) || canManageUnit(organisation, userId, fund.unitId);
  const propose = (title: string, action: Exclude<PublicAction, { kind: "project" }>) => {
    onCommand({ type: "public_economy.propose", requestId: crypto.randomUUID(), title, action });
    setView("votes");
  };
  const proposals = [...economy.proposals].reverse();
  const waiting = proposals.filter((proposal) => ["open", "approved"].includes(proposal.status) && Date.parse(proposal.expiresAt) > Date.now()).length;
  const transactions = economy.transactions.filter((entry) => entry.fundId === fundId).reverse();
  const transactionNames = { donation: "Donation", purchase: "Building purchase", refund: "Refund", transfer: "Transfer", asset_donation: "Item donated", asset_sale: "Item sold" };
  return <WorkspaceDialog title="Approvals" className={`funds-dialog${view === "votes" && !proposals.some((proposal) => proposal.status === "open" || proposal.status === "approved") ? " is-empty" : ""}`} error={error} {...(onOpenBuild && { onBack: onOpenBuild })} onClose={onClose}>
    <DialogTabs label="Approvals views" value={view} onChange={setView} tabs={[
      { id: "votes", label: "Proposals", count: waiting },
      { id: "activity", label: "Activity" }, ...(canPropose ? [{ id: "settings" as const, label: "Organisation" }] : []), { id: "rules", label: "Game rules" },
    ]}>
      {view !== "votes" && view !== "rules" && <div className="fund-overview">
        <div className="fund-picker"><span className="personal-wallet"><Coins size={17} />Personal <strong>{personalBalance.toLocaleString()}</strong></span></div>
        <dl className="fund-balances"><div><dt>Shared balance</dt><dd><Coins size={20} />{fund.balance.toLocaleString()}</dd></div>
          <div><dt>For projects</dt><dd>{availablePublicMoney(economy, fundId).toLocaleString()}</dd></div>
          <div><dt>Reserved</dt><dd>{(fund.balance - availablePublicMoney(economy, fundId)).toLocaleString()}</dd></div></dl>
      </div>}
      {view === "rules" && <GameRulesEditor settings={globalSettings} members={members} pending={pending} onOpenRooms={onOpenRooms}
        onPropose={(settings) => propose("Change carrying rules", { kind: "kidnapping.settings", settings })} />}
      {view === "votes" && <SpendingProposals proposals={proposals} economy={economy} organisation={organisation} members={members} rooms={rooms} layouts={layouts} floors={floors} userId={userId} pending={pending} onCommand={onCommand} onReview={onReview} onEdit={onEdit} {...(canPropose && onOpenBuild ? { onOpenBuild } : {})} />}
      {view === "settings" && canPropose && <FundSettings key={`${fund.id}-${economy.revision}`} fund={fund} economy={economy} organisation={organisation} members={members} pending={pending} onPropose={propose} />}
      {view === "activity" && <section aria-label="Transactions">{transactions.length ? <div className="fund-transactions">{transactions.map((entry) => <div className="fund-transaction" key={entry.id}>
        <div><strong>{transactionNames[entry.kind]}</strong><span>{members.find((member) => member.id === entry.userId)?.name} · {new Date(entry.createdAt).toLocaleDateString()}</span></div>
        <strong className={entry.amount > 0 ? "transaction-credit" : ""}>{entry.amount > 0 ? "+" : ""}{entry.amount.toLocaleString()}</strong>
      </div>)}</div> : <div className="dialog-empty"><Coins size={32} /><p>No transactions yet.</p></div>}</section>}
    </DialogTabs>
  </WorkspaceDialog>;
}
