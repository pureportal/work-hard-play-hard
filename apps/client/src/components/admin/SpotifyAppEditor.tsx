import { useEffect, useState } from "react";
import type { SpotifyAdminSettings } from "@workhard/shared";
import { fetchSpotifyAdminSettings, updateSpotifyAdminSettings } from "../../api";

export function SpotifyAppEditor() {
  const [saved, setSaved] = useState<SpotifyAdminSettings>();
  const [clientId, setClientId] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    fetchSpotifyAdminSettings().then((settings) => {
      if (active) { setSaved(settings); setClientId(settings.clientId); setRedirectUri(settings.redirectUri); }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Spotify settings could not load."); });
    return () => { active = false; };
  }, []);
  const changed = Boolean(saved && (saved.clientId !== clientId.trim() || saved.redirectUri !== redirectUri.trim()));
  return <form className="admin-settings-form" onSubmit={async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try { setSaved(await updateSpotifyAdminSettings({ clientId: clientId.trim(), redirectUri: clientId.trim() ? redirectUri.trim() : "" })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Spotify settings could not be saved."); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={!saved || busy}>
      <label>Client ID<input value={clientId} maxLength={128} onChange={(event) => setClientId(event.target.value)} autoComplete="off" /></label>
      <label>Redirect URI<input type="url" value={redirectUri} required={Boolean(clientId.trim())} maxLength={2048} onChange={(event) => setRedirectUri(event.target.value)} /></label>
      {clientId && !saved?.encryptionReady && <p role="status">Set SPOTIFY_TOKEN_KEY on the server to enable Spotify.</p>}
      {changed && saved?.clientId && <p>Saving disconnects Spotify for everyone.</p>}
      <button className="primary-button" disabled={!changed}>{busy ? "Saving…" : "Save Spotify"}</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {!saved && !error && <p role="status">Loading…</p>}
  </form>;
}
