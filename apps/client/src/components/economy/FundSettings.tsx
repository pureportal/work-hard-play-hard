import { useState } from "react";
import { availablePublicMoney, type Member, type OrganisationState, type PublicAction, type PublicEconomy, type PublicFund } from "@workhard/shared";

export function FundSettings({ fund, economy, organisation, members, pending, onPropose }: {
  fund: PublicFund; economy: PublicEconomy; organisation: OrganisationState; members: Member[]; pending: boolean;
  onPropose: (title: string, action: Exclude<PublicAction, { kind: "project" }>) => void;
}) {
  const [mode, setMode] = useState(fund.mode);
  const [leaders, setLeaders] = useState(organisation.ceoIds);
  const governanceChanged = mode !== fund.mode || JSON.stringify([...leaders].sort()) !== JSON.stringify([...organisation.ceoIds].sort());
  const unfunded = organisation.units.filter((unit) => !economy.funds.some((entry) => entry.unitId === unit.id));
  return <div className="fund-settings">
    {fund.id === "workspace" && <form onSubmit={(event) => {
      event.preventDefault(); onPropose("Change organisation structure", { kind: "governance", mode, ceoIds: mode === "equal" ? [] : leaders });
    }}><h3>Organisation</h3><fieldset disabled={pending}>
      <label>Structure<select value={mode} onChange={(event) => setMode(event.target.value as PublicFund["mode"])}><option value="equal">Equal team</option><option value="hierarchical">Hierarchical company</option></select></label>
      {mode === "hierarchical" && <details className="fund-settings-details" open={leaders.length === 0 || undefined}><summary>CEOs ({leaders.length})</summary><div className="fund-member-settings">{members.map((member) => <label className="economy-check" key={member.id}>
        <input type="checkbox" checked={leaders.includes(member.id)} onChange={(event) => setLeaders(event.target.checked ? [...leaders, member.id] : leaders.filter((id) => id !== member.id))} />{member.name}
      </label>)}</div></details>}
      <button className="secondary-button" disabled={!governanceChanged || (mode === "hierarchical" && !leaders.length)}>Propose structure</button>
    </fieldset></form>}
    {fund.id === "workspace" && unfunded.length > 0 && <form onSubmit={(event) => {
      event.preventDefault(); const values = new FormData(event.currentTarget);
      onPropose("Create unit fund", { kind: "fund.create", unitId: String(values.get("unit")), mode: fund.mode });
    }}><h3>Unit fund</h3><fieldset disabled={pending}><label>Unit<select name="unit">{unfunded.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <button className="secondary-button">Propose fund</button></fieldset></form>}
    {economy.funds.length > 1 && <form onSubmit={(event) => {
      event.preventDefault(); const values = new FormData(event.currentTarget);
      onPropose("Transfer public money", { kind: "fund.transfer", fromFundId: fund.id, toFundId: String(values.get("to")), amount: Number(values.get("amount")) });
    }}><h3>Move shared money</h3><fieldset disabled={pending}><label>To<select name="to">{economy.funds.filter((entry) => entry.id !== fund.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.unitId ? organisation.units.find((unit) => unit.id === entry.unitId)?.name : "Workspace"}</option>)}</select></label>
      <label>Amount<input name="amount" type="number" min={1} max={availablePublicMoney(economy, fund.id)} step={1} required /></label><button className="secondary-button" disabled={availablePublicMoney(economy, fund.id) < 1}>Propose transfer</button>
    </fieldset></form>}
  </div>;
}
