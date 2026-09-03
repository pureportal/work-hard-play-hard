import {
  LogOut,
  MessageCircle,
  PencilRuler,
  Settings,
  Users,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Member } from "@workhard/shared";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";
import { NorthstarMark } from "./NorthstarMark";

export type WorkspacePanel = "people" | "chat" | "meetings" | "build" | "settings" | null;

interface NavRailProps {
  activePanel: WorkspacePanel;
  canUseBuild: boolean;
  currentUser: Member;
  unreadMessages: number;
  onChange: (panel: WorkspacePanel) => void;
  onAvatarClick: () => void;
  onSignOut: () => Promise<void>;
}

const items: { panel: Exclude<WorkspacePanel, null>; label: string; icon: LucideIcon }[] = [
  { panel: "people", label: "People", icon: Users },
  { panel: "chat", label: "Messages", icon: MessageCircle },
  { panel: "meetings", label: "Meetings", icon: Video },
  { panel: "build", label: "Build", icon: PencilRuler },
  { panel: "settings", label: "Settings", icon: Settings },
];

export function NavRail({ activePanel, canUseBuild, currentUser, unreadMessages, onChange, onAvatarClick, onSignOut }: NavRailProps) {
  return (
    <nav className="nav-rail" aria-label="Workspace">
      <span className="nav-item brand-nav-item">
        <button className="brand-mark" aria-label="Office" onClick={() => onChange(null)}>
          <NorthstarMark size={23} />
        </button>
        <span className="nav-tooltip" aria-hidden="true">Office</span>
      </span>
      <div className="nav-rail-items">
        {items.map(({ panel, label, icon }) => {
          if (panel === "build" && !canUseBuild) {
            return null;
          }
          const unread = panel === "chat" ? unreadMessages : 0;
          return (
            <span className="nav-item" key={panel}>
              <IconButton
                label={label}
                icon={icon}
                className={activePanel === panel ? "active" : ""}
                aria-pressed={activePanel === panel}
                aria-describedby={unread > 0 ? `nav-${panel}-unread` : undefined}
                onClick={() => onChange(activePanel === panel ? null : panel)}
              />
              {unread > 0 && (
                <span className="nav-unread" id={`nav-${panel}-unread`}>
                  <span aria-hidden="true">{unread > 9 ? "9+" : unread}</span>
                  <span className="sr-only">{unread} unread</span>
                </span>
              )}
              <span className="nav-tooltip" aria-hidden="true">{label}</span>
            </span>
          );
        })}
      </div>
      <div className="nav-rail-bottom">
        <span className="nav-item">
          <IconButton label="Sign out" icon={LogOut} onClick={() => void onSignOut()} />
          <span className="nav-tooltip" aria-hidden="true">Sign out</span>
        </span>
        <span className="nav-item">
          <button
            className="nav-avatar-button"
            aria-label="Customize avatar"
            onClick={onAvatarClick}
          >
            <Avatar member={currentUser} className="nav-avatar" />
          </button>
          <span className="nav-tooltip" aria-hidden="true">Customize avatar</span>
        </span>
      </div>
    </nav>
  );
}
