import { getAssetDefinition, type Member, type OrganisationState, type PublicAction, type PublicEconomy } from "@workhard/shared";

export function ProposalDetails({ action, economy, organisation, members }: {
  action: PublicAction; economy: PublicEconomy; organisation: OrganisationState; members: Member[];
}) {
  const fundName = (id: string) => id === "workspace" ? "Workspace" : organisation.units.find((unit) => unit.id === id)?.name;
  const personName = (id: string) => members.find((member) => member.id === id)?.name;
  if (action.kind === "project") return <p>Cost {action.project.quote.cost} coins{action.project.quote.refund > 0 ? ` · Refund ${action.project.quote.refund} coins` : ""}</p>;
  if (action.kind === "fund.transfer") return <p>{action.amount} coins: {fundName(action.fromFundId)} → {fundName(action.toFundId)}</p>;
  if (action.kind === "fund.create") return <p>{fundName(action.unitId)} · {action.mode === "equal" ? "Team vote" : "Management approval"} · Weekly allowance {action.weeklyAllowance}</p>;
  if (action.kind === "fund.policy") return <div><p>{fundName(action.fundId)} · {action.mode === "equal" ? "Team vote" : "Management approval"} · Weekly allowance {action.weeklyAllowance}</p>
    {action.mode === "hierarchical" && action.spendingLimits.map((limit) => <p key={limit.userId}>{personName(limit.userId)}: {limit.amount} per week</p>)}</div>;
  if (action.kind === "governance") return <p>{action.mode === "equal" ? "Equal team" : `Hierarchical company · CEOs: ${action.ceoIds.map(personName).join(", ")}`}</p>;
  if (action.kind === "asset.sell") {
    const asset = economy.inventory.find((entry) => entry.id === action.publicAssetId);
    return <p>Sell {asset ? getAssetDefinition(asset.assetId)?.name : "shared asset"}{asset ? ` for ${Math.floor(asset.paid / 3)} coins` : ""}</p>;
  }
  if (action.kind === "organisation") {
    const edit = action.edit;
    return <dl><dt>Change</dt><dd>{edit.type.replaceAll(".", " ").replaceAll("_", " ")}</dd>
      {"name" in edit && <><dt>Name</dt><dd>{edit.name}</dd></>}
      {"userId" in edit && <><dt>Person</dt><dd>{personName(edit.userId)}</dd></>}
      {"unitId" in edit && <><dt>Unit</dt><dd>{edit.unitId ? fundName(edit.unitId) : "Unassigned"}</dd></>}
      {"parentId" in edit && <><dt>Parent</dt><dd>{edit.parentId ? fundName(edit.parentId) : "Organisation"}</dd></>}
      {"rank" in edit && <><dt>Rank</dt><dd>{edit.rank}</dd></>}
      {"kind" in edit && <><dt>Type</dt><dd>{edit.kind}</dd></>}
    </dl>;
  }
  const permissions = action.kind === "game.settings"
    ? [{ label: "Access", value: action.settings.roomAccess }, { label: "Build", value: action.settings.roomBuild }]
    : [{ label: "Access", value: action.settings.access }, { label: "Build", value: action.settings.build }];
  return <div>{action.kind === "room.settings" && <p>{action.settings.name}{action.settings.organisationUnitId ? ` · ${fundName(action.settings.organisationUnitId)}` : ""}</p>}
    {permissions.map(({ label, value }) => <p key={label}>{label}: {value?.mode ?? "default"}
      {value?.assignedPersonIds.length ? ` · ${value.assignedPersonIds.map(personName).join(", ")}` : ""}
      {value?.ceos ? " · CEOs" : ""}
      {value?.unitGrants?.map((grant) => ` · ${fundName(grant.unitId)} (${grant.rank}${grant.descendants ? ", including subteams" : ""})`).join("")}
    </p>)}
    {action.kind === "room.settings" && <p>Knocking: {action.settings.access.knockable ? "On" : "Off"}</p>}
  </div>;
}
