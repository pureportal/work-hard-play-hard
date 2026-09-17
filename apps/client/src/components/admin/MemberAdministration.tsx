import { useState } from "react";
import { Copy, Search, UserRoundPlus, X } from "lucide-react";
import type { MemberRole } from "@workhard/shared";
import type { ServerAdminDialogProps } from "./ServerAdminDialog";
import { Avatar } from "../Avatar";
import { IconButton } from "../IconButton";

export function MemberAdministration({ members, currentUser, invitations, invitationLinks, onAccessChange, onInvite, onCopyInvite, onRevokeInvite }: ServerAdminDialogProps) {
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<MemberRole, "owner">>("member");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const update = async (id: string, operation: () => Promise<unknown>) => {
    setBusy(id); setError(undefined);
    try { await operation(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Changes could not be saved. Try again."); }
    finally { setBusy(undefined); }
  };
  const choices = <>{currentUser.role === "owner" && <option value="admin">Server administrator</option>}<option value="member">Member</option><option value="guest">Guest</option></>;
  return <div className="member-administration">
    <div className="admin-member-toolbar"><label className="panel-search"><Search size={16} /><input aria-label="Search users" placeholder="Search users" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <button className="secondary-button" aria-expanded={inviting} onClick={() => setInviting(!inviting)}><UserRoundPlus size={16} />Invite</button></div>
    {inviting && <form className="admin-invite-form" onSubmit={(event) => {
      event.preventDefault();
      void update("invite", async () => { if (await onInvite(email, role)) { setEmail(""); setInviting(false); } });
    }}><label>Email<input type="email" value={email} required autoFocus onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>{choices}</select></label>
      <button className="primary-button" disabled={Boolean(busy)}>Send invite</button></form>}
    {error && <p role="alert">{error}</p>}
    <div className="admin-user-list">{members.filter((member) => `${member.name} ${member.email}`.toLowerCase().includes(query.trim().toLowerCase())).map((member) => {
      const editable = member.id !== currentUser.id && member.role !== "owner" && (currentUser.role === "owner" || member.role !== "admin");
      return <div className="admin-user-row" key={member.id}><Avatar member={member} className="avatar" /><div className="admin-user-copy"><strong>{member.name}</strong><span>{member.email}</span></div>
        {editable ? <select aria-label={`${member.name} server role`} disabled={Boolean(busy)} value={member.role}
          onChange={(event) => { const value = event.target.value as typeof role; void update(member.id, () => onAccessChange(member.id, value)); }}>{choices}</select>
          : <span className="admin-role-label">{member.role === "owner" ? "Server owner" : member.role === "admin" ? "Server administrator" : member.role === "guest" ? "Guest" : "Member"}</span>}
      </div>;
    })}</div>
    {invitations.some((invitation) => invitation.status === "pending") && <section className="admin-invitations"><h3>Invitations</h3>
      {invitations.filter((invitation) => invitation.status === "pending").map((invitation) => <div className="admin-user-row" key={invitation.id}>
        <span className="admin-user-copy">{invitation.email}</span>
        {invitationLinks[invitation.id] && <IconButton label={`Copy invite for ${invitation.email}`} icon={Copy} onClick={() => void update(invitation.id, () => onCopyInvite(invitation.id))} />}
        <IconButton label={`Revoke ${invitation.email}`} icon={X} disabled={Boolean(busy)} onClick={() => void update(invitation.id, () => onRevokeInvite(invitation.id))} />
      </div>)}
    </section>}
  </div>;
}
