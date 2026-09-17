import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, GitMerge, GitPullRequest, RefreshCw, Send } from "lucide-react";
import type { GitHubMailroom as Mailroom, GitHubMailroomView, GitHubStatus, WorldObject } from "@workhard/shared";
import { ApiError, fetchGitHubMailroom } from "../api";
import { SurfaceHeader } from "../components/SurfaceHeader";
import { useModalFocus } from "../hooks/useModalFocus";
import { GitHubConnection } from "./GitHubConnection";
import { GitHubRepositoryPicker } from "./GitHubRepositoryPicker";
import { getMailroomArrival } from "./mailroom-events";
import "./github.css";

const views: { id: GitHubMailroomView; label: string }[] = [
  { id: "repository", label: "Open" }, { id: "mine", label: "Mine" },
  { id: "reviews", label: "Review requests" }, { id: "merged", label: "Merged" },
];
const reviewLabels = { APPROVED: "Approved", CHANGES_REQUESTED: "Changes requested", REVIEW_REQUIRED: "Review required" };
const updatedDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function GitHubMailroom({ object, repository, onRepositoryChange, unavailable, onClose, modal = true }: {
  object: WorldObject; repository: string; onRepositoryChange: (repository: string) => void;
  unavailable: string | undefined; onClose: () => void; modal?: boolean;
}) {
  const dialogRef = useModalFocus<HTMLDivElement>(onClose, true, modal);
  const [status, setStatus] = useState<GitHubStatus>();
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [view, setView] = useState<GitHubMailroomView>("repository");
  const [pagination, setPagination] = useState<{ key: string; cursors: (string | null)[] }>({ key: "", cursors: [null] });
  const [result, setResult] = useState<{ key: string; data: Mailroom }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [arrival, setArrival] = useState<{ number: number; url: string }>();
  const baseline = useRef<Mailroom | undefined>(undefined);
  const scope = JSON.stringify([object.id, repository, view, status?.login]);
  const cursors = pagination.key === scope ? pagination.cursors : [null];
  const cursor = cursors.at(-1)!;
  const resultKey = JSON.stringify([scope, cursor]);
  const connected = Boolean(status?.connected && status.configured);
  const acceptStatus = useCallback((next: GitHubStatus) => setStatus(next), []);
  const reconnect = useCallback(() => {
    setStatus(undefined);
    setConnectionVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    baseline.current = undefined;
    setArrival(undefined);
  }, [object.id, repository, view, cursor, connected, status?.login]);

  useEffect(() => {
    let pending: AbortController | undefined;
    setResult((current) => current?.key === resultKey ? current : undefined);
    setError(undefined);
    setArrival(undefined);
    if (!connected || !repository || unavailable) { baseline.current = undefined; setResult(undefined); setBusy(false); return; }
    const load = async () => {
      if (pending || document.hidden) return;
      const controller = new AbortController();
      pending = controller;
      setBusy(true);
      try {
        const next = await fetchGitHubMailroom(object.id, repository, view, cursor, controller.signal);
        if (controller.signal.aborted || document.hidden) return;
        setResult({ key: resultKey, data: next });
        setError(undefined);
        if (!cursor) setArrival(getMailroomArrival(baseline.current, next, view));
        baseline.current = next;
      } catch (failure) {
        if (controller.signal.aborted) return;
        setResult(undefined);
        setArrival(undefined);
        baseline.current = undefined;
        setError(failure instanceof Error ? failure.message : "Pull requests could not load. Try again.");
        if (failure instanceof ApiError && failure.code === "GITHUB_RECONNECT") {
          reconnect();
        }
      } finally {
        if (pending === controller) {
          pending = undefined;
          setBusy(false);
        }
      }
    };
    const visibility = () => {
      if (document.hidden) {
        pending?.abort();
        pending = undefined;
        baseline.current = undefined;
        setResult(undefined);
        setArrival(undefined);
        setBusy(false);
      }
      else void load();
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      pending?.abort();
      pending = undefined;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [object.id, connected, status?.login, repository, view, cursor, resultKey, unavailable, refresh, reconnect]);

  const visible = connected && !unavailable && result?.key === resultKey ? result.data : undefined;
  return <div className={modal ? "modal-backdrop" : "github-mailroom-floating"}>
    <div className="github-mailroom" ref={dialogRef} role="dialog" aria-modal={modal || undefined} aria-label="PR tray" tabIndex={-1}>
      <SurfaceHeader className="github-mailroom-header" title="PR tray" closeLabel="Close PR tray" onClose={onClose} />
      <div className="github-mailroom-content">
      <GitHubConnection key={connectionVersion} compact onStatus={acceptStatus} />
      {unavailable && <p role="alert" className="github-error">{unavailable}</p>}
      {connected && !unavailable && <>
        <GitHubRepositoryPicker key={status!.login} value={repository} onChange={onRepositoryChange} installationUrl={status!.installationUrl} onReconnect={reconnect} />
        {repository && <>
          <div className="github-mailroom-tabs" role="group" aria-label="Pull requests">
            {views.map((option) => <button key={option.id} aria-pressed={view === option.id} onClick={() => setView(option.id)}>{option.label}</button>)}
          </div>
          <div className="github-mailroom-summary">
            <span role="status">{visible ? `${visible.total} pull request${visible.total === 1 ? "" : "s"}` : busy ? "Loading…" : ""}</span>
            <button className="icon-button" aria-label="Refresh pull requests" disabled={busy} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} className={busy ? "github-spinner" : ""} /></button>
          </div>
          {arrival && visible && <a key={arrival.number} className="github-merge-arrival" role="status" href={arrival.url} target="_blank" rel="noopener noreferrer"><Send size={17} aria-hidden="true" />Merged #{arrival.number}</a>}
          {error && <p role="alert" className="github-error">{error}</p>}
          {visible && <ul className="github-pull-requests" aria-label="Pull requests" aria-busy={busy}>
            {visible.pullRequests.map((pull) => <li key={pull.number} data-state={pull.state === "MERGED" ? "merged" : pull.draft ? "draft" : "open"}>
              <a href={pull.url} target="_blank" rel="noopener noreferrer">
                {pull.state === "MERGED" ? <GitMerge className="github-pull-icon" size={18} aria-hidden="true" /> : <GitPullRequest className="github-pull-icon" size={18} aria-hidden="true" />}
                <span className="github-pull-content">
                  <strong>{pull.title}</strong>
                  <small>#{pull.number}{pull.author ? ` · ${pull.author}` : ""}</small>
                  <span className="github-pull-meta">
                    <span>{pull.state === "MERGED" ? "Merged" : pull.draft ? "Draft" : pull.reviewDecision ? reviewLabels[pull.reviewDecision] : "Open"}</span>
                    <time dateTime={pull.updatedAt}>{updatedDate.format(new Date(pull.updatedAt))}</time>
                  </span>
                </span>
                <ExternalLink className="github-pull-external" size={14} aria-hidden="true" />
              </a>
            </li>)}
          </ul>}
          {visible?.pullRequests.length === 0 && <p className="github-empty">Tray clear.</p>}
          {(cursors.length > 1 || visible?.nextCursor) && <div className="github-pagination">
            <button className="secondary-button" disabled={cursors.length === 1 || busy} onClick={() => setPagination({ key: scope, cursors: cursors.slice(0, -1) })}>Previous</button>
            <button className="secondary-button" disabled={!visible?.nextCursor || busy} onClick={() => setPagination({ key: scope, cursors: [...cursors, visible!.nextCursor] })}>Next</button>
          </div>}
        </>}
      </>}
      </div>
    </div>
  </div>;
}
