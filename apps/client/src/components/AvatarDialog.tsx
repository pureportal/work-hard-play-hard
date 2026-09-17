import { useState } from "react";
import type { CharacterAppearance, Member } from "@workhard/shared";
import { useModalFocus } from "../hooks/useModalFocus";
import { CharacterEditor } from "./CharacterEditor";
import { SurfaceHeader } from "./SurfaceHeader";
import "../character.css";

interface AvatarDialogProps {
  currentUser: Member;
  onClose: () => void;
  onSaveCharacter: (appearance: CharacterAppearance) => Promise<void>;
}

export function AvatarDialog({ currentUser, onClose, onSaveCharacter }: AvatarDialogProps) {
  const [saving, setSaving] = useState(false);
  const dialogRef = useModalFocus<HTMLElement>(() => { if (!saving) onClose(); });
  const saveCharacter = async (appearance: CharacterAppearance) => {
    setSaving(true);
    try {
      await onSaveCharacter(appearance);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section ref={dialogRef} className="avatar-dialog character-dialog" role="dialog" aria-modal="true"
        aria-labelledby="avatar-dialog-title" aria-busy={saving} tabIndex={-1}>
        <SurfaceHeader className="avatar-dialog-header" title="Avatar" titleId="avatar-dialog-title" closeLabel="Close" closeDisabled={saving} onClose={onClose} />
        <CharacterEditor appearance={currentUser.character} onSave={saveCharacter} onClose={onClose} />
      </section>
    </div>
  );
}
