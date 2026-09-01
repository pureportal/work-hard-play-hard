import { Calendar, Clock3, MapPin, Video, X } from "lucide-react";
import type { Area, Floor, Meeting, Member } from "@workhard/shared";
import { IconButton } from "./IconButton";

interface MeetingsPanelProps {
  meetings: Meeting[];
  areas: Area[];
  floors: Floor[];
  members: Member[];
  onJoin: (meeting: Meeting) => void;
  onClose: () => void;
}

export function MeetingsPanel({ meetings, areas, floors, members, onJoin, onClose }: MeetingsPanelProps) {
  const activeMeetings = meetings.filter((meeting) => meeting.status !== "ended")
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  return (
    <aside className="side-panel meetings-panel" aria-label="Meetings">
      <div className="panel-header">
        <div>
          <h2>Meetings</h2>
        </div>
        <IconButton label="Close meetings" icon={X} onClick={onClose} />
      </div>
      <div className="panel-scroll meeting-list">
        {activeMeetings.length === 0 && <div className="empty-symbol" aria-label="No meetings"><Calendar size={24} /></div>}
        {activeMeetings.map((meeting) => {
          const meetingLocation = meeting.location;
          const location = meetingLocation.type === "room"
            ? areas.find((item) => item.id === meetingLocation.areaId)?.name
            : floors.find((item) => item.id === meetingLocation.floorId)?.name;
          return (
            <article className={`meeting-card ${meeting.status}`} key={meeting.id}>
              <div className="meeting-time">
                {meeting.status === "live" ? <span>Live</span> : <time>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(meeting.startsAt))}</time>}
                <span><Clock3 size={13} />{meeting.durationMinutes} min</span>
              </div>
              <h3>{meeting.title}</h3>
              <p><MapPin size={14} />{location}</p>
              <div className="meeting-card-footer">
                <div className="avatar-stack" aria-label={`${meeting.participantIds.length} participants`}>
                  {meeting.participantIds.slice(0, 4).map((userId) => {
                    const member = members.find((item) => item.id === userId);
                    return <span key={userId} style={{ background: member?.color }}>{member?.initials}</span>;
                  })}
                </div>
                <button className={meeting.status === "live" ? "primary-button" : "secondary-button"} onClick={() => onJoin(meeting)}>
                  {meeting.status === "live" ? <Video size={15} /> : <Calendar size={15} />}
                  {meeting.status === "live" ? "Join" : "Start"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
