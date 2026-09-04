import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CorporateIdentity, CorporateIdentitySettings } from "@workhard/shared";
import { BrandMark } from "./BrandMark";

const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const acceptedLogoTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

interface CorporateIdentityEditorProps {
  identity: CorporateIdentity;
  onSave: (settings: CorporateIdentitySettings) => Promise<void>;
  onLogoUpload: (file: File) => Promise<void>;
  onLogoRemove: () => Promise<void>;
}

export function CorporateIdentityEditor({
  identity,
  onSave,
  onLogoUpload,
  onLogoRemove,
}: CorporateIdentityEditorProps) {
  const [draft, setDraft] = useState<CorporateIdentitySettings>(() => identitySettings(identity));
  const [operation, setOperation] = useState<"save" | "upload" | "remove">();
  const [error, setError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = operation !== undefined;

  useEffect(() => {
    setDraft(identitySettings(identity));
    setError(undefined);
  }, [identity]);

  const perform = async (nextOperation: NonNullable<typeof operation>, action: () => Promise<void>) => {
    setOperation(nextOperation);
    setError(undefined);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Corporate identity could not be updated.");
    } finally {
      setOperation(undefined);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (fileInput.current) {
      fileInput.current.value = "";
    }
    if (!acceptedLogoTypes.has(file.type)) {
      setError("Choose a PNG, JPEG, GIF, or WebP image.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError("Choose an image up to 5 MB.");
      return;
    }
    await perform("upload", () => onLogoUpload(file));
  };

  return (
    <section className="settings-section corporate-identity-settings">
      <h3>Corporate identity</h3>
      <div className="corporate-logo-editor">
        <span className="corporate-logo-preview">
          <BrandMark identity={identity} size={30} />
        </span>
        <div className="corporate-logo-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => fileInput.current?.click()}>
            <ImagePlus size={14} />{operation === "upload" ? "Uploading…" : "Upload logo"}
          </button>
          {identity.logoUrl && (
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void perform("remove", onLogoRemove)}>
              <Trash2 size={14} />{operation === "remove" ? "Removing…" : "Remove"}
            </button>
          )}
          <input
            ref={fileInput}
            hidden
            type="file"
            accept=".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp"
            disabled={busy}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </div>
      </div>
      <label className="identity-field">
        <span>Application name</span>
        <input
          value={draft.applicationName}
          minLength={1}
          maxLength={60}
          disabled={busy}
          onChange={(event) => setDraft((current) => ({ ...current, applicationName: event.target.value }))}
        />
      </label>
      <div className="identity-colors">
        <label className="identity-field">
          <span>Primary color</span>
          <input
            type="color"
            value={draft.primaryColor}
            disabled={busy}
            onChange={(event) => setDraft((current) => ({ ...current, primaryColor: event.target.value }))}
          />
        </label>
        <label className="identity-field">
          <span>Secondary color</span>
          <input
            type="color"
            value={draft.secondaryColor}
            disabled={busy}
            onChange={(event) => setDraft((current) => ({ ...current, secondaryColor: event.target.value }))}
          />
        </label>
      </div>
      <label className="identity-field">
        <span>Login layout</span>
        <select
          value={draft.authenticationLayout}
          disabled={busy}
          onChange={(event) => setDraft((current) => ({
            ...current,
            authenticationLayout: event.target.value as CorporateIdentitySettings["authenticationLayout"],
          }))}
        >
          <option value="split">Illustration and form</option>
          <option value="centered">Centered form</option>
        </select>
      </label>
      {error && <output className="settings-error" role="alert">{error}</output>}
      <button
        type="button"
        className="settings-save"
        disabled={busy || draft.applicationName.trim().length === 0}
        onClick={() => void perform("save", () => onSave(draft))}
      >
        {operation === "save" ? "Saving…" : "Save identity"}
      </button>
    </section>
  );
}

function identitySettings(identity: CorporateIdentity): CorporateIdentitySettings {
  return {
    applicationName: identity.applicationName,
    primaryColor: identity.primaryColor,
    secondaryColor: identity.secondaryColor,
    authenticationLayout: identity.authenticationLayout,
  };
}
