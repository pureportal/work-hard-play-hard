import { ArrowLeft, ArrowRight, Check, CircleHelp, Compass, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Joyride, EVENTS, type TooltipRenderProps } from "react-joyride";
import type { GameGuideStatus } from "@workhard/shared";
import { getServerOrigin } from "../../server-url";
import { useModalFocus } from "../../hooks/useModalFocus";
import { IconButton } from "../IconButton";
import { createGuideSteps, dailyGuideContent, type GuideData, type GuideScreen, type GuideStep } from "./guide-steps";
import { waitForGuideTarget } from "./wait-for-guide-target";
import { useGuideProgress } from "./useGuideProgress";
import "./game-guide.css";

interface GameGuideProps {
  data: GuideData;
  floorId: string;
  grantedRoomIds: Set<string>;
  unavailable: string | undefined;
  onStart: () => void;
  onNavigate: (screen: GuideScreen) => void;
  onFinish: () => void;
  onProgressLoaded?: (status: GameGuideStatus | null) => void;
}

export function GameGuide(props: GameGuideProps) {
  const key = `game-guide:${getServerOrigin()}:${props.data.currentUserId}`;
  return <PlayerGameGuide key={key} {...props} />;
}

function PlayerGameGuide(props: GameGuideProps) {
  const progress = useGuideProgress();
  const attempted = useRef(false);
  const reportedProgress = useRef(false);
  const [steps, setSteps] = useState<GuideStep[]>();
  const active = steps !== undefined;
  const [error, setError] = useState<string>();
  const callbacks = useRef(props);
  callbacks.current = props;
  useEffect(() => {
    if (progress.loading || progress.status === undefined || reportedProgress.current) return;
    reportedProgress.current = true;
    callbacks.current.onProgressLoaded?.(progress.status);
  }, [progress.loading, progress.status]);
  const running = useRef(false);
  const transition = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => {
    running.current = false;
    transition.current?.abort();
  }, []);
  const finish = (status: GameGuideStatus = "skipped") => {
    if (!running.current) return;
    running.current = false;
    progress.save(status);
    transition.current?.abort();
    setSteps(undefined);
    callbacks.current.onFinish();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const loading = useCallback(() => <GuideLoading onClose={() => finishRef.current()} />, []);
  useEffect(() => {
    if (!active) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finishRef.current();
    };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, [active]);
  useEffect(() => {
    if (props.unavailable) finishRef.current("started");
  }, [props.unavailable]);
  const start = () => {
    if (props.unavailable || progress.loading || running.current) return;
    attempted.current = true;
    progress.save("started");
    setError(undefined);
    props.onStart();
    running.current = true;
    transition.current = new AbortController();
    const signal = transition.current.signal;
    setSteps(createGuideSteps(props.data, props.floorId, props.grantedRoomIds).map(step => ({
      ...step,
      before: async () => {
        if (signal.aborted) return;
        callbacks.current.onNavigate(step.screen);
        await waitForGuideTarget(step.target, signal);
      },
    })));
  };
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (props.unavailable || progress.loading || progress.status !== null || attempted.current) return;
    const frame = requestAnimationFrame(() => {
      if (attempted.current) return;
      startRef.current();
    });
    return () => cancelAnimationFrame(frame);
  }, [props.unavailable, progress.loading, progress.status]);
  return <>
    <button type="button" className="secondary-button game-guide-button" data-guide="help" aria-label="How to play" onClick={start}
      disabled={Boolean(props.unavailable) || progress.loading || active} title={props.unavailable ?? "How to play"}>
      <CircleHelp size={18} aria-hidden="true" /><span>How to play</span>
    </button>
    {(error || progress.error) && createPortal(<div className="guide-notice" role="alert"><span>{error ?? progress.error}</span>
      {!error && progress.error && <button className="secondary-button" onClick={progress.retry}>Retry</button>}
      <IconButton label="Dismiss guide error" icon={X} onClick={() => { setError(undefined); progress.dismissError(); }} /></div>, document.body)}
    {steps && <Joyride continuous run steps={steps.map(step => step.id === "daily" ? { ...step, content: dailyGuideContent(props.data.economy.dailyReward) } : step)} tooltipComponent={GuideTooltip} loaderComponent={loading}
      styles={{ floater: { transition: "none" } }}
      floatingOptions={{ strategy: "fixed", shiftOptions: { boundary: [], rootBoundary: "viewport", crossAxis: true, padding: 12 },
        flipOptions: { boundary: [], rootBoundary: "viewport", crossAxis: true, padding: 12 } }}
      options={{ skipBeacon: true, blockTargetInteraction: true, closeButtonAction: "skip", dismissKeyAction: false,
        overlayClickAction: "close", beforeTimeout: 9000, targetWaitTimeout: 8000, scrollDuration: 0, spotlightPadding: 6, spotlightRadius: 12,
        backgroundColor: "var(--panel-strong)", arrowColor: "var(--panel-strong)", primaryColor: "var(--accent)", textColor: "var(--ink)",
        overlayColor: "rgba(18, 17, 25, 0.48)", zIndex: 2000, width: "min(340px, calc(100vw - 24px))", disableFocusTrap: true }}
      locale={{ back: "Back", next: "Next", last: "Let’s play", close: "Skip guide", skip: "Skip guide" }}
      onEvent={event => {
        if (!running.current) return;
        if (event.type === EVENTS.TOUR_END || event.action === "close") finish(event.status === "finished" ? "completed" : "skipped");
        if (event.type === EVENTS.TARGET_NOT_FOUND || event.type === EVENTS.ERROR) {
          setError("The guide could not open this screen. Try How to play again.");
          finish("started");
        }
      }} />}
  </>;
}

function GuideLoading({ onClose }: { onClose: () => void }) {
  const ref = useModalFocus<HTMLDivElement>(onClose);
  return <div ref={ref} tabIndex={-1} className="guide-notice guide-loading" role="dialog" aria-label="Opening guide">
    <span role="status">Opening guide…</span><button className="secondary-button" onClick={onClose}>Skip guide</button>
  </div>;
}

function GuideTooltip({ backProps, closeProps, controls, index, isLastStep, primaryProps, size, step, tooltipProps }: TooltipRenderProps) {
  const interactive = step.blockTargetInteraction === false;
  const requiresAction = step.id === "desk-stamp" || step.id === "desk-case";
  const [actionDone, setActionDone] = useState(false);
  const ref = useModalFocus<HTMLDivElement>(() => controls.skip(), true, !interactive);
  useEffect(() => {
    if (!requiresAction) return;
    setActionDone(step.id === "desk-case" && document.querySelector('[data-guide="desk-case"]')?.getAttribute("data-guide-case-active") === "true");
    const eventName = step.id === "desk-stamp" ? "approval-desk:stamp" : "approval-desk:start";
    const complete = () => setActionDone(true);
    window.addEventListener(eventName, complete);
    return () => window.removeEventListener(eventName, complete);
  }, [requiresAction, step.id]);
  useEffect(() => {
    if (!interactive || typeof step.target !== "string") return;
    const selector = step.target;
    const cycleFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const target = document.querySelector(selector);
      const buttons = [
        ...ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
        ...target?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
      ].filter(button => button.getClientRects().length > 0);
      if (!buttons.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const current = buttons.findIndex(button => button === document.activeElement);
      const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
        : (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    };
    document.addEventListener("keydown", cycleFocus, true);
    return () => document.removeEventListener("keydown", cycleFocus, true);
  }, [interactive, ref, step.target]);
  return <div {...tooltipProps} ref={ref} tabIndex={-1} className="game-guide-tooltip" data-guide-step={step.id}
    aria-modal={!interactive} aria-labelledby="game-guide-title" aria-describedby="game-guide-content">
    <header className="guide-heading">
      <span className="guide-icon" aria-hidden="true"><Compass size={22} strokeWidth={1.8} /></span>
      <h2 id="game-guide-title">{step.title}</h2>
      <button {...closeProps} className="guide-skip">Skip</button>
    </header>
    <div id="game-guide-content" className="guide-content">{step.content}</div>
    <footer className="guide-footer">
      <div className="guide-progress" role="progressbar" aria-label="Guide progress" aria-valuemin={1} aria-valuemax={size} aria-valuenow={index + 1} aria-valuetext={`Step ${index + 1} of ${size}`}>
        <span aria-hidden="true"><strong>{index + 1}</strong> / {size}</span>
        <div className="guide-progress-track" aria-hidden="true">
          {Array.from({ length: size }, (_, position) => <span key={position} className={position <= index ? "is-reached" : undefined} />)}
        </div>
      </div>
      {index > 0 && <button {...backProps} className="guide-back"><ArrowLeft size={16} aria-hidden="true" />Back</button>}
      <button {...primaryProps} disabled={requiresAction && !actionDone} className="guide-next">{isLastStep ? "Let’s play" : "Next"}
        {isLastStep ? <Check size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
      </button>
    </footer>
  </div>;
}
