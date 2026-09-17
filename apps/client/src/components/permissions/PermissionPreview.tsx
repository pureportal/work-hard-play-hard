import { Check, ChevronDown, Eye, X } from "lucide-react";
import { useId } from "react";
import { roomAccessAllows, roomBuildAllows, type GameSettings, type Member, type OrganisationState, type Room } from "@workhard/shared";

interface PermissionPreviewProps {
  room: Room;
  members: Member[];
  settings: GameSettings;
  organisation: OrganisationState;
}

export function PermissionPreview({ room, members, settings, organisation }: PermissionPreviewProps) {
  const previewId = useId();
  return <details className="permission-preview">
    <summary id={previewId}>
      <Eye size={18} aria-hidden="true" />
      <span>Preview</span>
      <ChevronDown className="permission-preview-chevron" size={18} aria-hidden="true" />
    </summary>
    <div className="permission-preview-content">
      <table aria-labelledby={previewId}>
        <thead><tr><th scope="col">Person</th><th scope="col">Access</th><th scope="col">Build</th></tr></thead>
        <tbody>
          {members.map((member) => {
            const access = roomAccessAllows(room, member.id, settings, organisation);
            const build = roomBuildAllows(room, member.id, settings, organisation);
            const personalArea = access && room.personalAreas?.some((area) => area.ownerUserId === member.id);
            return <tr key={member.id}>
            <th scope="row">{member.name}</th>
            <td><PermissionPreviewStatus allowed={access} /></td>
            <td><PermissionPreviewStatus allowed={build || (personalArea ? "area" : false)} /></td>
          </tr>; })}
          {members.length === 0 && <tr><td className="permission-preview-empty" colSpan={3}>No people to preview.</td></tr>}
        </tbody>
      </table>
    </div>
  </details>;
}

function PermissionPreviewStatus({ allowed }: { allowed: boolean | "area" }) {
  const Icon = allowed ? Check : X;
  return <span className={`permission-preview-status${allowed ? " is-allowed" : ""}`}>
    <Icon size={16} strokeWidth={2.5} aria-hidden="true" />
    {allowed === "area" ? "Own area" : allowed ? "Yes" : "No"}
  </span>;
}
