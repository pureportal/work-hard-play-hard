import { useState } from "react";
import { permissionAllows, type Member, type OrganisationState, type RoomPermission } from "@workhard/shared";

interface PermissionEditorProps {
  label: string;
  value: RoomPermission;
  members: Member[];
  organisation: OrganisationState;
  allowDefault?: boolean;
  eligibleMemberIds?: ReadonlySet<string>;
  onChange: (permission: RoomPermission) => void;
}

export function PermissionEditor({ label, value, members, organisation, allowDefault = true, eligibleMemberIds, onChange }: PermissionEditorProps) {
  const [search, setSearch] = useState("");
  const eligibleMembers = eligibleMemberIds ? members.filter((member) => eligibleMemberIds.has(member.id)) : members;
  const visibleMembers = eligibleMembers.filter((member) => member.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const eligibleUnits = organisation.units.filter((unit) => eligibleMembers.some((member) =>
    permissionAllows({ mode: "assigned", assignedPersonIds: [], unitGrants: [{ unitId: unit.id, rank: "members", descendants: true }] }, member.id, organisation)));
  const eligibleCeoIds = organisation.ceoIds.filter((id) => !eligibleMemberIds || eligibleMemberIds.has(id));
  const selectedPeople = eligibleMembers.filter((member) => value.assignedPersonIds.includes(member.id)).length;
  const selectedUnits = eligibleUnits.filter((unit) => value.unitGrants?.some((grant) => grant.unitId === unit.id)).length;
  return <fieldset className="permission-editor">
    <legend>{label}</legend>
    <select aria-label={label} value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value as RoomPermission["mode"] })}>
      {allowDefault && <option value="default">Default</option>}
      <option value="open">{eligibleMemberIds ? "Everyone with access" : "Everyone"}</option>
      <option value="assigned">Selected people and units</option>
      <option value="none">Nobody</option>
    </select>
    {value.mode === "assigned" && <>
      {eligibleCeoIds.length > 0 && <label className="permission-check"><input type="checkbox" checked={Boolean(value.ceos)} onChange={(event) => onChange({ ...value, ceos: event.target.checked })} />CEOs</label>}
      {eligibleUnits.length > 0 && <details><summary>Organisation{selectedUnits > 0 && ` (${selectedUnits})`}</summary>
        {eligibleUnits.map((unit) => {
          const grant = value.unitGrants?.find((candidate) => candidate.unitId === unit.id);
          const parent = organisation.units.find((candidate) => candidate.id === unit.parentId);
          return <div className="permission-unit" key={unit.id}>
            <label><span>{parent ? `${parent.name} / ` : ""}{unit.name}</span>
              <select aria-label={`${unit.name} ${label.toLowerCase()}`} value={grant?.rank ?? "none"} onChange={(event) => {
                const unitGrants = (value.unitGrants ?? []).filter((candidate) => candidate.unitId !== unit.id);
                if (event.target.value !== "none") unitGrants.push({ unitId: unit.id, rank: event.target.value as "members" | "leads", descendants: grant?.descendants ?? true });
                onChange({ ...value, unitGrants });
              }}><option value="none">None</option><option value="members">Members</option><option value="leads">Leads</option></select>
            </label>
            {grant && <label className="permission-check"><input type="checkbox" checked={grant.descendants} onChange={(event) => onChange({ ...value, unitGrants: value.unitGrants!.map((candidate) => candidate.unitId === unit.id ? { ...candidate, descendants: event.target.checked } : candidate) })} />Include subteams</label>}
          </div>;
        })}
      </details>}
      <details><summary>People{selectedPeople > 0 && ` (${selectedPeople})`}</summary><div className="permission-people">
        {eligibleMembers.length > 8 && <input type="search" aria-label={`${label} people`} placeholder="Search people" value={search} onChange={(event) => setSearch(event.target.value)} />}
        {visibleMembers.map((member) => <label className="permission-check" key={member.id}>
          <input type="checkbox" checked={value.assignedPersonIds.includes(member.id)} onChange={(event) => onChange({ ...value,
            assignedPersonIds: event.target.checked ? [...value.assignedPersonIds, member.id] : value.assignedPersonIds.filter((id) => id !== member.id),
          })} />{member.name}
        </label>)}
        {eligibleMembers.length === 0 && <span>No one has access.</span>}
        {eligibleMembers.length > 0 && visibleMembers.length === 0 && <span>No matching people.</span>}
      </div></details>
    </>}
  </fieldset>;
}
