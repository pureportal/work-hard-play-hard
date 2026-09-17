import { RotateCcw, X } from "lucide-react";
import type { Member } from "@workhard/shared";
import type { CallRequestStatus } from "../hooks/useCallRequest";
import { Avatar } from "./Avatar";

interface CallRequestNoticeProps {
  status: CallRequestStatus;
  peer: Member | undefined;
  onRetry: () => void;
  onDismiss: () => void;
}

export function CallRequestNotice({ status, peer, onRetry, onDismiss }: CallRequestNoticeProps) {
  return <div className="call-pill call-request" role={status.error ? "alert" : "status"} aria-busy={!status.error}>
    <Avatar member={peer} className="person-avatar" />
    <div className="call-copy">
      <strong>{peer?.name ?? "Coworker"}</strong>
      <span>{status.error ?? (status.command.type === "movement.approach_user" ? "Walking over…" : "Starting call…")}</span>
    </div>
    {status.error && <div className="call-actions">
      <button aria-label="Retry call" onClick={onRetry}><RotateCcw size={17} /></button>
      <button aria-label="Dismiss call error" onClick={onDismiss}><X size={17} /></button>
    </div>}
  </div>;
}
