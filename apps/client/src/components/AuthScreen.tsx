import { ArrowLeft, Eye, EyeOff, Mail, ServerCog } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { CorporateIdentity } from "@workhard/shared";
import { login, registerAccount, requestMagicLink } from "../api";
import officePreview from "../assets/northstar-office.svg";
import { clearServerOrigin, getDefaultServerOrigin, getServerOrigin, setServerOrigin } from "../server-url";
import { BrandMark } from "./BrandMark";

type AuthMode = "login" | "register" | "magic";

interface AuthScreenProps {
  initialError?: string | undefined;
  invitationToken?: string | undefined;
  registrationsEnabled: boolean;
  invitationRequired: boolean;
  setupRequired: boolean;
  corporateIdentity: CorporateIdentity;
  onAuthenticated: (invitationAccepted?: boolean) => Promise<void>;
  onServerChanged?: (() => void) | undefined;
}

export function AuthScreen({
  initialError,
  invitationToken,
  registrationsEnabled,
  invitationRequired,
  setupRequired,
  corporateIdentity,
  onAuthenticated,
  onServerChanged,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(
    setupRequired || (registrationsEnabled && invitationToken) ? "register" : "login",
  );
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [magicLink, setMagicLink] = useState<string>();
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [activeServer, setActiveServer] = useState(getServerOrigin);
  const [server, setServer] = useState(activeServer);
  const [serverError, setServerError] = useState<string>();
  const [showServer, setShowServer] = useState(Boolean(initialError));
  const customServerActive = activeServer !== getDefaultServerOrigin();
  const serverLabel = customServerActive ? new URL(activeServer).host : "Server";

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
      const enteredInvitationCode = String(form.get("invitationCode") ?? "").trim();
      const registrationInvitationToken = (invitationToken ?? enteredInvitationCode) || undefined;
      await registerAccount(
        String(form.get("username")),
        String(form.get("email")),
        String(form.get("password")),
        registrationInvitationToken,
      );
      await onAuthenticated(Boolean(registrationInvitationToken));
    });
  };

  const submitMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    await perform(async () => {
      const response = await requestMagicLink(email, invitationToken);
      setMagicEmail(email);
      setMagicLink(response.magicLink);
      setMagicSent(true);
    });
  };

  const submitServer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await perform(async () => {
      const serverOrigin = setServerOrigin(server);
      setServer(serverOrigin);
      setActiveServer(serverOrigin);
      onServerChanged?.();
    }, setServerError);
  };

  const useDefaultServer = async () => {
    await perform(async () => {
      const serverOrigin = clearServerOrigin();
      setServer(serverOrigin);
      setActiveServer(serverOrigin);
      onServerChanged?.();
    }, setServerError);
  };

  const toggleServer = () => {
    setShowServer((current) => {
      if (!current) {
        setServer(activeServer);
        setServerError(undefined);
      }
      return !current;
    });
  };

  const perform = async (
    action: () => Promise<void>,
    setActionError: (message: string | undefined) => void = setError,
  ) => {
    setLoading(true);
    setActionError(undefined);
    try {
      await action();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={`auth-shell ${corporateIdentity.authenticationLayout}`}>
      <div className="auth-layout">
        <div className="auth-visual" aria-hidden="true">
          <img src={officePreview} alt="" />
        </div>
        <section className="auth-card" aria-labelledby="auth-title">
          <header className="auth-brand">
            <span><BrandMark identity={corporateIdentity} size={27} /></span>
            <h1 id="auth-title">{setupRequired ? `Set up ${corporateIdentity.applicationName}` : corporateIdentity.applicationName}</h1>
          </header>

        {mode !== "magic" && !setupRequired && registrationsEnabled && (
          <div className="auth-tabs" role="tablist" aria-label="Account">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              onClick={() => switchMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
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
          <form className="auth-form" onSubmit={submitLogin}>
            <label>
              <span>Username or email</span>
              <input name="identifier" autoComplete="username" required autoFocus />
            </label>
            <PasswordField id="login-password" autoComplete="current-password" />
            {error && <output className="auth-error" role="alert">{error}</output>}
            <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
          </form>
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
            <PasswordField id="registration-password" autoComplete="new-password" maxLength={128} />
            {!setupRequired && invitationRequired && !invitationToken && (
              <label>
                <span>Invitation code</span>
                <input
                  name="invitationCode"
                  autoComplete="off"
                  minLength={43}
                  maxLength={43}
                  pattern="[A-Za-z0-9_-]{43}"
                />
              </label>
            )}
            {error && <output className="auth-error" role="alert">{error}</output>}
            <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Creating account…" : "Create account"}</button>
          </form>
        )}

        {mode === "magic" && !magicSent && (
          <>
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
            <button type="button" className="auth-link-button" onClick={() => switchMode("login")}>Back to sign in</button>
          </div>
        )}

        {showServer && !magicSent && (
          <form className="auth-form auth-server-form" onSubmit={submitServer}>
            <label>
              <span>Server URL</span>
              <input
                type="url"
                value={server}
                aria-invalid={Boolean(serverError)}
                onChange={(event) => setServer(event.target.value)}
                required
              />
            </label>
            {serverError && <output className="auth-error" role="alert">{serverError}</output>}
            <div className="auth-server-actions">
              <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Connecting…" : "Connect"}</button>
              {customServerActive && (
                <button type="button" className="auth-server-default" disabled={loading} onClick={useDefaultServer}>
                  Use default
                </button>
              )}
            </div>
          </form>
        )}

        {!magicSent && (
          <div className="auth-utilities">
            {mode === "login" && (
              <button type="button" className="auth-link-button" onClick={() => switchMode("magic")}>
                <Mail size={16} />
                Email sign-in link
              </button>
            )}
            {mode === "magic" && (
              <button type="button" className="auth-link-button" onClick={() => switchMode("login")}>
                <ArrowLeft size={16} />
                Use password
              </button>
            )}
            <button
              type="button"
              className={`auth-link-button auth-server-toggle${customServerActive ? " active" : ""}`}
              aria-label={customServerActive ? `Server: ${activeServer}` : "Server"}
              aria-expanded={showServer}
              onClick={toggleServer}
            >
              <ServerCog size={16} />
              <span>{serverLabel}</span>
            </button>
          </div>
        )}
        </section>
      </div>
    </main>
  );
}

interface PasswordFieldProps {
  id: string;
  autoComplete: "current-password" | "new-password";
  maxLength?: number | undefined;
}

function PasswordField({ id, autoComplete, maxLength }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-field">
      <label htmlFor={id}>Password</label>
      <div className="auth-password-field">
        <input
          id={id}
          name="password"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={8}
          maxLength={maxLength}
          required
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
