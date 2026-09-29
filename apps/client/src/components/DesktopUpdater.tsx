import { useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleAlert, Download, RotateCw } from "lucide-react";
import { version as clientVersion } from "../../package.json";
import { fetchServerVersion } from "../api";
import { isNativeClient } from "../native-client";

const CHECK_INTERVAL_MS = 5 * 60_000;
const RELEASE_BASE = "https://github.com/pureportal/work-hard-play-hard/releases/tag";

type UpdateProgress =
  | { phase: "downloading"; downloaded: number; total: number | null }
  | { phase: "installing" };

type UpdateState = {
  version: string;
  phase: "checking" | "downloading" | "installing" | "failed";
  downloaded?: number;
  total?: number | null;
  failedDuringInstall?: boolean;
};

export function DesktopUpdater() {
  const [state, setState] = useState<UpdateState>();
  const retryRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!isNativeClient() || !import.meta.env.PROD || /Android|iPhone|iPad/i.test(navigator.userAgent)) return;

    let active = true;
    let busy = false;
    let failedVersion: string | undefined;
    let controller: AbortController | undefined;
    let updateId: string | undefined;
    const check = async (retry = false) => {
      if (!active || busy || document.visibilityState === "hidden") return;
      busy = true;
      controller = new AbortController();
      let targetVersion: string | undefined;
      try {
        const version = await fetchServerVersion(controller.signal);
        if (!active || controller.signal.aborted) return;
        if (version === clientVersion) {
          failedVersion = undefined;
          setState(undefined);
          return;
        }
        if (!retry && version === failedVersion) return;
        targetVersion = version;
        setState({ version, phase: "checking" });

        const onProgress = new Channel<UpdateProgress>();
        onProgress.onmessage = (progress) => {
          if (active) setState((current) => current?.version === version && current.phase !== "failed"
            ? { ...current, ...progress }
            : current);
        };
        updateId = crypto.randomUUID();
        const updated = await invoke<boolean>("update_desktop", { version, updateId, onProgress });
        if (active && !updated) {
          failedVersion = undefined;
          setState(undefined);
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          console.error("Desktop update failed.", error);
          if (targetVersion) {
            failedVersion = targetVersion;
            setState((current) => current && {
              ...current,
              failedDuringInstall: current.phase === "installing",
              phase: "failed",
            });
          }
        }
      } finally {
        busy = false;
        controller = undefined;
        updateId = undefined;
      }
    };
    retryRef.current = () => void check(true);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    const onOnline = () => void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    window.addEventListener("online", onOnline);
    window.addEventListener("northstar:server-reconnected", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    void check();
    return () => {
      active = false;
      controller?.abort();
      if (updateId) void invoke("cancel_desktop_update", { updateId }).catch((error) => {
        console.error("Could not cancel the desktop update.", error);
      });
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("northstar:server-reconnected", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      retryRef.current = undefined;
    };
  }, []);

  if (!state) return null;

  const percent = state.phase === "downloading" && state.total && state.total > 0
    ? Math.min(100, Math.floor((state.downloaded ?? 0) / state.total * 100))
    : undefined;
  const title = state.phase === "failed"
    ? state.failedDuringInstall ? `Couldn’t install v${state.version}` : `Update to v${state.version} failed`
    : state.phase === "installing" ? `Installing v${state.version}`
      : state.phase === "downloading" ? `Downloading v${state.version}`
        : `Checking v${state.version}`;

  return <div className={`desktop-update desktop-update--${state.phase}`} role={state.phase === "failed" ? "alert" : "status"}>
    <div className="desktop-update__icon" aria-hidden="true">
      {state.phase === "failed" ? <CircleAlert size={20} />
        : state.phase === "installing" ? <RotateCw size={20} /> : <Download size={20} />}
    </div>
    <div className="desktop-update__body">
      <div className="desktop-update__heading">
        <strong>{title}</strong>
        {percent !== undefined && <span aria-live="off">{percent}%</span>}
      </div>
      {state.phase === "failed" ? <>
        {state.failedDuringInstall && <p>Check system permissions, then retry.</p>}
        <div className="desktop-update__actions">
          <button type="button" onClick={() => retryRef.current?.()}>Retry</button>
          <button type="button" onClick={() => void openUrl(`${RELEASE_BASE}/v${encodeURIComponent(state.version)}`).catch((error) => {
            console.error("Could not open the release page.", error);
          })}>Download manually</button>
        </div>
      </> : <>
        <div className={`desktop-update__track${percent === undefined ? " is-indeterminate" : ""}`}
          role="progressbar" aria-label="Update progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span style={percent === undefined ? undefined : { width: `${percent}%` }} />
        </div>
        {state.phase === "downloading" && percent === undefined && Boolean(state.downloaded) &&
          <span className="desktop-update__received">{((state.downloaded ?? 0) / 1_048_576).toFixed(1)} MB downloaded</span>}
      </>}
    </div>
  </div>;
}
