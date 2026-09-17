import { useEffect, useState } from "react";
import type { SpotifyAdminSettings, SpotifyAppSettings } from "@workhard/shared";
import { fetchSpotifyAdminSettings, updateSpotifyAdminSettings } from "../../api";
import { OAuthRedirectUriField } from "./OAuthRedirectUriField";
import { getRecommendedRedirectUri } from "./oauth-redirect-uri";

export function SpotifyAppEditor() {
  const recommendedUri = getRecommendedRedirectUri("spotify");
  const [saved, setSaved] = useState<SpotifyAdminSettings>();
  const [clientId, setClientId] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    fetchSpotifyAdminSettings().then((settings) => {
      if (active) { setSaved(settings); setClientId(settings.clientId); setRedirectUri(settings.redirectUri || recommendedUri || ""); }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Spotify settings could not load."); });
    return () => { active = false; };
  }, [recommendedUri]);
  const settings: SpotifyAppSettings = { clientId: clientId.trim(), redirectUri: clientId.trim() ? redirectUri.trim() : "" };
  const changed = Boolean(saved && (saved.clientId !== settings.clientId || saved.redirectUri !== settings.redirectUri));
  return <form className="admin-settings-form" onSubmit={async (event) => {
    event.preventDefault();
    if (!saved || busy || !changed) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await updateSpotifyAdminSettings(settings);
      setSaved(result); setClientId(result.clientId); setRedirectUri(result.redirectUri || recommendedUri || "");
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Spotify settings could not be saved."); }
    finally { setBusy(false); }
  }}>
    <div className="admin-integration-setup">
      <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Open Spotify developer dashboard</a>
      <details open={saved?.clientId === ""}>
        <summary>Setup steps</summary>
        <ol>
          <li>Create a Web API app.</li>
          <li>Add the Redirect URI below in the app’s settings, then copy its Client ID into this form.</li>
          <li>For a development app, add the Spotify accounts that will connect under <strong>Users Management</strong>.</li>
        </ol>
      </details>
    </div>
    <fieldset disabled={!saved || busy}>
      <label>Client ID<input value={clientId} maxLength={128} onChange={(event) => setClientId(event.target.value)} autoComplete="off" /></label>
      <OAuthRedirectUriField provider="spotify" value={redirectUri} recommendedUri={recommendedUri} required={Boolean(settings.clientId)} onChange={setRedirectUri} />
      {clientId && !saved?.encryptionReady && <p role="status">Set SPOTIFY_TOKEN_KEY on the server to enable Spotify.</p>}
      {changed && saved?.clientId && <p>Saving disconnects Spotify for everyone.</p>}
      <button className="primary-button" disabled={!changed}>{busy ? "Saving…" : "Save Spotify"}</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {!saved && !error && <p role="status">Loading…</p>}
  </form>;
}
