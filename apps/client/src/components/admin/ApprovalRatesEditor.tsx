import { useEffect, useState } from "react";
import type { ApprovalRates } from "@workhard/shared";
import { fetchApprovalRates, updateApprovalRates } from "../../api";

const categories: { key: keyof ApprovalRates; label: string }[] = [
  { key: "serverSettings", label: "Server settings" },
  { key: "building", label: "Building and rooms" },
  { key: "organisation", label: "Organisation" },
  { key: "funds", label: "Funds" },
];

function draftFromRates(rates: ApprovalRates): Record<keyof ApprovalRates, string> {
  return {
    serverSettings: String(rates.serverSettings),
    building: String(rates.building),
    organisation: String(rates.organisation),
    funds: String(rates.funds),
  };
}

export function ApprovalRatesEditor() {
  const [saved, setSaved] = useState<ApprovalRates>();
  const [draft, setDraft] = useState<Record<keyof ApprovalRates, string>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(undefined);
    fetchApprovalRates().then((rates) => {
      if (active) {
        setSaved(rates);
        setDraft(draftFromRates(rates));
      }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Approval rates could not load."); });
    return () => { active = false; };
  }, [attempt]);

  if (!draft || !saved) return error
    ? <div><p role="alert">{error}</p><button className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div>
    : <p role="status">Loading…</p>;

  const changed = categories.some(({ key }) => draft[key] !== String(saved[key]));

  return <form className="admin-settings-form approval-rates-form" onSubmit={async (event) => {
    event.preventDefault();
    if (busy || !changed) return;
    const rates: ApprovalRates = {
      serverSettings: Number(draft.serverSettings),
      building: Number(draft.building),
      organisation: Number(draft.organisation),
      funds: Number(draft.funds),
    };
    setBusy(true);
    setError(undefined);
    try {
      const updated = await updateApprovalRates(rates);
      setSaved(updated);
      setDraft(draftFromRates(updated));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Approval rates could not be saved.");
    } finally {
      setBusy(false);
    }
  }}>
    <fieldset disabled={busy}>
      {categories.map(({ key, label }) => <label key={key}>{label}
        <span className="approval-rate-input"><input type="number" aria-label={label} min="0" max="100" step="1" required value={draft[key]}
          onChange={(event) => setDraft((current) => ({ ...current!, [key]: event.target.value }))} /><span>%</span></span>
      </label>)}
      <p>0% applies changes immediately.</p>
      <button className="primary-button" disabled={!changed}>{busy ? "Saving…" : "Save approval rates"}</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </form>;
}
