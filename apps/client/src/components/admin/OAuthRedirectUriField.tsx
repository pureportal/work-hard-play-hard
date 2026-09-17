import { useId, useState } from "react";

export function OAuthRedirectUriField({ provider, value, recommendedUri, required, onChange }: {
  provider: "github" | "spotify"; value: string; recommendedUri: string | null; required: boolean; onChange: (value: string) => void;
}) {
  const id = useId();
  const [copiedUri, setCopiedUri] = useState<string>();
  const [copyFailed, setCopyFailed] = useState(false);
  return <div className="admin-redirect-field">
    <label htmlFor={id}>Redirect URI</label>
    <div className="admin-redirect-input">
      <input id={id} type="url" value={value} required={required} maxLength={2048} aria-describedby={`${id}-help`}
        onChange={(event) => { setCopyFailed(false); setCopiedUri(undefined); onChange(event.target.value); }} />
      <button type="button" className="secondary-button" disabled={!value.trim()} aria-live="polite" onClick={async () => {
        setCopyFailed(false); setCopiedUri(undefined);
        try { await navigator.clipboard.writeText(value.trim()); setCopiedUri(value.trim()); }
        catch { setCopyFailed(true); }
      }}>{copiedUri === value.trim() ? "Copied" : "Copy URI"}</button>
    </div>
    <p id={`${id}-help`}>{provider === "github" ? "Use this exact URI as the Callback URL in GitHub." : "Add this exact URI to Redirect URIs in Spotify."}</p>
    {recommendedUri && value.trim() !== recommendedUri && <div className="admin-redirect-recommendation">
      <p>Recommended: <code>{recommendedUri}</code></p>
      <button type="button" className="secondary-button" onClick={() => {
        setCopyFailed(false); setCopiedUri(undefined); onChange(recommendedUri);
      }}>Use recommended URI</button>
    </div>}
    {!recommendedUri && <p>Open the server using HTTPS, or a loopback IP such as 127.0.0.1 for local setup, to get a recommended URI.</p>}
    {copyFailed && <p role="alert">Could not copy. Select the URI and copy it manually.</p>}
  </div>;
}
