import { useState } from "react";
import { type Member, type OrganisationState, type PublicAction, type PublicEconomy, type PublicFund } from "@workhard/shared";

export function FundSettings({ fund, organisation, members, pending, onPropose }: {
  fund: PublicFund; economy: PublicEconomy; organisation: OrganisationState; members: Member[]; pending: boolean;
  onPropose: (title: string, action: Exclude<PublicAction, { kind: "project" }>) => void;
}) {
  const [mode, setMode] = useState(fund.mode);
  const [leaders, setLeaders] = useState(organisation.ceoIds);
  const governanceChanged = mode !== fund.mode || JSON.stringify([...leaders].sort()) !== JSON.stringify([...organisation.ceoIds].sort());
  return <div className="fund-settings">
    <form onSubmit={(event) => {
      event.preventDefault(); onPropose("Change organisation structure", { kind: "governance", mode, ceoIds: mode === "equal" ? [] : leaders });
    }}><fieldset disabled={pending}>
      <label>Structure<select value={mode} onChange={(event) => setMode(event.target.value as PublicFund["mode"])}><option value="equal">Equal team</option><option value="hierarchical">Hierarchical company</option></select></label>
      {mode === "hierarchical" && <details className="fund-settings-details" open={leaders.length === 0 || undefined}><summary>CEOs ({leaders.length})</summary><div className="fund-member-settings">{members.map((member) => <label className="economy-check" key={member.id}>
        <input type="checkbox" checked={leaders.includes(member.id)} onChange={(event) => setLeaders(event.target.checked ? [...leaders, member.id] : leaders.filter((id) => id !== member.id))} />{member.name}
      </label>)}</div></details>}
      <button className="secondary-button" disabled={!governanceChanged || (mode === "hierarchical" && !leaders.length)}>Propose structure</button>
    </fieldset></form>
  </div>;
}
