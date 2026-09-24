import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ClipboardCheck, ClipboardList, Clock3, Coins, FileText, Inbox, Printer, RefreshCw, Route, ScrollText, Stamp, UserRound, X } from "lucide-react";
import {
  APPROVAL_CASES, APPROVAL_UPGRADES,
  approvalCaseCoins, approvalCaseDurationMs, approvalCaseOutput, approvalUpgradeCost,
  type ApprovalCaseId, type ApprovalDeskView, type ApprovalUpgradeId,
} from "@workhard/shared";
import { fetchApprovalDesk, sendApprovalDeskAction } from "../api";
import { useModalFocus } from "../hooks/useModalFocus";
import { ApprovalDeskScene, type ApprovalDeskFeedback } from "./ApprovalDeskScene";
import { IconButton } from "./IconButton";
import "../approval-desk.css";

type Action = { action: "start"; caseId: ApprovalCaseId } | { action: "collect" } | { action: "stamp" } | { action: "buy"; upgradeId: ApprovalUpgradeId; expectedLevel: number };

interface ApprovalDeskPanelProps {
  currentUserId: string;
  guideActive?: boolean;
  onEconomyChange: (economy: ApprovalDeskView["economy"]) => void;
  onClose: () => void;
}

const caseIcons = { memo: FileText, permit: ScrollText, audit: ClipboardList };
const upgradeIcons = { stamp: Stamp, inbox: Inbox, clerk: UserRound, printer: Printer, routing: Route };

const milestones = [100, 500, 2_500, 10_000, 50_000, 250_000, 1_000_000];

export function ApprovalDeskPanel({ currentUserId, guideActive = false, onEconomyChange, onClose }: ApprovalDeskPanelProps) {
  const dialogRef = useModalFocus<HTMLDivElement>(onClose, true, !guideActive);
  const [view, setView] = useState<ApprovalDeskView>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  const [feedback, setFeedback] = useState<ApprovalDeskFeedback>();
  const requestVersion = useRef(0);
  const pendingAction = useRef(false);
  const feedbackVersion = useRef(0);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(undefined), 1_700);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const refresh = useCallback(async () => {
    if (pendingAction.current) return;
    const version = ++requestVersion.current;
    const next = await fetchApprovalDesk();
    if (version !== requestVersion.current) return;
    setView(next);
    setServerOffset(Date.parse(next.now) - Date.now());
    setError(undefined);
    onEconomyChange(next.economy);
  }, [onEconomyChange]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        if (active) await refresh();
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load Approval Desk.");
      }
    };
    void load();
    const refreshTimer = window.setInterval(() => void load(), 30_000);
    const tick = window.setInterval(() => { if (document.visibilityState === "visible") setClock(Date.now()); }, 1_000);
    const onVisible = () => { if (document.visibilityState === "visible") { setClock(Date.now()); void load(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; requestVersion.current += 1; window.clearInterval(refreshTimer); window.clearInterval(tick); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  const act = async (action: Action) => {
    if (pendingAction.current) return;
    pendingAction.current = true;
    requestVersion.current += 1;
    const version = requestVersion.current;
    setPending(true);
    setError(undefined);
    try {
      const result = await sendApprovalDeskAction(action);
      if (version !== requestVersion.current) return;
      setView(result.view);
      setServerOffset(Date.parse(result.view.now) - Date.now());
      onEconomyChange(result.view.economy);
      if (action.action === "stamp") {
        window.dispatchEvent(new Event("approval-desk:stamp"));
        const forms = result.view.player.forms - (view?.player.forms ?? 0);
        setFeedback({ id: ++feedbackVersion.current, label: `+${forms.toLocaleString()} forms`, kind: "stamp" });
      } else if (action.action === "collect") {
        setFeedback({ id: ++feedbackVersion.current, label: `+${(result.forms ?? 0).toLocaleString()} forms · +${result.coins ?? 0} coins`, kind: "collect" });
      } else if (action.action === "buy") {
        const name = APPROVAL_UPGRADES.find((item) => item.id === action.upgradeId)!.name;
        setFeedback({ id: ++feedbackVersion.current, label: `${name} · Level ${result.view.player.levels[action.upgradeId]}`, kind: "buy", upgradeId: action.upgradeId });
      } else {
        window.dispatchEvent(new Event("approval-desk:start"));
        setFeedback(undefined);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action could not be completed.");
    } finally {
      pendingAction.current = false;
      setPending(false);
    }
  };

  const player = view?.player;
  const activeCase = player?.case;
  const serverClock = clock + serverOffset;
  const remaining = activeCase ? Math.max(0, Date.parse(activeCase.readyAt) - serverClock) : 0;
  const ready = Boolean(activeCase && remaining === 0);
  const stampReady = !player?.lastStampAt || serverClock - Date.parse(player.lastStampAt) >= 750;
  const progress = view ? Math.min(100, view.totalForms / view.goal * 100) : 0;
  const milestone = view ? milestones.find((target) => target > view.totalForms) ?? view.goal : milestones[0]!;
  const milestoneStart = milestones[milestones.indexOf(milestone) - 1] ?? 0;
  const milestoneProgress = view ? Math.min(milestone - milestoneStart, Math.max(0, view.totalForms - milestoneStart)) : 0;
  const recentContributions = view?.players.filter((entry) => entry.lastContribution)
    .sort((left, right) => Date.parse(right.lastContribution!.at) - Date.parse(left.lastContribution!.at)).slice(0, 3) ?? [];

  return <div className="approval-desk-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="approval-desk-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Approval Desk" tabIndex={-1}>
      <header className="approval-desk-header">
        <div className="approval-desk-title"><span className="approval-desk-title-icon"><ClipboardCheck size={22} aria-hidden="true" /></span><h2>Approval Desk</h2></div>
        <IconButton label="Close" icon={X} onClick={onClose} />
      </header>

      {error && <p className="approval-desk-error" role="alert">{error} {view && <button type="button" onClick={() => void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not refresh."))}>Retry</button>}</p>}
      {!view ? <div className="approval-desk-loading" role="status">Loading…</div> : <div className="approval-desk-content">
        <section className="approval-desk-overview" aria-label="Department progress">
          <div className="approval-desk-tally">
            <span>Shared goal</span>
            <strong><span key={view.totalForms} className="approval-desk-number">{view.totalForms.toLocaleString()}</span><small> / {view.goal.toLocaleString()} forms</small></strong>
            <div className="approval-desk-milestone"><span>{progress >= 100 ? "Goal reached" : `Next milestone: ${milestone.toLocaleString()}`}</span><strong>{progress >= 100 ? "100%" : `${Math.round(milestoneProgress / (milestone - milestoneStart) * 100)}%`}</strong></div>
            <progress max={milestone - milestoneStart} value={milestoneProgress} aria-label={`Progress toward ${milestone.toLocaleString()} forms`} />
          </div>
          <div className="approval-desk-stat"><span>Your forms</span><strong key={player!.forms} className="approval-desk-number">{player!.forms.toLocaleString()}</strong></div>
          <div className="approval-desk-stat approval-desk-coin-stat"><span>Coins</span><strong><Coins size={19} aria-hidden="true" />{view.balance.toLocaleString()}</strong><small>{view.earnedToday}/{view.dailyCoinCap} earned today</small></div>
        </section>

        <div className="approval-desk-playfield">
          <ApprovalDeskScene levels={player!.levels} working={Boolean(activeCase && !ready)} ready={ready} feedback={feedback} />
          <div className="approval-desk-actions">
            <section className="approval-desk-section approval-desk-case-section" data-guide="desk-case" data-guide-case-active={Boolean(activeCase)}>
              <div className="approval-desk-section-heading"><h3>Cases</h3>{feedback?.kind === "collect" && <span className="approval-desk-action-feedback" role="status" key={feedback.id}>{feedback.label}</span>}</div>
              {activeCase ? <div className={`approval-desk-active-case${ready ? " is-ready" : ""}`}>
                <div className="approval-desk-case-topline"><strong>{APPROVAL_CASES.find((item) => item.id === activeCase.id)!.name}</strong><span>{ready ? "Ready" : "In progress"}</span></div>
                <div className="approval-desk-case-time"><Clock3 size={19} aria-hidden="true" />{ready ? "Collect your reward" : formatDuration(remaining)}</div>
                <progress max={Date.parse(activeCase.readyAt) - Date.parse(activeCase.startedAt)} value={Math.max(0, serverClock - Date.parse(activeCase.startedAt))} aria-label="Case progress" />
                <div className="approval-desk-reward"><span>+{approvalCaseOutput(activeCase.id, player!.levels).toLocaleString()} forms</span><span><Coins size={14} aria-hidden="true" />+{Math.min(approvalCaseCoins(activeCase.id, player!.levels.printer), view.dailyCoinCap - view.earnedToday)}</span></div>
                {ready && <button type="button" className="approval-desk-collect" disabled={pending} onClick={() => void act({ action: "collect" })}>Collect case<ArrowRight size={18} aria-hidden="true" /></button>}
              </div> : <div className="approval-desk-cases" data-guide="desk-cases">
                {APPROVAL_CASES.map((item) => {
                  const CaseIcon = caseIcons[item.id];
                  return <button type="button" key={item.id} disabled={pending} aria-label={`Start ${item.name}, ${formatDuration(approvalCaseDurationMs(item.id, player!.levels.routing))}`} onClick={() => void act({ action: "start", caseId: item.id })}>
                    <span className="approval-desk-case-icon"><CaseIcon size={19} aria-hidden="true" /></span>
                    <span className="approval-desk-case-copy"><strong>{item.name}</strong><small><Clock3 size={13} aria-hidden="true" />{formatDuration(approvalCaseDurationMs(item.id, player!.levels.routing))}</small></span>
                    <span className="approval-desk-case-output"><strong>+{approvalCaseOutput(item.id, player!.levels).toLocaleString()} forms</strong><small><Coins size={13} aria-hidden="true" />+{Math.max(0, Math.min(approvalCaseCoins(item.id, player!.levels.printer), view.dailyCoinCap - view.earnedToday))} coins</small></span>
                    <span className="approval-desk-case-start">Start {item.name}<ArrowRight size={16} aria-hidden="true" /></span>
                  </button>;
                })}
              </div>}
            </section>

            <section className="approval-desk-stamping">
              <div><h3>Stamp forms</h3><span>+{1 + player!.levels.stamp * 2} per stamp</span></div>
              {feedback?.kind === "stamp" && <span className="approval-desk-stamp-feedback" role="status" key={feedback.id}>{feedback.label}</span>}
              <button type="button" className="approval-desk-stamp" data-guide="desk-stamp" disabled={pending || !stampReady} onClick={() => void act({ action: "stamp" })}><Stamp size={24} aria-hidden="true" />Stamp</button>
            </section>
          </div>
        </div>

        <section className="approval-desk-upgrades">
          <h3>Upgrades</h3>
          <div className="approval-desk-upgrade-list">{APPROVAL_UPGRADES.map((item) => {
            const level = player!.levels[item.id];
            const cost = approvalUpgradeCost(item.id, level);
            const maxed = level >= 8;
            const UpgradeIcon = upgradeIcons[item.id];
            return <div className={`approval-desk-upgrade${feedback?.upgradeId === item.id ? " is-purchased" : ""}`} data-upgrade={item.id} key={item.id}>
              <div className="approval-desk-upgrade-icon"><UpgradeIcon size={21} aria-hidden="true" /></div>
              <div className="approval-desk-upgrade-copy"><strong>{item.name}</strong><small>{upgradeEffect(item.id, player!.levels, activeCase?.id ?? "memo")}</small><div className="approval-desk-upgrade-level" aria-label={`Level ${level} of 8`}>{Array.from({ length: 8 }, (_, index) => <span key={index} className={index < level ? "is-filled" : ""} />)}</div></div>
              <div className="approval-desk-upgrade-purchase"><span aria-live="polite">{feedback?.upgradeId === item.id ? `Level ${level} purchased` : `Level ${level}/8`}</span><button type="button" disabled={pending || maxed || view.balance < cost} aria-label={maxed ? `${item.name} maxed` : `Buy ${item.name} for ${cost.toLocaleString()} coins${view.balance < cost ? `, need ${(cost - view.balance).toLocaleString()} more` : ""}`} onClick={() => void act({ action: "buy", upgradeId: item.id, expectedLevel: level })}>{maxed ? "Maxed" : <>Buy <Coins size={14} aria-hidden="true" />{cost.toLocaleString()}</>}</button></div>
            </div>;
          })}</div>
        </section>

        <section className="approval-desk-people">
          <div className="approval-desk-section-heading"><h3>Everyone's desks</h3><button type="button" aria-label="Refresh progress" onClick={() => void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not refresh."))}><RefreshCw size={16} /></button></div>
          <ol>{view.players.map((entry) => <li key={entry.userId}><span className="approval-desk-person-avatar">{entry.name.slice(0, 1).toUpperCase()}</span><span>{entry.userId === currentUserId ? "You" : entry.name}</span><small>Level {entry.level}</small><strong>{entry.forms.toLocaleString()} forms</strong></li>)}</ol>
          {recentContributions.length > 0 && <div className="approval-desk-recent"><h4>Recent contributions</h4><ul>{recentContributions.map((entry) => <li key={entry.userId}><span>{entry.userId === currentUserId ? "You" : entry.name}</span><strong>+{entry.lastContribution!.forms.toLocaleString()}</strong><time dateTime={entry.lastContribution!.at}>{formatRelativeTime(Date.parse(entry.lastContribution!.at), serverClock)}</time></li>)}</ul></div>}
        </section>
      </div>}
    </div>
  </div>;
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function formatRelativeTime(timestamp: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function upgradeEffect(id: ApprovalUpgradeId, levels: ApprovalDeskView["player"]["levels"], caseId: ApprovalCaseId): string {
  const maxed = levels[id] >= 8;
  const next = { ...levels, [id]: levels[id] + 1 };
  if (id === "stamp") return maxed ? `+${1 + levels.stamp * 2} per stamp` : `+${1 + levels.stamp * 2} → +${1 + next.stamp * 2} per stamp`;
  const caseName = APPROVAL_CASES.find((item) => item.id === caseId)!.name;
  if (id === "printer") return `${caseName}: +${approvalCaseCoins(caseId, levels.printer)}${maxed ? "" : ` → +${approvalCaseCoins(caseId, next.printer)}`} coins`;
  if (id === "routing") return `${caseName}: ${formatDuration(approvalCaseDurationMs(caseId, levels.routing))}${maxed ? "" : ` → ${formatDuration(approvalCaseDurationMs(caseId, next.routing))}`}`;
  return `${caseName}: +${approvalCaseOutput(caseId, levels)}${maxed ? "" : ` → +${approvalCaseOutput(caseId, next)}`} forms`;
}
