import { useState } from "react";
import { Archive, Coins } from "lucide-react";
import { availablePublicMoney, canManageUnit, getAssetDefinition, getDefaultAssetVariantId, publicFundMemberIds, type BuildProject, type ClientCommand, type Member, type OrganisationState, type PublicAction, type PublicEconomy } from "@workhard/shared";
import { WorkspaceDialog } from "../WorkspaceDialog";
import { DialogTabs } from "../DialogTabs";
import { AssetShape } from "../AssetShape";
import type { BuildView } from "./BuildEconomyNavigation";
import { DonateCoins } from "./DonateCoins";
import { FundSettings } from "./FundSettings";
import { SpendingProposals } from "./SpendingProposals";
import "../../public-economy.css";

type FundsView = "votes" | "donate" | "inventory" | "activity" | "settings";

export function FundsPanel({ economy, organisation, members, userId, personalBalance, pending, error, initialFundId = "workspace", onCommand, onReview, onPlace, onViewChange, onClose }: {
  economy: PublicEconomy; organisation: OrganisationState; members: Member[]; userId: string; personalBalance: number; pending: boolean; initialFundId?: string;
  error?: string | undefined;
  onCommand: (command: ClientCommand) => void; onReview: (project: BuildProject) => void;
  onPlace: (publicAssetId: string, assetId: string, fundId: string) => void; onViewChange: (view: BuildView) => void; onClose: () => void;
}) {
  const [fundId, setFundId] = useState(initialFundId);
  const [view, setView] = useState<FundsView>("votes");
  const fund = economy.funds.find((entry) => entry.id === fundId)!;
  const fundName = fund.unitId ? organisation.units.find((unit) => unit.id === fund.unitId)!.name : "Workspace";
  const allowance = fund.allowances.find((entry) => entry.userId === userId);
  const canPropose = publicFundMemberIds(fund, organisation, members.map((member) => member.id)).includes(userId) || canManageUnit(organisation, userId, fund.unitId);
  const propose = (title: string, action: Exclude<PublicAction, { kind: "project" }>) => {
    onCommand({ type: "public_economy.propose", requestId: crypto.randomUUID(), title, action });
    setView("votes");
  };
  const proposals = economy.proposals.filter((proposal) => proposal.fundId === fundId).reverse();
  const waiting = proposals.filter((proposal) => ["open", "approved"].includes(proposal.status) && Date.parse(proposal.expiresAt) > Date.now()).length;
  const inventory = economy.inventory.filter((asset) => asset.fundId === fundId);
  const transactions = economy.transactions.filter((entry) => entry.fundId === fundId).reverse().slice(0, 50);
  const transactionNames = { donation: "Donation", purchase: "Building purchase", refund: "Refund", transfer: "Transfer", asset_donation: "Item donated", asset_sale: "Item sold" };
  return <WorkspaceDialog title="Funds & votes" className="funds-dialog" error={error} onBack={() => onViewChange("shared")} onClose={onClose}>
    <DialogTabs label="Funds views" value={view} onChange={setView} tabs={[
      { id: "votes", label: "Votes", count: waiting }, { id: "donate", label: "Donate" }, { id: "inventory", label: "Shared items" },
      { id: "activity", label: "Activity" }, ...(canPropose ? [{ id: "settings" as const, label: "Settings" }] : []),
    ]}>
      <div className="fund-overview">
        <div className="fund-picker"><label>Fund<select value={fundId} onChange={(event) => { setFundId(event.target.value); setView("votes"); }}>{economy.funds.map((entry) => <option key={entry.id} value={entry.id}>
          {entry.unitId ? organisation.units.find((unit) => unit.id === entry.unitId)?.name : "Workspace"}
        </option>)}</select></label><span className="personal-wallet"><Coins size={17} />Your wallet <strong>{personalBalance.toLocaleString()}</strong></span></div>
        <dl className="fund-balances"><div><dt>Shared balance</dt><dd><Coins size={20} />{fund.balance.toLocaleString()}</dd></div>
          <div><dt>For projects</dt><dd>{availablePublicMoney(economy, fundId).toLocaleString()}</dd></div>
          <div><dt>Your allowance</dt><dd>{(allowance?.remaining ?? 0).toLocaleString()}<small>this week</small></dd></div></dl>
      </div>
      {view === "votes" && <SpendingProposals proposals={proposals} economy={economy} organisation={organisation} members={members} userId={userId} pending={pending} onCommand={onCommand} onReview={onReview} />}
      {view === "donate" && <DonateCoins key={fundId} balance={personalBalance} fundName={fundName} pending={pending}
        error={error}
        onDonate={(amount) => onCommand({ type: "economy.donate", requestId: crypto.randomUUID(), fundId, amount })} />}
      {view === "inventory" && <section aria-label="Shared inventory">{inventory.length ? <div className="shared-inventory">{inventory.map((asset) => {
        const definition = getAssetDefinition(asset.assetId)!;
        return <article className="shared-inventory-item" key={asset.id}><AssetShape asset={definition} rotation={0} variantId={getDefaultAssetVariantId(definition)} />
          <strong>{definition.name}</strong>{canPropose && <div className="economy-actions"><button className="primary-button" disabled={pending} onClick={() => onPlace(asset.id, asset.assetId, asset.fundId)}>Place</button>
            <button className="secondary-button" disabled={pending} onClick={() => propose(`Sell ${definition.name}`, { kind: "asset.sell", publicAssetId: asset.id })}>Propose sale · {Math.floor(asset.paid / 3)} coins</button></div>}</article>;
      })}</div> : <div className="dialog-empty"><Archive size={32} /><p>No shared items in storage.</p></div>}</section>}
      {view === "settings" && canPropose && <FundSettings key={`${fund.id}-${economy.revision}`} fund={fund} economy={economy} organisation={organisation} members={members} pending={pending} onPropose={propose} />}
      {view === "activity" && <section aria-label="Transactions">{transactions.length ? <div className="fund-transactions">{transactions.map((entry) => <div className="fund-transaction" key={entry.id}>
        <div><strong>{transactionNames[entry.kind]}</strong><span>{members.find((member) => member.id === entry.userId)?.name} · {new Date(entry.createdAt).toLocaleDateString()}</span></div>
        <strong className={entry.amount > 0 ? "transaction-credit" : ""}>{entry.amount > 0 ? "+" : ""}{entry.amount.toLocaleString()}</strong>
      </div>)}</div> : <div className="dialog-empty"><Coins size={32} /><p>No transactions yet.</p></div>}</section>}
    </DialogTabs>
  </WorkspaceDialog>;
}
