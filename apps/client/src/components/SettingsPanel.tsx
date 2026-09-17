import { ServerCog } from "lucide-react";
import type { Member, PlayerKidnappingSettings } from "@workhard/shared";
import { SurfaceHeader } from "./SurfaceHeader";
import { SpotifySettings } from "../spotify/SpotifySettings";
import { GitHubConnection } from "../github/GitHubConnection";
import { PolicyEditor } from "./PolicyEditor";
import { ServerConnectionForm } from "./ServerConnectionForm";
import { getServerOrigin } from "../server-url";

export function SettingsPanel({ members, currentUserId, playerSettings, onPlayerChange, onServerSettings, onServerChanged, onClose }: {
  members: Member[]; currentUserId: string; playerSettings: PlayerKidnappingSettings;
  onPlayerChange: (settings: PlayerKidnappingSettings) => void; onServerSettings?: (() => void) | undefined; onClose: () => void;
  onServerChanged?: (() => void) | undefined;
}) {
  return <aside className="side-panel settings-panel" aria-label="Settings">
    <SurfaceHeader className="panel-header" title="Settings" onClose={onClose} />
    <div className="panel-scroll settings-panel-scroll">
      {onServerChanged && <details className="settings-section">
        <summary>Server: {new URL(getServerOrigin()!).host}</summary>
        <ServerConnectionForm onConnected={onServerChanged} />
      </details>}
      {onServerSettings && <button className="secondary-button server-settings-entry" onClick={onServerSettings}><ServerCog size={18} />Server settings</button>}
      <SpotifySettings />
      <GitHubConnection />
      <section className="settings-section"><h3>Interactions</h3><PolicyEditor label="Who can carry you" policy={playerSettings.carrierPolicy}
        members={members.filter((member) => member.id !== currentUserId)} onChange={(carrierPolicy) => onPlayerChange({ carrierPolicy })} /></section>
    </div>
  </aside>;
}
