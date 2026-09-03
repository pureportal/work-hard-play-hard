import { DoorOpen, X } from "lucide-react";
import { useState } from "react";
import type { Member, Room, RoomKnock } from "@workhard/shared";
import { Avatar } from "./Avatar";

interface RoomKnockNoticeProps {
  knock: RoomKnock;
  room: Room;
  requester: Member;
  onRespond: (knockId: string, accept: boolean) => boolean;
}

export function RoomKnockNotice({ knock, room, requester, onRespond }: RoomKnockNoticeProps) {
  const [responding, setResponding] = useState(false);

  const respond = (accept: boolean) => {
    if (!responding && onRespond(knock.id, accept)) {
      setResponding(true);
    }
  };

  return (
    <div className="knock-pill" role="status" aria-atomic="true" aria-busy={responding}>
      <Avatar member={requester} className="person-avatar" />
      <div className="knock-copy">
        <strong>{requester.name}</strong>
        <span>Knocking at {room.name}</span>
      </div>
      <div className="knock-actions">
        <button
          className="accept-knock"
          aria-label={`Let ${requester.name} into ${room.name}`}
          disabled={responding}
          onClick={() => respond(true)}
        >
          <DoorOpen size={17} />
        </button>
        <button
          aria-label={`Decline ${requester.name}'s request for ${room.name}`}
          disabled={responding}
          onClick={() => respond(false)}
        >
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
