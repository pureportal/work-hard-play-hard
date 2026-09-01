import { LocateFixed, Mail, Phone, Plus, Search, Send, UserRoundPlus, Waves, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { Invitation, Member, MemberRole } from "@workhard/shared";
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
  currentUser: Member;
  canEdit: boolean;
  onClose: () => void;
  onWave: (userId: string) => void;
  onMessage: (userId: string) => void;
  onCall: (userId: string) => void;
  onLocate: (userId: string) => void;
  onInvite: (email: string) => Promise<boolean>;
  onRevokeInvite: (invitationId: string) => Promise<void>;
  onRoleChange: (userId: string, role: Exclude<MemberRole, "owner">) => Promise<void>;
}

export function PeoplePanel({
  members,
  invitations,
  currentUser,
  canEdit,
  onClose,
  onWave,
  onMessage,
  onCall,
  onLocate,
  onInvite,
  onRevokeInvite,
  onRoleChange,
}: PeoplePanelProps) {
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [updatingRoleIds, setUpdatingRoleIds] = useState<Set<string>>(() => new Set());
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
      if (await onInvite(email)) {
        setEmail("");
        setInviting(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateRole = async (userId: string, role: Exclude<MemberRole, "owner">) => {
    setUpdatingRoleIds((current) => new Set(current).add(userId));
    try {
      await onRoleChange(userId, role);
    } finally {
      setUpdatingRoleIds((current) => {
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
          {canEdit && <IconButton label="Invite member" icon={UserRoundPlus} onClick={() => setInviting(!inviting)} />}
          <IconButton label="Close people" icon={X} onClick={onClose} />
        </div>
      </div>

      {inviting && (
        <form className="inline-form" onSubmit={submitInvite}>
          <label>
            <span className="sr-only">Email</span>
            <Mail size={16} aria-hidden="true" />
            <input
              type="email"
              value={email}
              autoFocus
              required
              placeholder="name@company.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button className="primary-icon-button" aria-label="Send invitation" disabled={submitting}>
            <Send size={17} />
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
              canEdit={canEdit}
              roleUpdating={updatingRoleIds.has(member.id)}
              onToggle={() => setSelectedId(selectedId === member.id ? undefined : member.id)}
              onWave={onWave}
              onMessage={onMessage}
              onCall={onCall}
              onLocate={onLocate}
              onRoleChange={updateRole}
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
                canEdit={canEdit}
                roleUpdating={updatingRoleIds.has(member.id)}
                onToggle={() => setSelectedId(selectedId === member.id ? undefined : member.id)}
                onWave={onWave}
                onMessage={onMessage}
                onCall={onCall}
                onLocate={onLocate}
                onRoleChange={updateRole}
              />
            ))}
          </section>
        )}

        {canEdit && invitations.some((invitation) => invitation.status === "pending") && (
          <section className="people-section pending-section">
            <div className="section-heading"><span>Invited</span></div>
            {invitations.filter((invitation) => invitation.status === "pending").map((invitation) => (
              <div className="pending-row" key={invitation.id}>
                <span className="pending-icon"><Plus size={15} /></span>
                <span>{invitation.email}</span>
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
  canEdit: boolean;
  roleUpdating: boolean;
  onToggle: () => void;
  onWave: (userId: string) => void;
  onMessage: (userId: string) => void;
  onCall: (userId: string) => void;
  onLocate: (userId: string) => void;
  onRoleChange: (userId: string, role: Exclude<MemberRole, "owner">) => Promise<void>;
}

function PersonRow({ member, currentUser, expanded, canEdit, roleUpdating, onToggle, onWave, onMessage, onCall, onLocate, onRoleChange }: PersonRowProps) {
  const isCurrentUser = member.id === currentUser.id;
  return (
    <div className={`person-row-wrap ${expanded ? "expanded" : ""}`}>
      <div className="person-row">
        <button className="person-main" aria-label={`${member.name}${isCurrentUser ? " (you)" : ""}`} onClick={onToggle} aria-expanded={expanded}>
          <span className="person-avatar" style={{ background: member.color }}>
            {member.initials}
            <span className={`status-dot ${member.online ? member.availability : "offline"}`} />
            <span className="sr-only">{member.online ? availabilityLabels[member.availability] : "Offline"}</span>
          </span>
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
          {canEdit && !isCurrentUser && member.role !== "owner" && (
            <label className="role-picker">
              <span>Role</span>
              <select disabled={roleUpdating} value={member.role} onChange={(event) => void onRoleChange(member.id, event.target.value as Exclude<MemberRole, "owner">)}>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="guest">Guest</option>
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
