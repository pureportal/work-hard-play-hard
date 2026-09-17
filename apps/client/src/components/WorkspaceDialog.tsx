import { useId, type ReactNode } from "react";
import { useModalFocus } from "../hooks/useModalFocus";
import { SurfaceHeader } from "./SurfaceHeader";
import "../workspace-dialog.css";

export function WorkspaceDialog({ title, className = "", error, children, onBack, onClose }: {
  title: string; className?: string; error?: string | undefined; children: ReactNode; onBack?: () => void; onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useModalFocus<HTMLElement>(onClose);
  return <div className="modal-backdrop workspace-dialog-backdrop">
    <section ref={dialogRef} className={`workspace-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <SurfaceHeader className="workspace-dialog-header" title={title} titleId={titleId} onClose={onClose} {...(onBack && { onBack })} />
      {error && <p className="workspace-dialog-error" role="alert">{error}</p>}
      {children}
    </section>
  </div>;
}
