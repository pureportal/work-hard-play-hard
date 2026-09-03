import { ImagePlus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import type { Member } from "@workhard/shared";
import { useModalFocus } from "../hooks/useModalFocus";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const acceptedTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

interface AvatarDialogProps {
  currentUser: Member;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}

export function AvatarDialog({ currentUser, onClose, onUpload, onRemove }: AvatarDialogProps) {
  const dialogRef = useModalFocus<HTMLElement>(onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const [operation, setOperation] = useState<"upload" | "remove">();
  const [error, setError] = useState("");
  const busy = operation !== undefined;

  const upload = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    if (!acceptedTypes.has(file.type)) {
      setError("Choose a PNG, JPEG, GIF, or WebP image.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError("Choose an image up to 5 MB.");
      return;
    }
    setOperation("upload");
    setError("");
    try {
      await onUpload(file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Avatar could not be updated.");
    } finally {
      setOperation(undefined);
    }
  };

  const remove = async () => {
    setOperation("remove");
    setError("");
    try {
      await onRemove();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Avatar could not be removed.");
    } finally {
      setOperation(undefined);
    }
  };

  return (
    <div className="modal-backdrop">
      <section
        ref={dialogRef}
        className="avatar-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-dialog-title"
        aria-busy={busy}
        tabIndex={-1}
      >
        <header>
          <h2 id="avatar-dialog-title">Avatar</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </header>
        <Avatar member={currentUser} className="avatar-preview" />
        <div className="avatar-dialog-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus size={15} />{operation === "upload" ? "Uploading…" : "Upload image"}
          </button>
          {currentUser.avatarUrl && (
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void remove()}>
              <Trash2 size={15} />{operation === "remove" ? "Removing…" : "Remove"}
            </button>
          )}
          <input
            ref={inputRef}
            hidden
            type="file"
            accept=".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp"
            disabled={busy}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </div>
        {error && <p className="avatar-dialog-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
