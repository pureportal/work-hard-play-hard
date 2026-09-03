import { Calendar, Clock3, MapPin, Video, X } from "lucide-react";
import type { Floor, Meeting, Member, Room } from "@workhard/shared";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";

interface MeetingsPanelProps {
  meetings: Meeting[];
  rooms: Room[];
  floors: Floor[];
  members: Member[];
  openingMeetingId?: string | undefined;
  onJoin: (meeting: Meeting) => void;
  onClose: () => void;
}

export function MeetingsPanel({ meetings, rooms, floors, members, openingMeetingId, onJoin, onClose }: MeetingsPanelProps) {
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
            ? rooms.find((item) => item.id === meetingLocation.roomId)?.name
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
                    return <Avatar key={userId} member={member} className="stack-avatar" />;
                  })}
                </div>
                <button
                  className={meeting.status === "live" ? "primary-button" : "secondary-button"}
                  disabled={Boolean(openingMeetingId)}
                  onClick={() => onJoin(meeting)}
                >
                  {meeting.status === "live" ? <Video size={15} /> : <Calendar size={15} />}
                  {openingMeetingId === meeting.id ? "Opening…" : meeting.status === "live" ? "Join" : "Start"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
