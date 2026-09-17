import { useState, type FormEvent } from "react";
import { clearServerOrigin, getDefaultServerOrigin, getServerOrigin, setServerOrigin } from "../server-url";

export function ServerConnectionForm({ onConnected, disabled = false }: { onConnected: () => void; disabled?: boolean }) {
  const activeServer = getServerOrigin();
  const defaultServer = getDefaultServerOrigin();
  const [draft, setDraft] = useState(activeServer ?? "");
  const [error, setError] = useState<string>();

  const connect = (event: FormEvent) => {
    event.preventDefault();
    try {
      setServerOrigin(draft);
      setError(undefined);
      onConnected();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Server could not be saved. Try again.");
    }
  };

  return <form className="auth-form auth-server-form" onSubmit={connect}>
    <label>
      <span>Server URL</span>
      <input type="url" value={draft} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        aria-invalid={Boolean(error)} onChange={(event) => setDraft(event.target.value)} disabled={disabled} required />
    </label>
    {error && <output className="auth-error" role="alert">{error}</output>}
    <div className="auth-server-actions">
      <button type="submit" className="auth-submit" disabled={disabled}>Connect</button>
      {defaultServer && activeServer !== defaultServer && <button type="button" className="auth-server-default" disabled={disabled} onClick={() => {
        try {
          setDraft(clearServerOrigin() ?? "");
          setError(undefined);
          onConnected();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Server could not be saved. Try again.");
        }
      }}>Use default</button>}
    </div>
  </form>;
}
