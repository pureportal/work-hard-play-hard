import { Calendar, Clock3, MapPin, Video } from "lucide-react";
import type { Meeting, Member, Room } from "@workhard/shared";
import { Avatar } from "./Avatar";
import { SurfaceHeader } from "./SurfaceHeader";

interface MeetingsPanelProps {
  meetings: Meeting[];
  rooms: Room[];
  members: Member[];
  openingMeetingId?: string | undefined;
  onJoin: (meeting: Meeting) => void;
  onClose: () => void;
}

export function MeetingsPanel({ meetings, rooms, members, openingMeetingId, onJoin, onClose }: MeetingsPanelProps) {
  const activeMeetings = meetings.filter((meeting) => meeting.status !== "ended")
    .sort((left, right) => (left.startsAt ? Date.parse(left.startsAt) : 0) - (right.startsAt ? Date.parse(right.startsAt) : 0)
      || left.title.localeCompare(right.title));
  return (
    <aside className="side-panel meetings-panel" aria-label="Meetings">
      <SurfaceHeader className="panel-header" title="Meetings" onClose={onClose} />
      <div className="panel-scroll meeting-list">
        {activeMeetings.length === 0 && <p className="panel-empty">No meetings.</p>}
        {activeMeetings.map((meeting) => {
          const meetingLocation = meeting.location;
          const location = rooms.find((item) => item.id === meetingLocation.roomId)?.name;
          return (
            <article className={`meeting-card ${meeting.status}`} key={meeting.id}>
              {(meeting.status === "live" || meeting.startsAt) && <div className="meeting-time">
                {meeting.status === "live" ? <span>Live</span> : meeting.startsAt && <time>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(meeting.startsAt))}</time>}
                {meeting.durationMinutes && <span><Clock3 size={13} />{meeting.durationMinutes} min</span>}
              </div>}
              <h3>{meeting.title}</h3>
              {location && location !== meeting.title && <p><MapPin size={14} />{location}</p>}
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
                  {meeting.status === "scheduled" ? <Calendar size={15} /> : <Video size={15} />}
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
