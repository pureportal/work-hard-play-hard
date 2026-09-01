import { ArrowLeft, Building2, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { login, registerAccount, requestMagicLink } from "../api";

type AuthMode = "login" | "register" | "magic";

interface AuthScreenProps {
  initialError?: string | undefined;
  onAuthenticated: () => Promise<void>;
}

export function AuthScreen({ initialError, onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [magicLink, setMagicLink] = useState<string>();
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(undefined);
    setMagicSent(false);
    setMagicLink(undefined);
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(async () => {
      await login(String(form.get("identifier")), String(form.get("password")));
      await onAuthenticated();
    });
  };

  const submitRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(async () => {
      await registerAccount(
        String(form.get("username")),
        String(form.get("email")),
        String(form.get("password")),
      );
      await onAuthenticated();
    });
  };

  const submitMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    await perform(async () => {
      const response = await requestMagicLink(email);
      setMagicEmail(email);
      setMagicLink(response.magicLink);
      setMagicSent(true);
    });
  };

  const perform = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(undefined);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <header className="auth-brand">
          <span><Building2 size={24} /></span>
          <h1 id="auth-title">Northstar</h1>
        </header>

        {mode !== "magic" && (
          <div className="auth-tabs" role="tablist" aria-label="Account">
            <button
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              onClick={() => switchMode("login")}
            >
              Sign in
            </button>
            <button
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "active" : ""}
              onClick={() => switchMode("register")}
            >
              Create account
            </button>
          </div>
        )}

        {mode === "login" && (
          <>
            <form className="auth-form" onSubmit={submitLogin}>
              <label>
                <span>Username or email</span>
                <input name="identifier" autoComplete="username" required autoFocus />
              </label>
              <label>
                <span>Password</span>
                <input name="password" type="password" autoComplete="current-password" minLength={8} required />
              </label>
              {error && <output className="auth-error" role="alert">{error}</output>}
              <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
            </form>
            <button className="auth-link-button" onClick={() => switchMode("magic")}>
              <Mail size={16} />
              Email me a sign-in link
            </button>
          </>
        )}

        {mode === "register" && (
          <form className="auth-form" onSubmit={submitRegistration}>
            <label>
              <span>Username</span>
              <input
                name="username"
                autoComplete="username"
                minLength={3}
                maxLength={32}
                pattern="(?:[a-zA-Z0-9._]|-)+"
                required
                autoFocus
              />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
            </label>
            {error && <output className="auth-error" role="alert">{error}</output>}
            <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Creating account…" : "Create account"}</button>
          </form>
        )}

        {mode === "magic" && !magicSent && (
          <>
            <button className="auth-back" aria-label="Back to sign in" onClick={() => switchMode("login")}>
              <ArrowLeft size={18} />
            </button>
            <h2>Sign in by email</h2>
            <form className="auth-form" onSubmit={submitMagicLink}>
              <label>
                <span>Email</span>
                <input name="email" type="email" autoComplete="email" required autoFocus />
              </label>
              {error && <output className="auth-error" role="alert">{error}</output>}
              <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Sending…" : "Send sign-in link"}</button>
            </form>
          </>
        )}

        {mode === "magic" && magicSent && (
          <div className="auth-email-sent" role="status">
            <span><Mail size={24} /></span>
            <h2>Check your email</h2>
            <p>{magicEmail}</p>
            {magicLink && <a className="auth-submit" href={magicLink}>Open sign-in link</a>}
            <button className="auth-link-button" onClick={() => switchMode("login")}>Back to sign in</button>
          </div>
        )}
      </section>
    </main>
  );
}
