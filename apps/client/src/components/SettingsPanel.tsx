import { useEffect, useState } from "react";
import { ServerCog } from "lucide-react";
import type { Member, PlayerKidnappingSettings } from "@workhard/shared";
import { version as clientVersion } from "../../package.json";
import { fetchServerVersion } from "../api";
import { SurfaceHeader } from "./SurfaceHeader";
import { SpotifySettings } from "../spotify/SpotifySettings";
import { GitHubConnection } from "../github/GitHubConnection";
import { PolicyEditor } from "./PolicyEditor";
import { ServerConnectionForm } from "./ServerConnectionForm";
import { getServerOrigin } from "../server-url";

export function SettingsPanel({ onRescue, connected, members, currentUserId, playerSettings, onPlayerChange, onServerSettings, onServerChanged, onClose }: {
  onRescue: () => void; connected: boolean;
  members: Member[]; currentUserId: string; playerSettings: PlayerKidnappingSettings;
  onPlayerChange: (settings: PlayerKidnappingSettings) => void; onServerSettings?: (() => void) | undefined; onClose: () => void;
  onServerChanged?: (() => void) | undefined;
}) {
  const [serverVersion, setServerVersion] = useState<string | null>();

  useEffect(() => {
    const controller = new AbortController();
    void fetchServerVersion(controller.signal)
      .then((version) => {
        if (!controller.signal.aborted) setServerVersion(version);
      })
      .catch(() => {
        if (!controller.signal.aborted) setServerVersion(null);
      });
    return () => controller.abort();
  }, [connected]);

  return <aside className="side-panel settings-panel" aria-label="Settings">
    <SurfaceHeader className="panel-header" title="Settings" onClose={onClose} />
    <div className="panel-scroll settings-panel-scroll">
      {onServerChanged && <details className="settings-section">
        <summary>Server: {new URL(getServerOrigin()!).host}</summary>
        <ServerConnectionForm onConnected={onServerChanged} />
      </details>}
      {onServerSettings && <button className="secondary-button server-settings-entry" onClick={onServerSettings}><ServerCog size={18} />Server settings</button>}
      <button className="secondary-button" disabled={!connected} onClick={onRescue}>Rescue Me</button>
      <SpotifySettings />
      <GitHubConnection />
      <section className="settings-section"><h3>Interactions</h3><PolicyEditor label="Who can carry you" policy={playerSettings.carrierPolicy}
        members={members.filter((member) => member.id !== currentUserId)} onChange={(carrierPolicy) => onPlayerChange({ carrierPolicy })} /></section>
    </div>
    <dl className="settings-versions">
      <dt>Client</dt><dd>v{clientVersion}</dd>
      <dt>Server</dt><dd>{serverVersion === null ? "Unavailable" : serverVersion ? `v${serverVersion}` : "Loading…"}</dd>
    </dl>
  </aside>;
}
