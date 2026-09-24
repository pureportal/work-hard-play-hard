import { useState } from "react";
import type { CorporateIdentity, CorporateIdentitySettings, Invitation, Member, MemberRole, RegistrationSettings } from "@workhard/shared";
import { WorkspaceDialog } from "../WorkspaceDialog";
import { DialogTabs } from "../DialogTabs";
import { RegistrationAdminEditor } from "./RegistrationAdminEditor";
import { CorporateIdentityEditor } from "../CorporateIdentityEditor";
import { SpotifyAppEditor } from "./SpotifyAppEditor";
import { GitHubAppEditor } from "./GitHubAppEditor";
import { MemberAdministration } from "./MemberAdministration";
import { ApprovalRatesEditor } from "./ApprovalRatesEditor";
import "../../server-admin.css";

type AdminTab = "members" | "registration" | "approvals" | "branding" | "spotify" | "github";

export interface ServerAdminDialogProps {
  showInvite?: boolean;
  members: Member[]; currentUser: Member; invitations: Invitation[]; invitationLinks: Readonly<Record<string, string>>;
  corporateIdentity: CorporateIdentity;
  onInvite: (email: string, role: Exclude<MemberRole, "owner">) => Promise<boolean>;
  onRevokeInvite: (id: string) => Promise<void>; onCopyInvite: (id: string) => Promise<void>;
  onAccessChange: (id: string, role: Exclude<MemberRole, "owner">) => Promise<void>;
  onRegistrationSettingsSave: (settings: RegistrationSettings) => Promise<void>;
  onCorporateIdentitySave: (settings: CorporateIdentitySettings) => Promise<void>;
  onCorporateLogoUpload: (file: File) => Promise<void>; onCorporateLogoRemove: () => Promise<void>; onClose: () => void;
}

export function ServerAdminDialog(props: ServerAdminDialogProps) {
  const [tab, setTab] = useState<AdminTab>("members");
  return <WorkspaceDialog title="Server settings" className="server-admin-dialog" onClose={props.onClose}>
    <DialogTabs label="Server settings" value={tab} onChange={setTab} tabs={[
      { id: "members", label: "User roles" }, { id: "registration", label: "Registration" }, { id: "approvals", label: "Approvals" }, { id: "branding", label: "Appearance" }, { id: "spotify", label: "Spotify" },
      { id: "github", label: "GitHub" },
    ]}>
      <div className="server-admin-content">
        {tab === "members" && <MemberAdministration {...props} />}
        {tab === "registration" && <RegistrationAdminEditor canAssignAdministrators={props.currentUser.role === "owner"} onSave={props.onRegistrationSettingsSave} />}
        {tab === "approvals" && <ApprovalRatesEditor />}
        {tab === "branding" && <CorporateIdentityEditor identity={props.corporateIdentity} onSave={props.onCorporateIdentitySave} onLogoUpload={props.onCorporateLogoUpload} onLogoRemove={props.onCorporateLogoRemove} />}
        {tab === "spotify" && <SpotifyAppEditor />}
        {tab === "github" && <GitHubAppEditor />}
      </div>
    </DialogTabs>
  </WorkspaceDialog>;
}
