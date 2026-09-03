import { X } from "lucide-react";
import type {
  GlobalKidnappingSettings,
  KidnappingPolicy,
  KidnappingPolicyMode,
  Member,
  PlayerKidnappingSettings,
  RegistrationSettings,
} from "@workhard/shared";
import { IconButton } from "./IconButton";
import { RegistrationSettingsEditor } from "./RegistrationSettingsEditor";

interface KidnappingSettingsPanelProps {
  members: Member[];
  currentUserId: string;
  globalSettings: GlobalKidnappingSettings;
  playerSettings: PlayerKidnappingSettings;
  registrationSettings?: RegistrationSettings | undefined;
  canManage: boolean;
  onGlobalChange: (settings: GlobalKidnappingSettings) => void;
  onPlayerChange: (settings: PlayerKidnappingSettings) => void;
  onRegistrationSettingsSave: (settings: RegistrationSettings) => Promise<void>;
  onClose: () => void;
}

const policyOptions: Array<{ value: KidnappingPolicyMode; label: string }> = [
  { value: "allow_all", label: "Everyone" },
  { value: "allow_list", label: "Allow list" },
  { value: "block_list", label: "Block list" },
  { value: "allow_none", label: "No one" },
];

export function KidnappingSettingsPanel({
  members,
  currentUserId,
  globalSettings,
  playerSettings,
  registrationSettings,
  canManage,
  onGlobalChange,
  onPlayerChange,
  onRegistrationSettingsSave,
  onClose,
}: KidnappingSettingsPanelProps) {
  return (
    <aside className="side-panel settings-panel" aria-label="Settings">
      <div className="panel-header">
        <h2>Settings</h2>
        <IconButton label="Close settings" icon={X} onClick={onClose} />
      </div>
      <div className="panel-scroll settings-panel-scroll">
        {registrationSettings && (
          <RegistrationSettingsEditor
            settings={registrationSettings}
            onSave={onRegistrationSettingsSave}
          />
        )}
        <section className="settings-section">
          <h3>Kidnapping</h3>
          {canManage && (
            <>
              <label className="permission-toggle">
                <input
                  type="checkbox"
                  checked={globalSettings.enabled}
                  onChange={(event) => onGlobalChange({ ...globalSettings, enabled: event.target.checked })}
                />
                <span>Enable kidnapping</span>
              </label>
              <PolicyEditor
                label="Who can be carried"
                policy={globalSettings.targetPolicy}
                members={members}
                onChange={(targetPolicy) => onGlobalChange({ ...globalSettings, targetPolicy })}
              />
            </>
          )}
          <PolicyEditor
            label="Who can carry you"
            policy={playerSettings.carrierPolicy}
            members={members.filter((member) => member.id !== currentUserId)}
            onChange={(carrierPolicy) => onPlayerChange({ carrierPolicy })}
          />
        </section>
      </div>
    </aside>
  );
}

function PolicyEditor({
  label,
  policy,
  members,
  onChange,
}: {
  label: string;
  policy: KidnappingPolicy;
  members: Member[];
  onChange: (policy: KidnappingPolicy) => void;
}) {
  const showMembers = policy.mode === "allow_list" || policy.mode === "block_list";
  return (
    <div className="kidnapping-policy">
      <label>
        <span>{label}</span>
        <select
          value={policy.mode}
          onChange={(event) => onChange({ mode: event.target.value as KidnappingPolicyMode, userIds: policy.userIds })}
        >
          {policyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {showMembers && (
        <div className="kidnapping-member-list">
          {members.map((member) => (
            <label className="permission-toggle" key={member.id}>
              <input
                type="checkbox"
                checked={policy.userIds.includes(member.id)}
                onChange={(event) => onChange({
                  ...policy,
                  userIds: event.target.checked
                    ? [...policy.userIds, member.id]
                    : policy.userIds.filter((userId) => userId !== member.id),
                })}
              />
              <span>{member.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
