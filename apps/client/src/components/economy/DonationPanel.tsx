import { useState } from "react";
import type { ClientCommand, OrganisationState, PublicEconomy } from "@workhard/shared";
import { WorkspaceDialog } from "../WorkspaceDialog";
import { BuildEconomyNavigation, type BuildView } from "./BuildEconomyNavigation";
import { DonateCoins } from "./DonateCoins";
import "../../public-economy.css";

export function DonationPanel({ economy, organisation, balance, initialFundId, pending, error, onCommand, onViewChange, onClose }: {
  economy: PublicEconomy; organisation: OrganisationState; balance: number; initialFundId: string;
  pending: boolean; error?: string | undefined;
  onCommand: (command: Extract<ClientCommand, { type: "economy.donate" }>) => void;
  onViewChange: (view: BuildView) => void; onClose: () => void;
}) {
  const [fundId, setFundId] = useState(initialFundId);
  const fund = economy.funds.find((entry) => entry.id === fundId)!;
  const fundName = fund.unitId ? organisation.units.find((unit) => unit.id === fund.unitId)!.name : "Workspace";
  return <WorkspaceDialog title="Donate" className="funds-dialog" error={error} onClose={onClose}>
    <BuildEconomyNavigation view="donate" onChange={onViewChange} />
    <div className="donation-panel-content">
      <label>Fund<select value={fundId} disabled={pending} onChange={(event) => setFundId(event.target.value)}>
        {economy.funds.map((entry) => <option key={entry.id} value={entry.id}>
          {entry.unitId ? organisation.units.find((unit) => unit.id === entry.unitId)!.name : "Workspace"}
        </option>)}
      </select></label>
      <DonateCoins key={fundId} balance={balance} fundName={fundName} pending={pending} error={error}
        onDonate={(amount) => onCommand({ type: "economy.donate", requestId: crypto.randomUUID(), fundId, amount })} />
    </div>
  </WorkspaceDialog>;
}
