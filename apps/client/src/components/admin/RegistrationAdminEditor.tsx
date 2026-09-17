import { useEffect, useState } from "react";
import type { RegistrationSettings } from "@workhard/shared";
import { fetchRegistrationSettings } from "../../api";
import { RegistrationSettingsEditor } from "../RegistrationSettingsEditor";

export function RegistrationAdminEditor({ canAssignAdministrators, onSave }: { canAssignAdministrators: boolean; onSave: (settings: RegistrationSettings) => Promise<void> }) {
  const [settings, setSettings] = useState<RegistrationSettings>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(undefined);
    fetchRegistrationSettings().then((value) => { if (active) setSettings(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Registration settings could not load."); });
    return () => { active = false; };
  }, [attempt]);
  if (error) return <div><p role="alert">{error}</p><button className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>;
  if (!settings) return <p role="status">Loading…</p>;
  return <RegistrationSettingsEditor settings={settings} canAssignAdministrators={canAssignAdministrators} onSave={async (value) => { await onSave(value); setSettings(value); }} />;
}
