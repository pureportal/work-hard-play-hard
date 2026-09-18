import { useCallback, useEffect, useRef, useState } from "react";
import { Github, LoaderCircle, Unlink } from "lucide-react";
import type { GitHubStatus } from "@workhard/shared";
import { connectGitHub, disconnectGitHub, fetchGitHubStatus } from "../api";
import { openAuthorization } from "../open-authorization";
import "./github.css";

const callbackError = "GitHub could not connect. Try connecting again.";

export function GitHubConnection({ onStatus, compact = false }: { onStatus?: (status: GitHubStatus) => void; compact?: boolean }) {
  const [status, setStatus] = useState<GitHubStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => new URLSearchParams(window.location.search).get("github") === "error"
    ? callbackError : null);
  const revision = useRef(0);
  const updating = useRef(false);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const accept = useCallback((next: GitHubStatus) => { setStatus(next); onStatusRef.current?.(next); }, []);
  const refresh = useCallback(async () => {
    if (updating.current) return;
    const version = ++revision.current;
    try {
      const next = await fetchGitHubStatus();
      if (version === revision.current) {
        accept(next);
        setError((current) => current === callbackError && !next.connected ? current : null);
      }
    } catch (failure) {
      if (version === revision.current) setError(failure instanceof Error ? failure.message : "GitHub could not load. Try again.");
    }
  }, [accept]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("github")) {
      url.searchParams.delete("github");
      window.history.replaceState(window.history.state, "", url);
    }
    void refresh();
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => { revision.current++; window.removeEventListener("focus", focus); };
  }, [refresh]);

  const update = async (disconnect: boolean) => {
    if (updating.current) return;
    updating.current = true;
    const version = ++revision.current;
    setBusy(true);
    setError(null);
    try {
      if (disconnect) {
        const next = await disconnectGitHub();
        if (revision.current === version) accept(next);
      } else {
        await openAuthorization(connectGitHub);
      }
    } catch (failure) {
      if (revision.current === version) setError(failure instanceof Error ? failure.message : "GitHub could not connect. Try again.");
    } finally {
      updating.current = false;
      if (revision.current === version) setBusy(false);
    }
  };

  return <section className={`settings-section github-connection${compact && status?.connected ? " github-connection-compact" : ""}`} aria-label="GitHub" aria-busy={busy || !status && !error}>
    <h3><Github size={18} aria-hidden="true" />{compact && status?.connected ? `@${status.login}` : <>GitHub{status?.connected && <span>@{status.login}</span>}</>}</h3>
    {!status && !error && <p role="status">Loading…</p>}
    {status && !status.configured && <p>GitHub has not been set up for this workspace.</p>}
    {status?.configured && (status.connected
      ? <button className={compact ? "text-button" : "secondary-button"} disabled={busy} onClick={() => void update(true)}>{busy ? <LoaderCircle size={14} className="github-spinner" aria-hidden="true" /> : <Unlink size={14} aria-hidden="true" />}Disconnect GitHub</button>
      : <button className="primary-button" disabled={busy} onClick={() => void update(false)}>{busy ? <LoaderCircle size={16} className="github-spinner" aria-hidden="true" /> : <Github size={16} aria-hidden="true" />}{status.needsReconnect ? "Reconnect GitHub" : "Connect GitHub"}</button>)}
    {error && <p className="github-error" role="alert">{error} <button className="text-button" disabled={busy} onClick={() => { setError(null); void refresh(); }}>Retry</button></p>}
  </section>;
}
