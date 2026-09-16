import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "../confirmation-dialog.css";

interface ConfirmationDialogProps {
  title: string;
  description?: string | undefined;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  error?: string | undefined;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  pending = false,
  error,
  children,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement;
    dialog.showModal();
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (pending) dialogRef.current?.focus({ preventScroll: true });
  }, [pending]);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="confirmation-dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-busy={pending}
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          if (!pending) onCancel();
        } else if (event.key === "Tab") {
          if (pending) {
            event.preventDefault();
            dialogRef.current?.focus();
          } else if (event.shiftKey && (document.activeElement === cancelRef.current || document.activeElement === dialogRef.current)) {
            event.preventDefault();
            confirmRef.current?.focus();
          } else if (!event.shiftKey && document.activeElement === confirmRef.current) {
            event.preventDefault();
            cancelRef.current?.focus();
          }
        }
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {children}
      <h2 id={titleId}>{title}</h2>
      {description && <p id={descriptionId}>{description}</p>}
      {error && <p className="confirmation-dialog-error" role="alert">{error}</p>}
      <div className="confirmation-dialog-actions">
        <button ref={cancelRef} type="button" className="secondary-button" disabled={pending} onClick={onCancel}>{cancelLabel}</button>
        <button ref={confirmRef} type="button" className="primary-button" disabled={pending} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>,
    document.body,
  );
}
