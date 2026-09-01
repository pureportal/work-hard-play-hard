import {
  Building2,
  Gamepad2,
  LogOut,
  MessageCircle,
  PencilRuler,
  Users,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { IconButton } from "./IconButton";

export type WorkspacePanel = "people" | "chat" | "meetings" | "games" | "build" | null;

interface NavRailProps {
  activePanel: WorkspacePanel;
  canEdit: boolean;
  currentUser: { initials: string; color: string };
  onChange: (panel: WorkspacePanel) => void;
  onSignOut: () => Promise<void>;
}

const items: { panel: Exclude<WorkspacePanel, null>; label: string; icon: LucideIcon }[] = [
  { panel: "people", label: "People", icon: Users },
  { panel: "chat", label: "Messages", icon: MessageCircle },
  { panel: "meetings", label: "Meetings", icon: Video },
  { panel: "games", label: "Games", icon: Gamepad2 },
  { panel: "build", label: "Build", icon: PencilRuler },
];

export function NavRail({ activePanel, canEdit, currentUser, onChange, onSignOut }: NavRailProps) {
  return (
    <nav className="nav-rail" aria-label="Workspace">
      <button className="brand-mark" aria-label="Office" onClick={() => onChange(null)}>
        <Building2 size={21} strokeWidth={2.1} />
      </button>
      <div className="nav-rail-items">
        {items.map(({ panel, label, icon }) => {
          if (panel === "build" && !canEdit) {
            return null;
          }
          return (
            <IconButton
              key={panel}
              label={label}
              icon={icon}
              className={activePanel === panel ? "active" : ""}
              aria-pressed={activePanel === panel}
              onClick={() => onChange(activePanel === panel ? null : panel)}
            />
          );
        })}
      </div>
      <div className="nav-rail-bottom">
        <IconButton label="Sign out" icon={LogOut} onClick={() => void onSignOut()} />
        <button
          className="nav-avatar"
          aria-label="Account"
          style={{ background: currentUser.color }}
          onClick={() => onChange("people")}
        >
          {currentUser.initials}
        </button>
      </div>
    </nav>
  );
}
