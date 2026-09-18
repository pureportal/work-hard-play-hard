import { getAssetDefinition, projectRequiredMoney, type Member, type OrganisationState, type PublicAction, type PublicEconomy, type Room } from "@workhard/shared";
import { AssetShape } from "../AssetShape";
import { ProposedPersonalSpaces } from "./ProposedPersonalSpaces";

export function ProposalDetails({ action, economy, organisation, members, rooms }: {
  action: PublicAction; economy: PublicEconomy; organisation: OrganisationState; members: Member[];
  rooms: Room[];
}) {
  const fundName = (id: string) => id === "workspace" ? "Workspace" : organisation.units.find((unit) => unit.id === id)?.name;
  const personName = (id: string) => members.find((member) => member.id === id)?.name;
  const room = action.kind === "room.settings" ? rooms.find((entry) => entry.id === action.roomId) : undefined;
  if (action.kind === "record") return <p>{action.summary}</p>;
  if (action.kind === "project") {
    const { quote } = action.project;
    return <div className="proposal-project-details">{(quote.cost > 0 || quote.refund > 0) && <dl className="proposal-costs"><div><dt>Public purchases</dt><dd>{quote.cost}</dd></div>
      <div><dt>Refund</dt><dd>{quote.refund}</dd></div><div><dt>Needed</dt><dd>{projectRequiredMoney(action.project)}</dd></div></dl>}
      {(quote.structural || action.project.spawn) && <p>{[quote.structural ? "Construction changes" : "", action.project.spawn ? "Move arrival point" : ""].filter(Boolean).join(" · ")}</p>}
      {quote.assetChanges.length > 0 && <ul className="proposal-assets">{quote.assetChanges.map(({ object, change }) => {
        const asset = getAssetDefinition(object.assetId)!;
        return <li key={object.id}><AssetShape asset={asset} rotation={object.rotation} variantId={object.variantId} />
          <span><strong>{asset.name}</strong>{asset.kind === "portal" && change === "place" ? <small>Creates Floor {object.label}. Cannot be removed.</small> : <small>{change === "place" ? "Place" : change === "move" ? "Move" : "Remove"} · {object.ownerUserId ? `Personal · ${personName(object.ownerUserId)}` : "Shared"}</small>}</span>
        </li>;
      })}</ul>}
    </div>;
  }
  if (action.kind === "kidnapping.settings") return <div><p>Carrying: {action.settings.enabled ? "On" : "Off"}</p>
    {action.settings.enabled && <p>{({ allow_all: "Everyone", allow_none: "No one", allow_list: "Only", block_list: "Everyone except" })[action.settings.targetPolicy.mode]}
      {action.settings.targetPolicy.userIds.length > 0 ? ` ${action.settings.targetPolicy.userIds.map(personName).join(", ")}` : ""}</p>}</div>;
  if (action.kind === "fund.transfer") return <p>{action.amount} coins: {fundName(action.fromFundId)} → {fundName(action.toFundId)}</p>;
  if (action.kind === "fund.create") return <p>Create a fund for {fundName(action.unitId)}</p>;
  if (action.kind === "governance") return <p>{action.mode === "equal" ? "Equal team" : `Hierarchical company · CEOs: ${action.ceoIds.map(personName).join(", ")}`}</p>;
  if (action.kind === "asset.sell") {
    const asset = economy.inventory.find((entry) => entry.id === action.publicAssetId);
    return <p>Sell {asset ? getAssetDefinition(asset.assetId)?.name : "shared asset"}{asset ? ` for ${Math.floor(asset.paid / 3)} coins` : ""}</p>;
  }
  if (action.kind === "organisation") {
    const edit = action.edit;
    const change = { "unit.create": "Create unit", "unit.update": "Edit unit", "unit.move": "Move unit", "unit.delete": "Delete unit", "member.move": "Move member", "ceo.promote": "Appoint CEO", "ceo.remove": "Remove CEO" }[edit.type];
    return <dl><dt>Change</dt><dd>{change}</dd>
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
    {action.kind === "room.settings" && <p>Room owner: {action.settings.ownerUserId ? personName(action.settings.ownerUserId) : "Shared"}</p>}
    {action.kind === "room.settings" && room && <ProposedPersonalSpaces room={room} settings={action.settings} members={members} />}
    {permissions.map(({ label, value }) => <p key={label}>{label}: {{ default: "Room defaults", open: "Everyone", none: "Nobody", assigned: "Selected members" }[value?.mode ?? "default"]}
      {value?.assignedPersonIds.length ? ` · ${value.assignedPersonIds.map(personName).join(", ")}` : ""}
      {value?.ceos ? " · CEOs" : ""}
      {value?.unitGrants?.map((grant) => ` · ${fundName(grant.unitId)} (${grant.rank}${grant.descendants ? ", including subteams" : ""})`).join("")}
    </p>)}
    {action.kind === "room.settings" && <p>Knocking: {action.settings.access.knockable ? "On" : "Off"}</p>}
    {action.kind === "room.settings" && <p>Meeting room: {action.settings.meetingRoom ? "On" : "Off"}</p>}
  </div>;
}
