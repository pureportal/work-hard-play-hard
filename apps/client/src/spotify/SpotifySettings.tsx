import { useEffect, useRef, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { isSpotifyJamUrl, type SpotifyStatus } from "@workhard/shared";
import { connectSpotify, disconnectSpotify, fetchSpotifyStatus, setSpotifyJam, setSpotifySharing } from "../api";
import { SpotifyMark } from "./SpotifyMark";
import { openAuthorization } from "../open-authorization";
import "./spotify.css";

export function SpotifySettings() {
  const [status, setStatus] = useState<SpotifyStatus>();
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("spotify");
    return result === "error" ? "Spotify could not connect. Try connecting again." : null;
  });
  const [editingJam, setEditingJam] = useState(false);
  const [jamUrl, setJamUrl] = useState("");
  const revision = useRef(0);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("spotify")) {
      url.searchParams.delete("spotify");
      window.history.replaceState(null, "", url);
    }
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      const version = revision.current;
      try {
        const next = await fetchSpotifyStatus();
        if (active && version === revision.current) { setStatus(next); setLoadError(null); }
      } catch (failure) {
        if (active && version === revision.current) setLoadError(failure instanceof Error ? failure.message : "Spotify could not be loaded. Try again.");
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    window.addEventListener("focus", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  const update = async (operation: () => Promise<SpotifyStatus>) => {
    revision.current++;
    setBusy(true);
    setError(null);
    try {
      setStatus(await operation());
      setEditingJam(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Spotify settings could not be saved. Try again.");
    } finally {
      revision.current++;
      setBusy(false);
    }
  };
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await openAuthorization(connectSpotify);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Spotify could not connect. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="settings-section spotify-settings" aria-label="Spotify" aria-busy={busy}>
    <h3><SpotifyMark />Spotify</h3>
    {!status && !error && !loadError && <span className="spotify-muted" role="status">Loading…</span>}
    {status && !status.configured && <p className="spotify-muted">Spotify has not been set up for this workspace.</p>}
    {status?.configured && <>
      {status.connected ? <>
        <label className="permission-toggle">
          <input type="checkbox" checked={status.sharing} disabled={busy}
            onChange={(event) => void update(() => setSpotifySharing(event.target.checked))} />
          <span>Share listening activity</span>
        </label>
        {status.sharing && <div className="spotify-jam-settings">
          {editingJam ? <form onSubmit={(event) => {
            event.preventDefault();
            const value = jamUrl.trim();
            if (!isSpotifyJamUrl(value)) { setError("Paste a Spotify Jam invite link."); return; }
            void update(() => setSpotifyJam(value));
          }}>
            <label htmlFor="spotify-jam-url">Jam invite</label>
            <input id="spotify-jam-url" type="url" autoFocus required maxLength={1024} value={jamUrl}
              aria-describedby="spotify-jam-help" onChange={(event) => setJamUrl(event.target.value)} />
            <p id="spotify-jam-help" className="spotify-muted">Copy a Jam invite from Spotify; remote listeners need Premium.</p>
            <div className="spotify-buttons">
              <button type="submit" className="primary-button" disabled={busy}>Share invite</button>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => setEditingJam(false)}>Cancel</button>
            </div>
          </form> : <button className="secondary-button" disabled={busy} onClick={() => {
            if (status.jamUrl) void update(() => setSpotifyJam(null));
            else { setJamUrl(""); setEditingJam(true); }
          }}><Link2 size={15} />{status.jamUrl ? "Remove Jam invite" : "Share Jam invite"}</button>}
        </div>}
        <button className="spotify-disconnect" disabled={busy} onClick={() => void update(disconnectSpotify)}><Unlink size={14} />Disconnect Spotify</button>
      </> : <button className="primary-button spotify-connect" disabled={busy} onClick={() => void connect()}>
        <SpotifyMark />{status.needsReconnect ? "Reconnect Spotify" : "Connect Spotify"}
      </button>}
    </>}
    {(error || loadError || status?.error) && <p className="spotify-error" role="alert">{error || loadError || status?.error}</p>}
    {status?.connected && status.error && <button className="secondary-button" disabled={busy} onClick={() => void connect()}>Reconnect Spotify</button>}
  </section>;
}
