import { useEffect, useState } from "react";
import type { GitHubAdminSettings, GitHubAppSettings } from "@workhard/shared";
import { fetchGitHubAdminSettings, updateGitHubAdminSettings } from "../../api";

export function GitHubAppEditor() {
  const [saved, setSaved] = useState<GitHubAdminSettings>();
  const [draft, setDraft] = useState<GitHubAppSettings>({ clientId: "", appSlug: "", redirectUri: "" });
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    fetchGitHubAdminSettings().then((settings) => {
      if (active) {
        setSaved(settings);
        setDraft({ clientId: settings.clientId, appSlug: settings.appSlug, redirectUri: settings.redirectUri });
      }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "GitHub settings could not load."); });
    return () => { active = false; };
  }, []);
  const clientId = draft.clientId.trim();
  const settings: GitHubAppSettings = { clientId, appSlug: clientId ? draft.appSlug.trim() : "", redirectUri: clientId ? draft.redirectUri.trim() : "" };
  const changed = Boolean(saved && (saved.clientId !== settings.clientId || saved.appSlug !== settings.appSlug
    || saved.redirectUri !== settings.redirectUri || clientId && clientSecret.trim()));
  const hasSavedSecret = Boolean(saved?.hasClientSecret && saved.clientId === clientId);
  return <form className="admin-settings-form" onSubmit={async (event) => {
    event.preventDefault();
    if (!saved || busy || !changed && !saved.needsApply) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await updateGitHubAdminSettings({ ...settings, ...(clientId && clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}) });
      setSaved(result);
      setDraft({ clientId: result.clientId, appSlug: result.appSlug, redirectUri: result.redirectUri });
      setClientSecret("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "GitHub settings could not be saved."); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={!saved || busy}>
      <label>Client ID<input value={draft.clientId} maxLength={128} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })} autoComplete="off" /></label>
      <label>{hasSavedSecret ? "Replace client secret" : "Client secret"}<input type="password" value={clientSecret} required={Boolean(clientId) && !hasSavedSecret} disabled={!clientId}
        maxLength={4096} onChange={(event) => setClientSecret(event.target.value)} autoComplete="new-password" /></label>
      <label>App slug<input value={draft.appSlug} required={Boolean(clientId)} disabled={!clientId} maxLength={100}
        onChange={(event) => setDraft({ ...draft, appSlug: event.target.value })} autoComplete="off" /></label>
      <label>Redirect URI<input type="url" value={draft.redirectUri} required={Boolean(clientId)} disabled={!clientId} maxLength={2048}
        onChange={(event) => setDraft({ ...draft, redirectUri: event.target.value })} /></label>
      {saved && !saved.encryptionReady && <p role="status">Set GITHUB_TOKEN_KEY on the server to enable GitHub.</p>}
      {(changed || saved?.needsApply) && saved?.clientId && <p>{clientId ? "Saving disconnects GitHub for everyone." : "Saving disables GitHub and disconnects everyone."}</p>}
      {saved?.needsApply && !error && <p role="alert">GitHub settings could not be applied. Save again to retry.</p>}
      <button className="primary-button" disabled={(!changed && !saved?.needsApply) || Boolean(clientId && !saved?.encryptionReady)}>{busy ? "Saving…" : "Save GitHub"}</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {!saved && !error && <p role="status">Loading…</p>}
  </form>;
}
