import { DAILY_REWARD_AMOUNTS, type DailyRewardStatus } from "@workhard/shared";
import { Check, Coins, Flame, Gift, Sparkles, X } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "../../hooks/useModalFocus";
import "./daily-bonus.css";

interface DailyBonusDialogProps {
  reward: DailyRewardStatus;
  pending: boolean;
  online: boolean;
  error: string | undefined;
  onClaim: () => void;
  onClose: () => void;
}

export function DailyBonusDialog({ reward, pending, online, error, onClaim, onClose }: DailyBonusDialogProps) {
  const titleId = useId();
  const dialogRef = useModalFocus<HTMLDialogElement>(onClose);
  const [wasClaimable] = useState(reward.claimable);
  const celebrated = wasClaimable && !reward.claimable;
  const day = Math.max(1, reward.streak + (reward.claimable ? 1 : 0));
  const amount = reward.claimable ? reward.amount : DAILY_REWARD_AMOUNTS[Math.min(day, DAILY_REWARD_AMOUNTS.length) - 1]!;
  const closeRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    closeRef.current?.focus({ preventScroll: true });
    return () => dialog.close();
  }, [dialogRef]);

  return createPortal(<dialog ref={dialogRef} tabIndex={-1} aria-modal="true" aria-labelledby={titleId}
    className={`daily-bonus-dialog${celebrated ? " is-celebrating" : ""}`}
    onKeyDown={event => {
      if (event.key === "Tab") return;
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    }}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="daily-bonus-content">
      <button ref={closeRef} type="button" className="daily-bonus-close" aria-label="Close daily bonus" onClick={onClose}><X size={20} /></button>
      <div className="daily-bonus-art" aria-hidden="true">
        <div className="daily-bonus-orbit" />
        <Sparkles className="daily-bonus-spark daily-bonus-spark-one" size={30} />
        <Sparkles className="daily-bonus-spark daily-bonus-spark-two" size={20} />
        <div className="daily-bonus-gift"><Gift size={76} strokeWidth={1.7} /></div>
        <span className="daily-bonus-coin daily-bonus-coin-one"><Coins size={23} /></span>
        <span className="daily-bonus-coin daily-bonus-coin-two"><Coins size={19} /></span>
        {celebrated && <div className="daily-bonus-confetti">{Array.from({ length: 16 }, (_, index) =>
          <i key={index} style={{ "--piece": index } as CSSProperties} />)}</div>}
      </div>
      <h2 id={titleId}>Daily bonus</h2>
      <div className="daily-bonus-reward" role="status" aria-live="polite">
        <strong>+{amount}<span>coins</span></strong>
        {!reward.claimable && <span>In your pocket!</span>}
      </div>
      <div className="daily-bonus-streak"><Flame size={18} aria-hidden="true" />{reward.streak > 0 ? `${reward.streak}-day streak` : "Start your streak"}</div>
      <ol className="daily-bonus-days" aria-label="Daily rewards">
        {DAILY_REWARD_AMOUNTS.map((coins, index) => {
          const current = index === Math.min(day, DAILY_REWARD_AMOUNTS.length) - 1;
          const completed = index < reward.streak && !(current && reward.claimable);
          return <li key={coins} className={`${current ? "is-current" : ""} ${completed ? "is-complete" : ""}`}
            aria-current={current ? "step" : undefined} aria-label={`Day ${index + 1}${index === 6 ? " and beyond" : ""}: ${coins} coins${completed ? ", claimed" : ""}`}>
            <span>Day {index + 1}{index === 6 ? "+" : ""}</span>
            {completed ? <Check size={21} aria-hidden="true" /> : index === 6 ? <Gift size={21} aria-hidden="true" /> : <Coins size={21} aria-hidden="true" />}
            <strong>{coins}</strong>
          </li>;
        })}
      </ol>
      {error && <p className="daily-bonus-error" role="alert">{error}</p>}
      {!online && <p className="daily-bonus-error" role="status">Reconnect to collect your bonus.</p>}
      {reward.claimable ? <button type="button" className="daily-bonus-claim" disabled={pending || !online} onClick={onClaim}>
        <Coins size={20} aria-hidden="true" />{pending ? "Collecting…" : `Claim ${amount} coins`}
      </button> : <button type="button" className="daily-bonus-claim" onClick={onClose}><Check size={20} aria-hidden="true" />Let’s play</button>}
      {!reward.claimable && <p className="daily-bonus-next">Next bonus: {new Date(reward.nextClaimAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</p>}
    </div>
  </dialog>, document.body);
}
