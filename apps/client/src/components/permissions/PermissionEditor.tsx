import type { Member, OrganisationState, RoomPermission } from "@workhard/shared";

interface PermissionEditorProps {
  label: string;
  value: RoomPermission;
  members: Member[];
  organisation: OrganisationState;
  allowDefault?: boolean;
  onChange: (permission: RoomPermission) => void;
}

export function PermissionEditor({ label, value, members, organisation, allowDefault = true, onChange }: PermissionEditorProps) {
  return <fieldset className="permission-editor">
    <legend>{label}</legend>
    <select aria-label={label} value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value as RoomPermission["mode"] })}>
      {allowDefault && <option value="default">Default</option>}
      <option value="open">Everyone</option>
      <option value="assigned">Selected people and units</option>
      <option value="none">Nobody</option>
    </select>
    {value.mode === "assigned" && <>
      <label className="permission-check"><input type="checkbox" checked={Boolean(value.ceos)} onChange={(event) => onChange({ ...value, ceos: event.target.checked })} />CEOs</label>
      {organisation.units.length > 0 && <details><summary>Organisation{Boolean(value.unitGrants?.length) && ` (${value.unitGrants!.length})`}</summary>
        {organisation.units.map((unit) => {
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
      <details><summary>People{value.assignedPersonIds.length > 0 && ` (${value.assignedPersonIds.length})`}</summary><div className="permission-people">
        {members.map((member) => <label className="permission-check" key={member.id}>
          <input type="checkbox" checked={value.assignedPersonIds.includes(member.id)} onChange={(event) => onChange({ ...value,
            assignedPersonIds: event.target.checked ? [...value.assignedPersonIds, member.id] : value.assignedPersonIds.filter((id) => id !== member.id),
          })} />{member.name}
        </label>)}
      </div></details>
    </>}
  </fieldset>;
}
