import { useEffect } from "react";
import type { Meeting, MeetingInvitation, Member } from "@workhard/shared";

export function MeetingInvitationNotice({ invitation, meeting, inviter, onOpen, onDismiss }: {
  invitation: MeetingInvitation;
  meeting: Meeting;
  inviter: Member | undefined;
  onOpen: (small: boolean) => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, Math.max(0, Date.parse(invitation.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [invitation.expiresAt, onDismiss]);
  return <aside className="meeting-invitation" aria-label="Meeting invitation">
    <p><strong>{inviter?.name ?? "A participant"}</strong> invited you to {meeting.title}.</p>
    <div><button className="primary-button" onClick={() => onOpen(false)}>Open</button>
      <button className="secondary-button" onClick={() => onOpen(true)}>Open Small</button>
      <button className="secondary-button" onClick={onDismiss}>Dismiss</button></div>
  </aside>;
}
