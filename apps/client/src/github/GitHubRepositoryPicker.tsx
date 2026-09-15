import { useEffect, useId, useState } from "react";
import type { GitHubRepositories } from "@workhard/shared";
import { ApiError, fetchGitHubRepositories } from "../api";

export function GitHubRepositoryPicker({ value, onChange, installationUrl, onReconnect }: {
  value: string; onChange: (repository: string) => void; installationUrl: string | null;
  onReconnect: () => void;
}) {
  const id = useId();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<GitHubRepositories>();
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError(undefined);
    void fetchGitHubRepositories(page, controller.signal).then((next) => {
      if (!controller.signal.aborted) setResult(next);
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.code === "GITHUB_RECONNECT") onReconnect();
      else setError(failure instanceof Error ? failure.message : "Repositories could not load. Try again.");
    });
    return () => controller.abort();
  }, [page, retry, onReconnect]);
  return <div className="github-repository-picker" aria-busy={!result && !error}>
    <div className="github-repository-label">
      <label htmlFor={id}>Repository</label>
      {installationUrl && <a href={installationUrl} target="_blank" rel="noopener noreferrer">Manage repositories</a>}
    </div>
    <select id={id} value={value} disabled={!result} onChange={(event) => onChange(event.target.value)}>
      <option value="">{error ? "Repositories unavailable" : result ? "Choose repository" : "Loading…"}</option>
      {value && !result?.repositories.some((repo) => repo.fullName === value) && <option value={value}>{value}</option>}
      {result?.repositories.map((repo) => <option key={repo.fullName} value={repo.fullName}>{repo.fullName}{repo.private ? " · Private" : ""}</option>)}
    </select>
    {(page > 1 || result?.nextPage) && <div className="github-pagination">
      <button className="secondary-button" disabled={page === 1 || !result && !error} onClick={() => setPage(page - 1)}>Previous repositories</button>
      <button className="secondary-button" disabled={!result?.nextPage} onClick={() => setPage(result!.nextPage!)}>More repositories</button>
    </div>}
    {result?.repositories.length === 0 && <p>No repositories found.</p>}
    {error && <p role="alert" className="github-error">{error} <button className="text-button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}
  </div>;
}
