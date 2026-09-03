import { useModalFocus } from "../hooks/useModalFocus";

interface MeetingSwitchDialogProps {
  meetingTitle: string;
  consequence: string;
  actionLabel: "Open" | "Open Small";
  onCancel: () => void;
  onConfirm: () => void;
}

export function MeetingSwitchDialog({
  meetingTitle,
  consequence,
  actionLabel,
  onCancel,
  onConfirm,
}: MeetingSwitchDialogProps) {
  const dialogRef = useModalFocus<HTMLElement>(onCancel);

  return (
    <div className="modal-backdrop">
      <section
        ref={dialogRef}
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-switch-title"
        tabIndex={-1}
      >
        <h2 id="meeting-switch-title">Open {meetingTitle}?</h2>
        <p>{consequence}</p>
        <div>
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary-button" onClick={onConfirm}>{actionLabel}</button>
        </div>
      </section>
    </div>
  );
}
