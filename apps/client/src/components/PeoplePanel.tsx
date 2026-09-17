import { LocateFixed, Mail, Phone, Search, Waves } from "lucide-react";
import { useMemo, useState } from "react";
import type { Member } from "@workhard/shared";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";
import { SurfaceHeader } from "./SurfaceHeader";

const availabilityLabels: Record<Member["availability"], string> = {
  available: "Available",
  busy: "Busy",
  dnd: "Do not disturb",
  away: "Away",
};

interface PeoplePanelProps {
  members: Member[];
  currentUser: Member;
  onClose: () => void;
  onWave: (userId: string) => void;
  onMessage: (userId: string) => void;
  onCall: (userId: string) => void;
  onLocate: (userId: string) => void;

}

export function PeoplePanel({
  members,
  currentUser,
  onClose,
  onWave,
  onMessage,
  onCall,
  onLocate,
}: PeoplePanelProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () => members.filter((member) => `${member.name} ${member.title}`.toLowerCase().includes(normalizedQuery)),
    [members, normalizedQuery],
  );
  const online = filtered.filter((member) => member.online);
  const offline = filtered.filter((member) => !member.online);

  return (
    <aside className="side-panel people-panel" aria-label="People">
      <SurfaceHeader className="panel-header" title="People" onClose={onClose} />

      <div className="panel-scroll people-panel-content">
        <label className="panel-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search people</span>
          <input value={query} placeholder="Search" onChange={(event) => setQuery(event.target.value)} />
        </label>

        {filtered.length === 0 && <p className="panel-empty" role="status">No people found.</p>}
        {online.length > 0 && (
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
                onToggle={() => setSelectedId(selectedId === member.id ? undefined : member.id)}
                onWave={onWave}
                onMessage={onMessage}
                onCall={onCall}
                onLocate={onLocate}
              />
            ))}
          </section>
        )}

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
                onToggle={() => setSelectedId(selectedId === member.id ? undefined : member.id)}
                onWave={onWave}
                onMessage={onMessage}
                onCall={onCall}
                onLocate={onLocate}
              />
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
  onToggle: () => void;
  onWave: (userId: string) => void;
  onMessage: (userId: string) => void;
  onCall: (userId: string) => void;
  onLocate: (userId: string) => void;

}

function PersonRow({ member, currentUser, expanded, onToggle, onWave, onMessage, onCall, onLocate }: PersonRowProps) {
  const isCurrentUser = member.id === currentUser.id;
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
              <button aria-label={`Call ${member.name}`} onClick={() => onCall(member.id)}><Phone size={15} />Call</button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
