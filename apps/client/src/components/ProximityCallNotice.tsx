import { Users } from "lucide-react";
import type { Member } from "@workhard/shared";
import { Avatar } from "./Avatar";

interface ProximityCallNoticeProps {
  participants: Member[];
}

export function ProximityCallNotice({ participants }: ProximityCallNoticeProps) {
  const names = participants.map((participant) => participant.name.split(" ")[0] ?? participant.name).join(", ");
  return (
    <div className="call-pill proximity-call" role="status" aria-label={`Nearby with ${names}`}>
      <span className="proximity-call-icon"><Users size={17} /></span>
      <div className="call-copy">
        <strong>Nearby</strong>
        <span>{names}</span>
      </div>
      <div className="proximity-call-avatars" aria-hidden="true">
        {participants.slice(0, 3).map((participant) => (
          <Avatar key={participant.id} member={participant} className="person-avatar" />
        ))}
        {participants.length > 3 && <span className="person-avatar proximity-call-count">+{participants.length - 3}</span>}
      </div>
    </div>
  );
}
