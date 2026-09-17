import { useEffect, useState } from "react";
import type { GitHubAdminSettings, GitHubAppSettings } from "@workhard/shared";
import { fetchGitHubAdminSettings, updateGitHubAdminSettings } from "../../api";
import { OAuthRedirectUriField } from "./OAuthRedirectUriField";
import { getRecommendedRedirectUri } from "./oauth-redirect-uri";

export function GitHubAppEditor() {
  const recommendedUri = getRecommendedRedirectUri("github");
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
        setDraft({ clientId: settings.clientId, appSlug: settings.appSlug, redirectUri: settings.redirectUri || recommendedUri || "" });
      }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "GitHub settings could not load."); });
    return () => { active = false; };
  }, [recommendedUri]);
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
      setDraft({ clientId: result.clientId, appSlug: result.appSlug, redirectUri: result.redirectUri || recommendedUri || "" });
      setClientSecret("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "GitHub settings could not be saved."); }
    finally { setBusy(false); }
  }}>
    <div className="admin-integration-setup">
      <a href="https://github.com/settings/apps" target="_blank" rel="noopener noreferrer">Open GitHub Apps</a>
      <details open={saved?.clientId === ""}>
        <summary>Setup steps</summary>
        <ol>
          <li>Create a GitHub App and use your workspace URL as its Homepage URL.</li>
          <li>Set repository permissions to <strong>Pull requests: Read-only</strong> and <strong>Metadata: Read-only</strong>.</li>
          <li>Keep <strong>Expire user authorization tokens</strong> on; turn off <strong>Request user authorization during installation</strong> and <strong>Webhooks → Active</strong>.</li>
          <li>Register the Redirect URI below, generate a client secret, and copy the app’s credentials into this form.</li>
          <li>Install the app on the repositories you want to use.</li>
        </ol>
      </details>
    </div>
    <fieldset disabled={!saved || busy}>
      <label>Client ID<input value={draft.clientId} maxLength={128} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })} autoComplete="off" /></label>
      <label>{hasSavedSecret ? "Replace client secret" : "Client secret"}<input type="password" value={clientSecret} required={Boolean(clientId) && !hasSavedSecret} disabled={!clientId}
        maxLength={4096} onChange={(event) => setClientSecret(event.target.value)} autoComplete="new-password" /></label>
      <div className="admin-settings-field">
        <label>App slug<input value={draft.appSlug} required={Boolean(clientId)} disabled={!clientId} maxLength={100} aria-describedby="github-app-slug-help"
          onChange={(event) => setDraft({ ...draft, appSlug: event.target.value })} autoComplete="off" /></label>
        <p id="github-app-slug-help">The name after <code>github.com/apps/</code> in your app’s public URL.</p>
      </div>
      <OAuthRedirectUriField provider="github" value={draft.redirectUri} recommendedUri={recommendedUri} required={Boolean(clientId)}
        onChange={(redirectUri) => setDraft({ ...draft, redirectUri })} />
      {saved && !saved.encryptionReady && <p role="status">Set GITHUB_TOKEN_KEY on the server to enable GitHub.</p>}
      {(changed || saved?.needsApply) && saved?.clientId && <p>{clientId ? "Saving disconnects GitHub for everyone." : "Saving disables GitHub and disconnects everyone."}</p>}
      {saved?.needsApply && !error && <p role="alert">GitHub settings could not be applied. Save again to retry.</p>}
      <button className="primary-button" disabled={(!changed && !saved?.needsApply) || Boolean(clientId && !saved?.encryptionReady)}>{busy ? "Saving…" : "Save GitHub"}</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {!saved && !error && <p role="status">Loading…</p>}
  </form>;
}
