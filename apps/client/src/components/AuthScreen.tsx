import { ArrowLeft, Mail, ServerCog } from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { CorporateIdentity } from "@workhard/shared";
import { login, registerAccount, requestMagicLink } from "../api";
import { getDefaultServerOrigin, getServerOrigin } from "../server-url";
import { AuthWorldPreview } from "./AuthWorldPreview";
import { ServerConnectionForm } from "./ServerConnectionForm";
import { BrandMark } from "./BrandMark";
import { PasswordField } from "./PasswordField";
import { PasswordRecovery } from "./PasswordRecovery";

type AuthMode = "login" | "register" | "magic" | "forgot" | "reset";

interface AuthScreenProps {
  initialError?: string | undefined;
  invitationToken?: string | undefined;
  resetToken?: string | undefined;
  onResetTokenCleared?: (() => void) | undefined;
  registrationsEnabled: boolean;
  invitationRequired: boolean;
  magicLinkEnabled: boolean;
  passwordResetEnabled: boolean;
  setupRequired: boolean;
  corporateIdentity: CorporateIdentity;
  onAuthenticated: (invitationAccepted?: boolean) => Promise<void>;
  onServerChanged?: (() => void) | undefined;
}

export function AuthScreen({
  initialError,
  invitationToken,
  resetToken,
  onResetTokenCleared,
  registrationsEnabled,
  invitationRequired,
  magicLinkEnabled,
  passwordResetEnabled,
  setupRequired,
  corporateIdentity,
  onAuthenticated,
  onServerChanged,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(
    resetToken ? "reset" : setupRequired || (registrationsEnabled && invitationToken) ? "register" : "login",
  );
  const accountTabs = useRef<HTMLDivElement>(null);
  const focusAccountTab = useRef(false);
  useLayoutEffect(() => {
    if (!focusAccountTab.current) return;
    accountTabs.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    focusAccountTab.current = false;
  }, [mode]);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [magicLink, setMagicLink] = useState<string>();
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [registrationEmail, setRegistrationEmail] = useState<string>();
  const [registrationLink, setRegistrationLink] = useState<string>();
  const [activeServer, setActiveServer] = useState(getServerOrigin);
  const [showServer, setShowServer] = useState(Boolean(initialError));
  const customServerActive = activeServer !== null && activeServer !== getDefaultServerOrigin();
  const serverLabel = customServerActive ? new URL(activeServer).host : "Server";

  const switchMode = (nextMode: AuthMode) => {
    if (loading) return;
    if (mode === "reset") onResetTokenCleared?.();
    setMode(nextMode);
    setError(undefined);
    setMagicSent(false);
    setMagicLink(undefined);
    setRegistrationEmail(undefined);
    setRegistrationLink(undefined);
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
      const response = await registerAccount(
        String(form.get("username")),
        String(form.get("email")),
        String(form.get("password")),
        registrationInvitationToken,
      );
      if ("verificationRequired" in response) {
        setRegistrationEmail(String(form.get("email")));
        setRegistrationLink(response.registrationLink);
        return;
      }
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

  const toggleServer = () => {
    setShowServer((current) => !current);
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
        <div className="auth-visual">
          <AuthWorldPreview />
        </div>
        <section className="auth-card" aria-labelledby="auth-title">
          <header className="auth-brand">
            <span><BrandMark identity={corporateIdentity} size={27} /></span>
            <h1 id="auth-title">{setupRequired ? `Set up ${corporateIdentity.applicationName}` : corporateIdentity.applicationName}</h1>
          </header>

        {(mode === "login" || mode === "register") && !registrationEmail && !setupRequired && registrationsEnabled && (
          <div ref={accountTabs} className="auth-tabs" role="tablist" aria-label="Account" onKeyDown={(event) => {
            const next = event.key === "Home" ? "login" : event.key === "End" ? "register"
              : ["ArrowLeft", "ArrowRight"].includes(event.key) ? mode === "login" ? "register" : "login" : undefined;
            if (!next) return;
            event.preventDefault();
            focusAccountTab.current = true;
            switchMode(next);
            event.currentTarget.querySelector<HTMLButtonElement>(`#auth-${next}-tab`)?.focus();
          }}>
            <button
              type="button"
              role="tab"
              id="auth-login-tab"
              aria-controls="auth-account-form"
              aria-selected={mode === "login"}
              tabIndex={mode === "login" ? 0 : -1}
              className={mode === "login" ? "active" : ""}
              onClick={() => switchMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              id="auth-register-tab"
              aria-controls="auth-account-form"
              aria-selected={mode === "register"}
              tabIndex={mode === "register" ? 0 : -1}
              className={mode === "register" ? "active" : ""}
              onClick={() => switchMode("register")}
            >
              Create account
            </button>
          </div>
        )}

        {mode === "login" && (
          <form id="auth-account-form" className="auth-form" onSubmit={submitLogin}>
            <label>
              <span>Username or email</span>
              <input name="identifier" autoComplete="username" required autoFocus />
            </label>
            <PasswordField id="login-password" autoComplete="current-password" />
            {passwordResetEnabled && <button type="button" className="auth-link-button" disabled={loading} onClick={() => switchMode("forgot")}>Forgot password?</button>}
            {error && <output className="auth-error" role="alert">{error}</output>}
            <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
          </form>
        )}

        {mode === "register" && !registrationEmail && (
          <form id="auth-account-form" className="auth-form" onSubmit={submitRegistration}>
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

        {mode === "register" && registrationEmail && (
          <div className="auth-email-sent" role="status">
            <span><Mail size={24} /></span>
            <h2>Verify your email</h2>
            <p>{registrationEmail}</p>
            {registrationLink && <a className="auth-submit" href={registrationLink}>Verify email</a>}
            <button type="button" className="auth-link-button" onClick={() => switchMode("login")}>Back to sign in</button>
          </div>
        )}

        {(mode === "forgot" || mode === "reset") && (
          <PasswordRecovery key={mode} resetToken={mode === "reset" ? resetToken : undefined} invitationToken={invitationToken}
            onTokenCleared={() => onResetTokenCleared?.()} onBack={() => switchMode("login")} />
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

        {showServer && !magicSent && !registrationEmail && mode !== "forgot" && mode !== "reset" && (
          <ServerConnectionForm disabled={loading} onConnected={() => {
            setActiveServer(getServerOrigin());
            onServerChanged?.();
          }} />
        )}

        {!magicSent && !registrationEmail && mode !== "forgot" && mode !== "reset" && (
          <div className="auth-utilities">
            {mode === "login" && magicLinkEnabled && (
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
