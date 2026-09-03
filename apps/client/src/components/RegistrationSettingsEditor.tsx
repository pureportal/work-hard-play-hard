import { X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import {
  isValidEmailDomain,
  normalizeEmailDomain,
  type RegistrationSettings,
} from "@workhard/shared";

interface RegistrationSettingsEditorProps {
  settings: RegistrationSettings;
  onSave: (settings: RegistrationSettings) => Promise<void>;
}

export function RegistrationSettingsEditor({ settings, onSave }: RegistrationSettingsEditorProps) {
  const [draft, setDraft] = useState(() => structuredClone(settings));
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(structuredClone(settings));
    setError(undefined);
  }, [settings]);

  const addDomain = () => {
    const normalized = normalizeEmailDomain(domain);
    if (!isValidEmailDomain(normalized)) {
      setError("Enter a valid email domain.");
      return;
    }
    if (draft.whitelistedDomains.includes(normalized)) {
      setError("Domain is already listed.");
      return;
    }
    setDraft((current) => ({
      ...current,
      whitelistedDomains: [...current.whitelistedDomains, normalized],
    }));
    setDomain("");
    setError(undefined);
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await onSave(draft);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Registration settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleDomainKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    addDomain();
  };

  return (
    <section className="settings-section registration-settings">
      <h3>Registration</h3>
      <label className="permission-toggle">
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={saving}
          onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
        />
        <span>Allow registrations</span>
      </label>
      <label className="permission-toggle">
        <input
          type="checkbox"
          checked={draft.invitationRequired}
          disabled={saving}
          onChange={(event) => setDraft((current) => ({
            ...current,
            invitationRequired: event.target.checked,
          }))}
        />
        <span>Require invitation</span>
      </label>
      <label className="registration-role">
        <span>Default role</span>
        <select
          value={draft.defaultRole}
          disabled={saving}
          onChange={(event) => setDraft((current) => ({
            ...current,
            defaultRole: event.target.value as RegistrationSettings["defaultRole"],
          }))}
        >
          <option value="admin">Administrator</option>
          <option value="member">Member</option>
          <option value="guest">Guest</option>
        </select>
      </label>
      <div className="registration-domains">
        <label htmlFor="registration-domain">Domains without invitations</label>
        <div className="registration-domain-input">
          <input
            id="registration-domain"
            value={domain}
            disabled={saving}
            maxLength={253}
            placeholder="example.com"
            onChange={(event) => setDomain(event.target.value)}
            onKeyDown={handleDomainKeyDown}
          />
          <button type="button" disabled={saving || domain.trim().length === 0} onClick={addDomain}>Add</button>
        </div>
        {draft.whitelistedDomains.length > 0 && (
          <ul className="registration-domain-list">
            {draft.whitelistedDomains.map((listedDomain) => (
              <li key={listedDomain}>
                <span>{listedDomain}</span>
                <button
                  type="button"
                  aria-label={`Remove ${listedDomain}`}
                  disabled={saving}
                  onClick={() => setDraft((current) => ({
                    ...current,
                    whitelistedDomains: current.whitelistedDomains.filter((candidate) => candidate !== listedDomain),
                  }))}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <output className="settings-error" role="alert">{error}</output>}
      <button type="button" className="settings-save" disabled={saving} onClick={() => void save()}>
        {saving ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
