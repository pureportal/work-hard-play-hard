import { Phone, PhoneOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { CallDirection, CallState, Member } from "@workhard/shared";
import { Avatar } from "./Avatar";

export interface ActiveCall {
  callId: string;
  peerUserId: string;
  direction: CallDirection;
  state: CallState;
}

interface CallNoticeProps {
  call: ActiveCall;
  peer: Member | undefined;
  onRespond: (callId: string, accept: boolean) => boolean;
  onEnd: (callId: string) => boolean;
}

export function CallNotice({ call, peer, onRespond, onEnd }: CallNoticeProps) {
  const [responding, setResponding] = useState(false);
  const peerName = peer?.name ?? "Coworker";

  useEffect(() => setResponding(false), [call.callId, call.state]);

  const respond = (accept: boolean) => {
    if (!responding && onRespond(call.callId, accept)) {
      setResponding(true);
    }
  };

  const end = () => {
    if (!responding && onEnd(call.callId)) {
      setResponding(true);
    }
  };

  return (
    <div className={`call-pill ${call.state} ${call.direction}`} aria-live="polite" aria-busy={responding}>
      <Avatar member={peer} className="person-avatar" />
      <div className="call-copy">
        <strong>{peerName}</strong>
        <span>{call.state === "accepted" ? "Accepted" : call.direction === "incoming" ? "Incoming call" : "Calling…"}</span>
      </div>
      {call.state === "ringing" && call.direction === "incoming" ? (
        <div className="call-actions">
          <button
            className="accept-call"
            aria-label={`Accept call from ${peerName}`}
            disabled={responding}
            onClick={() => respond(true)}
          >
            <Phone size={17} />
          </button>
          <button
            aria-label={`Decline call from ${peerName}`}
            disabled={responding}
            onClick={() => respond(false)}
          >
            <PhoneOff size={17} />
          </button>
        </div>
      ) : (
        <button
          aria-label={call.state === "accepted" ? `End call with ${peerName}` : `Cancel call to ${peerName}`}
          disabled={responding}
          onClick={end}
        >
          <PhoneOff size={17} />
        </button>
      )}
    </div>
  );
}
