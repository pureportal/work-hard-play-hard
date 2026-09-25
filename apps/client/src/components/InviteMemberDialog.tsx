import { useState, type FormEvent } from "react";
import type { MemberRole } from "@workhard/shared";
import { WorkspaceDialog } from "./WorkspaceDialog";
import "../invite-member.css";

export function InviteMemberDialog({ onInvite, onClose }: {
  onInvite: (email: string, role: Exclude<MemberRole, "owner">) => Promise<boolean>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<MemberRole, "owner">>("member");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      if (await onInvite(email.trim(), role)) onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Invitation could not be sent. Try again.");
    } finally {
      setPending(false);
    }
  };

  return <WorkspaceDialog title="Invite person" className="invite-member-dialog" onClose={onClose} error={error}>
    <form className="invite-member-form" onSubmit={(event) => void submit(event)}>
      <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /></label>
      <label>Role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
        <option value="member">Member</option><option value="guest">Guest</option><option value="admin">Server administrator</option>
      </select></label>
      <button type="submit" className="primary-button" disabled={pending}>{pending ? "Sending…" : "Send invite"}</button>
    </form>
  </WorkspaceDialog>;
}
