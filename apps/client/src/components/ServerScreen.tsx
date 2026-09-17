import { DEFAULT_CORPORATE_IDENTITY } from "@workhard/shared";
import { BrandMark } from "./BrandMark";
import { ServerConnectionForm } from "./ServerConnectionForm";

export function ServerScreen({ onConnected, error }: { onConnected: () => void; error?: string | undefined }) {
  return <main className="auth-shell centered">
    <div className="auth-layout">
      <section className="auth-card" aria-labelledby="server-title">
        <header className="auth-brand">
          <span><BrandMark identity={DEFAULT_CORPORATE_IDENTITY} size={27} /></span>
          <h1 id="server-title">Connect to your server</h1>
        </header>
        {error && <output className="auth-error" role="alert">{error}</output>}
        <ServerConnectionForm onConnected={onConnected} />
      </section>
    </div>
  </main>;
}
