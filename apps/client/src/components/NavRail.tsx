import {
  LogOut,
  Network,
  MessageCircle,
  PencilRuler,
  Settings,
  Users,
  Video,
  ClipboardCheck,
  Stamp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CorporateIdentity, Member } from "@workhard/shared";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";
import { BrandMark } from "./BrandMark";

export type WorkspacePanel = "people" | "chat" | "meetings" | "build" | "settings" | "organisation" | "rooms" | "approvals" | "approvalDesk" | "admin" | null;

interface NavRailProps {
  activePanel: WorkspacePanel;
  corporateIdentity: CorporateIdentity;
  canUseBuild: boolean;
  approvalDeskEnabled?: boolean;
  currentUser: Member;
  unreadMessages: number;
  pendingApprovals?: number;
  onChange: (panel: WorkspacePanel) => void;
  onAvatarClick: () => void;
  onSignOut: () => Promise<void>;
}

const items: { panel: Exclude<WorkspacePanel, null>; label: string; icon: LucideIcon }[] = [
  { panel: "people", label: "People", icon: Users },
  { panel: "approvalDesk", label: "Approval Desk", icon: Stamp },
  { panel: "build", label: "Build", icon: PencilRuler },
  { panel: "approvals", label: "Approvals", icon: ClipboardCheck },
  { panel: "chat", label: "Messages", icon: MessageCircle },
  { panel: "meetings", label: "Meetings", icon: Video },
  { panel: "organisation", label: "Organisation", icon: Network },
  { panel: "settings", label: "Settings", icon: Settings },
];

export function NavRail({ activePanel, corporateIdentity, canUseBuild, approvalDeskEnabled = false, currentUser, unreadMessages, pendingApprovals = 0, onChange, onAvatarClick, onSignOut }: NavRailProps) {
  return (
    <nav className="nav-rail" aria-label="Workspace">
      <span className="nav-item brand-nav-item">
        <button className="brand-mark" aria-label={`${corporateIdentity.applicationName} office`} onClick={() => onChange(null)}>
          <BrandMark identity={corporateIdentity} size={23} />
        </button>
        <span className="nav-tooltip" aria-hidden="true">Office</span>
      </span>
      <div className="nav-rail-items">
        {items.map(({ panel, label, icon }) => {
          if (panel === "build" && !canUseBuild) {
            return null;
          }
          if (panel === "approvalDesk" && !approvalDeskEnabled) return null;
          const unread = panel === "chat" ? unreadMessages : panel === "approvals" ? pendingApprovals : 0;
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
