import { DoorOpen, X } from "lucide-react";
import { useState } from "react";
import type { Area, AreaKnock, Member } from "@workhard/shared";

interface AreaKnockNoticeProps {
  knock: AreaKnock;
  area: Area;
  requester: Member;
  onRespond: (knockId: string, accept: boolean) => boolean;
}

export function AreaKnockNotice({ knock, area, requester, onRespond }: AreaKnockNoticeProps) {
  const [responding, setResponding] = useState(false);

  const respond = (accept: boolean) => {
    if (!responding && onRespond(knock.id, accept)) {
      setResponding(true);
    }
  };

  return (
    <div className="knock-pill" role="status" aria-atomic="true" aria-busy={responding}>
      <span className="person-avatar" style={{ background: requester.color }}>{requester.initials}</span>
      <div className="knock-copy">
        <strong>{requester.name}</strong>
        <span>Knocking at {area.name}</span>
      </div>
      <div className="knock-actions">
        <button
          className="accept-knock"
          aria-label={`Let ${requester.name} into ${area.name}`}
          disabled={responding}
          onClick={() => respond(true)}
        >
          <DoorOpen size={17} />
        </button>
        <button
          aria-label={`Decline ${requester.name}'s request for ${area.name}`}
          disabled={responding}
          onClick={() => respond(false)}
        >
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
