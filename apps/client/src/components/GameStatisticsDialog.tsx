import { BarChart3, X } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface GameRanking {
  id: string;
  name: string;
  value: string;
}

export interface GameHistoryEntry {
  id: string;
  title: string;
  detail: string;
  value?: string;
}

export function GameStatisticsButton({ onClick }: { onClick: () => void }) {
  return <button className="game-statistics-trigger" type="button" onClick={onClick} aria-label="Statistics"><BarChart3 size={17} /><span>Stats</span></button>;
}

export function GameStatisticsDialog({ game, metrics, rankings, history, rankingLabel, children, onClose }: {
  game: string;
  metrics: { label: string; value: string }[];
  rankings: GameRanking[];
  history: GameHistoryEntry[];
  rankingLabel: string;
  children?: ReactNode;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "rankings" | "history">("overview");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const tabsId = useId();
  const views = ["overview", "rankings", "history"] as const;

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement;
    dialog.showModal();
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<dialog ref={dialogRef} className="game-statistics-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); onClose(); } }} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <header><h2 id={titleId}>{game}</h2><button ref={closeRef} type="button" aria-label="Close statistics" onClick={onClose}><X size={18} /></button></header>
    <div className="game-statistics-tabs" role="tablist" aria-label="Statistics view" onKeyDown={(event) => {
      const index = views.indexOf(tab);
      const next = event.key === "ArrowRight" ? (index + 1) % views.length : event.key === "ArrowLeft" ? (index + views.length - 1) % views.length : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      setTab(views[next]!);
      event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
    }}>
      {views.map((view) => <button key={view} id={`${tabsId}-${view}`} type="button" role="tab" aria-controls={`${tabsId}-panel`} aria-selected={tab === view} tabIndex={tab === view ? 0 : -1} onClick={() => setTab(view)}>{view.charAt(0).toUpperCase() + view.slice(1)}</button>)}
    </div>
    <div className="game-statistics-body">
      {tab === "overview" && <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-overview`} className="game-statistics-overview">
        <dl className="game-statistics-metrics">{metrics.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {children}
      </div>}
      {tab === "rankings" && <section id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-rankings`} className="game-statistics-list" aria-label="Rankings">
        <div className="game-statistics-list-heading"><span>Player</span><span>{rankingLabel}</span></div>
        {rankings.length ? <ol>{rankings.map((entry, index) => <li key={entry.id}><span className="game-statistics-rank">{index + 1}</span><strong>{entry.name}</strong><b>{entry.value}</b></li>)}</ol> : <p>No rankings yet.</p>}
      </section>}
      {tab === "history" && <section id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-history`} className="game-statistics-list" aria-label="History">
        {history.length ? <ol>{history.map((entry) => <li key={entry.id}><div><strong>{entry.title}</strong><span>{entry.detail}</span></div>{entry.value && <b>{entry.value}</b>}</li>)}</ol> : <p>No games yet.</p>}
      </section>}
    </div>
  </dialog>, document.body);
}
