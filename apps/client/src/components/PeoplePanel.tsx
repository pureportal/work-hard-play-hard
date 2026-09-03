import { Copy, LocateFixed, Mail, Phone, Plus, Search, Send, UserRoundPlus, Waves, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { AssignableMemberPermission, Invitation, Member, MemberRole } from "@workhard/shared";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";

const availabilityLabels: Record<Member["availability"], string> = {
  available: "Available",
  busy: "Busy",
  dnd: "Do not disturb",
  away: "Away",
};

interface PeoplePanelProps {
  members: Member[];
  invitations: Invitation[];
  invitationLinks: Readonly<Record<string, string>>;
  currentUser: Member;
  canManageMembers: boolean;
  onClose: () => void;
  onWave: (userId: string) => void;
  onMessage: (userId: string) => void;
  onCall: (userId: string) => void;
  onLocate: (userId: string) => void;
  onInvite: (
    email: string,
    role: Exclude<MemberRole, "owner">,
    permissions: AssignableMemberPermission[],
  ) => Promise<boolean>;
  onRevokeInvite: (invitationId: string) => Promise<void>;
  onCopyInvite: (invitationId: string) => Promise<void>;
  onAccessChange: (
    userId: string,
    role: Exclude<MemberRole, "owner">,
    permissions: AssignableMemberPermission[],
  ) => Promise<void>;
}

export function PeoplePanel({
  members,
  invitations,
  invitationLinks,
  currentUser,
  canManageMembers,
  onClose,
  onWave,
  onMessage,
  onCall,
  onLocate,
  onInvite,
  onRevokeInvite,
  onCopyInvite,
  onAccessChange,
}: PeoplePanelProps) {
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [invitationRole, setInvitationRole] = useState<Exclude<MemberRole, "owner">>("member");
  const [invitationCanBuild, setInvitationCanBuild] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [updatingAccessIds, setUpdatingAccessIds] = useState<Set<string>>(() => new Set());
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () => members.filter((member) => `${member.name} ${member.title}`.toLowerCase().includes(normalizedQuery)),
    [members, normalizedQuery],
  );
  const online = filtered.filter((member) => member.online);
  const offline = filtered.filter((member) => !member.online);

  const submitInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      const permissions: AssignableMemberPermission[] = invitationRole === "member" && invitationCanBuild ? ["build"] : [];
      if (await onInvite(email, invitationRole, permissions)) {
        setEmail("");
        setInvitationRole("member");
        setInvitationCanBuild(false);
        setInviting(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateAccess = async (
    userId: string,
    role: Exclude<MemberRole, "owner">,
    permissions: AssignableMemberPermission[],
  ) => {
    setUpdatingAccessIds((current) => new Set(current).add(userId));
    try {
      await onAccessChange(userId, role, permissions);
    } finally {
      setUpdatingAccessIds((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }
  };

  return (
    <aside className="side-panel people-panel" aria-label="People">
      <div className="panel-header">
        <div>
          <h2>People</h2>
          <span>{online.length} online</span>
        </div>
        <div className="panel-header-actions">
          {canManageMembers && <IconButton label="Invite member" icon={UserRoundPlus} onClick={() => setInviting(!inviting)} />}
          <IconButton label="Close people" icon={X} onClick={onClose} />
        </div>
      </div>

      {inviting && (
        <form className="invite-form" onSubmit={submitInvite}>
          <label className="invite-email">
            <span>Email</span>
            <input
              type="email"
              value={email}
              autoFocus
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Role</span>
            <select
              value={invitationRole}
              onChange={(event) => {
                const role = event.target.value as Exclude<MemberRole, "owner">;
                setInvitationRole(role);
                if (role !== "member") {
                  setInvitationCanBuild(false);
                }
              }}
            >
              {currentUser.role === "owner" && <option value="admin">Admin</option>}
              <option value="member">Member</option>
              <option value="guest">Guest</option>
            </select>
          </label>
          {invitationRole === "member" && (
            <label className="permission-toggle">
              <input type="checkbox" checked={invitationCanBuild} onChange={(event) => setInvitationCanBuild(event.target.checked)} />
              <span>Build office</span>
            </label>
          )}
          <button type="submit" className="auth-submit" disabled={submitting}>
            <Send size={16} />
            Invite
          </button>
        </form>
      )}

      <label className="panel-search">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Search people</span>
        <input value={query} placeholder="Search" onChange={(event) => setQuery(event.target.value)} />
      </label>

      <div className="panel-scroll">
        <section className="people-section">
          <div className="section-heading">
            <span>Online</span>
            <span>{online.length}</span>
          </div>
          {online.map((member) => (
            <PersonRow
              key={member.id}
              member={member}
              currentUser={currentUser}
              expanded={selectedId === member.id}
              accessUpdating={updatingAccessIds.has(member.id)}
              onToggle={() => setSelectedId(selectedId === member.id ? undefined : member.id)}
              onWave={onWave}
              onMessage={onMessage}
              onCall={onCall}
              onLocate={onLocate}
              onAccessChange={updateAccess}
            />
          ))}
        </section>

        {offline.length > 0 && (
          <section className="people-section offline-section">
            <div className="section-heading">
              <span>Offline</span>
              <span>{offline.length}</span>
            </div>
            {offline.map((member) => (
              <PersonRow
                key={member.id}
                member={member}
                currentUser={currentUser}
                expanded={selectedId === member.id}
                accessUpdating={updatingAccessIds.has(member.id)}
                onToggle={() => setSelectedId(selectedId === member.id ? undefined : member.id)}
                onWave={onWave}
                onMessage={onMessage}
                onCall={onCall}
                onLocate={onLocate}
                onAccessChange={updateAccess}
              />
            ))}
          </section>
        )}

        {canManageMembers && invitations.some((invitation) => invitation.status === "pending") && (
          <section className="people-section pending-section">
            <div className="section-heading"><span>Invited</span></div>
            {invitations.filter((invitation) => invitation.status === "pending").map((invitation) => (
              <div className={`pending-row ${invitationLinks[invitation.id] ? "has-link" : ""}`} key={invitation.id}>
                <span className="pending-icon"><Plus size={15} /></span>
                <span className="pending-copy">
                  <span>{invitation.email}</span>
                  <small>
                    {invitation.role === "admin" ? "Admin" : invitation.role === "guest" ? "Guest" : "Member"}
                    {invitation.permissions.includes("build") ? " · Build" : ""}
                  </small>
                </span>
                {invitationLinks[invitation.id] && (
                  <IconButton label={`Copy invite link for ${invitation.email}`} icon={Copy} onClick={() => void onCopyInvite(invitation.id)} />
                )}
                <IconButton label={`Revoke ${invitation.email}`} icon={X} onClick={() => void onRevokeInvite(invitation.id)} />
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}

interface PersonRowProps {
  member: Member;
  currentUser: Member;
  expanded: boolean;
  accessUpdating: boolean;
  onToggle: () => void;
  onWave: (userId: string) => void;
  onMessage: (userId: string) => void;
  onCall: (userId: string) => void;
  onLocate: (userId: string) => void;
  onAccessChange: (
    userId: string,
    role: Exclude<MemberRole, "owner">,
    permissions: AssignableMemberPermission[],
  ) => Promise<void>;
}

function PersonRow({ member, currentUser, expanded, accessUpdating, onToggle, onWave, onMessage, onCall, onLocate, onAccessChange }: PersonRowProps) {
  const isCurrentUser = member.id === currentUser.id;
  const canManageAccess = !isCurrentUser
    && member.role !== "owner"
    && (currentUser.role === "owner" || (currentUser.role === "admin" && member.role !== "admin"));
  const canBuild = member.permissions.includes("build");
  return (
    <div className={`person-row-wrap ${expanded ? "expanded" : ""}`}>
      <div className="person-row">
        <button className="person-main" aria-label={`${member.name}${isCurrentUser ? " (you)" : ""}`} onClick={onToggle} aria-expanded={expanded}>
          <Avatar member={member} className="person-avatar" decorative={false}>
            <span className={`status-dot ${member.online ? member.availability : "offline"}`} />
            <span className="sr-only">{member.online ? availabilityLabels[member.availability] : "Offline"}</span>
          </Avatar>
          <span className="person-copy">
            <strong>{member.name}{isCurrentUser ? " (you)" : ""}</strong>
            <span>{member.online ? member.activity ?? member.title : member.title}</span>
          </span>
        </button>
        {!isCurrentUser && (
          <div className="person-actions">
            <IconButton label={`Wave to ${member.name}`} icon={Waves} disabled={!member.online || member.availability === "dnd"} onClick={() => onWave(member.id)} />
            <IconButton label={`Message ${member.name}`} icon={Mail} onClick={() => onMessage(member.id)} />
          </div>
        )}
      </div>
      {expanded && (
        <div className="person-detail">
          <span>{member.title}</span>
          <span>{member.email}</span>
          {!isCurrentUser && member.online && (
            <div className="person-detail-actions">
              <button aria-label={`Locate ${member.name}`} onClick={() => onLocate(member.id)}><LocateFixed size={15} />Locate</button>
              <button aria-label={`Call ${member.name}`} disabled={member.availability === "dnd"} onClick={() => onCall(member.id)}><Phone size={15} />Call</button>
            </div>
          )}
          {canManageAccess && (
            <div className="access-controls">
              <label className="role-picker">
                <span>Role</span>
                <select
                  disabled={accessUpdating}
                  value={member.role}
                  onChange={(event) => {
                    const role = event.target.value as Exclude<MemberRole, "owner">;
                    void onAccessChange(
                      member.id,
                      role,
                      role === "member" && member.role === "member" && canBuild ? ["build"] : [],
                    );
                  }}
                >
                  {currentUser.role === "owner" && <option value="admin">Admin</option>}
                  <option value="member">Member</option>
                  <option value="guest">Guest</option>
                </select>
              </label>
              {member.role === "member" && (
                <label className="permission-toggle">
                  <input
                    type="checkbox"
                    checked={canBuild}
                    disabled={accessUpdating}
                    onChange={(event) => void onAccessChange(member.id, "member", event.target.checked ? ["build"] : [])}
                  />
                  <span>Build office</span>
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
