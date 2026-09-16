import { ArrowLeft, X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useModalFocus } from "../hooks/useModalFocus";
import { IconButton } from "./IconButton";
import "../workspace-dialog.css";

export function WorkspaceDialog({ title, className = "", error, children, onBack, onClose }: {
  title: string; className?: string; error?: string | undefined; children: ReactNode; onBack?: () => void; onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useModalFocus<HTMLElement>(onClose);
  return <div className="modal-backdrop workspace-dialog-backdrop">
    <section ref={dialogRef} className={`workspace-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="workspace-dialog-header">
        {onBack && <IconButton label="Back to build" icon={ArrowLeft} onClick={onBack} />}
        <h2 id={titleId}>{title}</h2>
        <IconButton label={`Close ${title.toLowerCase()}`} icon={X} onClick={onClose} />
      </header>
      {error && <p className="workspace-dialog-error" role="alert">{error}</p>}
      {children}
    </section>
  </div>;
}
