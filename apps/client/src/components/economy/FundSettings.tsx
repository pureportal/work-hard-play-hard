import { useState } from "react";
import { availablePublicMoney, publicFundMemberIds, type Member, type OrganisationState, type PublicAction, type PublicEconomy, type PublicFund } from "@workhard/shared";

export function FundSettings({ fund, economy, organisation, members, pending, onPropose }: {
  fund: PublicFund; economy: PublicEconomy; organisation: OrganisationState; members: Member[]; pending: boolean;
  onPropose: (title: string, action: Exclude<PublicAction, { kind: "project" }>) => void;
}) {
  const [mode, setMode] = useState(fund.mode);
  const [policyMode, setPolicyMode] = useState(fund.mode);
  const [leaders, setLeaders] = useState(organisation.ceoIds);
  const [limits, setLimits] = useState(fund.spendingLimits);
  const [allowance, setAllowance] = useState(String(fund.weeklyAllowance));
  const policyChanged = policyMode !== fund.mode || Number(allowance) !== fund.weeklyAllowance || JSON.stringify(limits) !== JSON.stringify(fund.spendingLimits);
  const governanceChanged = mode !== fund.mode || JSON.stringify([...leaders].sort()) !== JSON.stringify([...organisation.ceoIds].sort());
  const fundMembers = publicFundMemberIds(fund, organisation, members.map((member) => member.id));
  const unfunded = organisation.units.filter((unit) => !economy.funds.some((entry) => entry.unitId === unit.id));
  return <div className="fund-settings">
    <form onSubmit={(event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      onPropose("Change spending rules", { kind: "fund.policy", fundId: fund.id, mode: policyMode,
        weeklyAllowance: Number(values.get("allowance")), spendingLimits: policyMode === "hierarchical" ? limits : [] });
    }}><h3>Weekly spending</h3><fieldset disabled={pending}>
      {fund.unitId && <label>Decisions<select name="mode" value={policyMode} onChange={(event) => setPolicyMode(event.target.value as PublicFund["mode"])}><option value="equal">Team vote</option><option value="hierarchical">Management approval</option></select></label>}
      <label>Weekly allowance<input name="allowance" type="number" min={0} max={2_000_000_000} step={1} value={allowance} onChange={(event) => setAllowance(event.target.value)} required /></label>
      {policyMode === "hierarchical" && <details className="fund-settings-details"><summary>Individual limits{limits.length > 0 && ` (${limits.length})`}</summary><div className="fund-member-settings">{members.filter((member) => fundMembers.includes(member.id)).map((member) => <label key={member.id}>{member.name}
        <input aria-label={`${member.name} weekly limit`} type="number" min={0} max={2_000_000_000} step={1}
          value={limits.find((limit) => limit.userId === member.id)?.amount ?? allowance}
          onChange={(event) => setLimits([...limits.filter((limit) => limit.userId !== member.id), { userId: member.id, amount: Number(event.target.value) }])} />
      </label>)}</div></details>}
      <button className="secondary-button" disabled={!policyChanged}>Propose rules</button>
    </fieldset></form>
    {fund.id === "workspace" && <form onSubmit={(event) => {
      event.preventDefault(); onPropose("Change decision-making", { kind: "governance", mode, ceoIds: mode === "equal" ? [] : leaders });
    }}><h3>Decisions</h3><fieldset disabled={pending}>
      <label>Decision-making<select value={mode} onChange={(event) => setMode(event.target.value as PublicFund["mode"])}><option value="equal">Equal team</option><option value="hierarchical">Hierarchical company</option></select></label>
      {mode === "hierarchical" && <details className="fund-settings-details" open={leaders.length === 0 || undefined}><summary>CEOs ({leaders.length})</summary><div className="fund-member-settings">{members.map((member) => <label className="economy-check" key={member.id}>
        <input type="checkbox" checked={leaders.includes(member.id)} onChange={(event) => setLeaders(event.target.checked ? [...leaders, member.id] : leaders.filter((id) => id !== member.id))} />{member.name}
      </label>)}</div></details>}
      <button className="secondary-button" disabled={!governanceChanged || (mode === "hierarchical" && !leaders.length)}>Propose decision-making</button>
    </fieldset></form>}
    {fund.id === "workspace" && unfunded.length > 0 && <form onSubmit={(event) => {
      event.preventDefault(); const values = new FormData(event.currentTarget);
      onPropose("Create unit fund", { kind: "fund.create", unitId: String(values.get("unit")), mode: values.get("mode") as PublicFund["mode"], weeklyAllowance: Number(values.get("allowance")) });
    }}><h3>Unit fund</h3><fieldset disabled={pending}><label>Unit<select name="unit">{unfunded.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <label>Decisions<select name="mode"><option value="equal">Team vote</option><option value="hierarchical">Management approval</option></select></label>
      <label>Weekly allowance<input name="allowance" type="number" min={0} max={2_000_000_000} step={1} defaultValue={50} required /></label>
      <button className="secondary-button">Propose fund</button></fieldset></form>}
    {economy.funds.length > 1 && <form onSubmit={(event) => {
      event.preventDefault(); const values = new FormData(event.currentTarget);
      onPropose("Transfer public money", { kind: "fund.transfer", fromFundId: fund.id, toFundId: String(values.get("to")), amount: Number(values.get("amount")) });
    }}><h3>Move shared money</h3><fieldset disabled={pending}><label>To<select name="to">{economy.funds.filter((entry) => entry.id !== fund.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.unitId ? organisation.units.find((unit) => unit.id === entry.unitId)?.name : "Workspace"}</option>)}</select></label>
      <label>Amount<input name="amount" type="number" min={1} max={availablePublicMoney(economy, fund.id)} step={1} required /></label><button className="secondary-button" disabled={availablePublicMoney(economy, fund.id) < 1}>Propose transfer</button>
    </fieldset></form>}
  </div>;
}
