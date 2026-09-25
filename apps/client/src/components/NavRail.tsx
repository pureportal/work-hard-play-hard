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
  MoreHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  { panel: "approvalDesk", label: "Stampworks", icon: Stamp },
  { panel: "build", label: "Build", icon: PencilRuler },
  { panel: "approvals", label: "Approvals", icon: ClipboardCheck },
  { panel: "chat", label: "Messages", icon: MessageCircle },
  { panel: "meetings", label: "Meetings", icon: Video },
  { panel: "organisation", label: "Organisation", icon: Network },
  { panel: "settings", label: "Settings", icon: Settings },
];

export function NavRail({ activePanel, corporateIdentity, canUseBuild, approvalDeskEnabled = false, currentUser, unreadMessages, pendingApprovals = 0, onChange, onAvatarClick, onSignOut }: NavRailProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.innerWidth <= 700);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => { setMobile(window.innerWidth <= 700); if (window.innerWidth > 700) setMoreOpen(false); };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreOpen(false); };
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !mobileNavRef.current?.contains(event.target)) setMoreOpen(false); };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", closeOutside);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", closeOutside); };
  }, [moreOpen]);
  const availableItems = items.filter(({ panel }) => panel !== "approvalDesk" || approvalDeskEnabled).filter(({ panel }) => panel !== "build" || canUseBuild);
  const mobilePrimary = availableItems.filter(({ panel }) => panel === "people" || panel === "approvalDesk" || panel === "build");
  const mobileMore = availableItems.filter(({ panel }) => !mobilePrimary.some((item) => item.panel === panel));
  const navigate = (panel: WorkspacePanel) => { setMoreOpen(false); onChange(activePanel === panel ? null : panel); };
  return (
    <nav className="nav-rail" aria-label="Workspace">
      {mobile && <div className="mobile-nav-items" ref={mobileNavRef}>
        <span className="nav-item"><button className="brand-mark" aria-label="Office" onClick={() => { setMoreOpen(false); onChange(null); }}><BrandMark identity={corporateIdentity} size={23} /></button><span className="nav-tooltip" aria-hidden="true">Office</span></span>
        {mobilePrimary.map(({ panel, label, icon }) => <span className="nav-item" key={panel}>
          <IconButton label={label} icon={icon} className={activePanel === panel ? "active" : ""} aria-pressed={activePanel === panel} onClick={() => navigate(panel)} />
          <span className="nav-tooltip" aria-hidden="true">{label}</span>
        </span>)}
        <span className="nav-item"><IconButton label="More" icon={MoreHorizontal} className={moreOpen || mobileMore.some(({ panel }) => panel === activePanel) ? "active" : ""} aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)} /><span className="nav-tooltip" aria-hidden="true">More</span></span>
        {moreOpen && <div className="mobile-nav-menu" aria-label="More destinations">
          {mobileMore.map(({ panel, label, icon: Icon }) => <button key={panel} type="button" aria-current={activePanel === panel ? "page" : undefined} onClick={() => navigate(panel)}><Icon size={18} />{label}{panel === "chat" && unreadMessages > 0 && <span>{unreadMessages}</span>}{panel === "approvals" && pendingApprovals > 0 && <span>{pendingApprovals}</span>}</button>)}
          <button type="button" onClick={() => { setMoreOpen(false); onAvatarClick(); }}><Avatar member={currentUser} className="nav-avatar" />Customize avatar</button>
          <button type="button" onClick={() => { setMoreOpen(false); void onSignOut(); }}><LogOut size={18} />Sign out</button>
        </div>}
      </div>}
      {!mobile && <>
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
      </>}
    </nav>
  );
}
