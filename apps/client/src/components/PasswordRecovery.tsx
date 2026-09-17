import { Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError, requestPasswordReset, resetPassword } from "../api";
import { PasswordField } from "./PasswordField";

interface PasswordRecoveryProps {
  resetToken?: string | undefined;
  invitationToken?: string | undefined;
  onTokenCleared: () => void;
  onBack: () => void;
}

export function PasswordRecovery({ resetToken, invitationToken, onTokenCleared, onBack }: PasswordRecoveryProps) {
  const [token, setToken] = useState(resetToken);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    setError(undefined);
    if (token && password !== form.get("confirmation")) {
      setError("Passwords do not match. Enter the same password twice.");
      return;
    }
    setLoading(true);
    try {
      if (token) {
        await resetPassword(token, password);
        onTokenCleared();
        setToken(undefined);
        setCompleted(true);
      } else {
        const address = String(form.get("email"));
        const result = await requestPasswordReset(address, invitationToken);
        setEmail(address);
        setLink(result.resetLink);
        setSent(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Password recovery failed. Try again.");
      if (reason instanceof ApiError && reason.code === "PASSWORD_RESET_EXPIRED") {
        onTokenCleared();
        setToken(undefined);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {completed ? (
        <div className="auth-email-sent" role="status"><h2>Password changed</h2></div>
      ) : sent ? (
        <div className="auth-email-sent" role="status">
          <span><Mail size={24} /></span>
          <h2>Check your email</h2>
          <p>{email}</p>
          {link && <a className="auth-submit" href={link}>Open reset link</a>}
        </div>
      ) : (
        <>
          <h2>{token ? "Reset password" : "Forgot password"}</h2>
          <form className="auth-form" onSubmit={submit}>
            {token ? (
              <>
                <PasswordField id="reset-password" autoComplete="new-password" label="New password" />
                <PasswordField id="confirm-password" autoComplete="new-password" name="confirmation" label="Confirm password" />
              </>
            ) : (
              <label><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={254} required autoFocus /></label>
            )}
            {error && <output className="auth-error" role="alert">{error}</output>}
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "Please wait…" : token ? "Reset password" : "Send reset link"}
            </button>
          </form>
        </>
      )}
      <button type="button" className="auth-link-button" disabled={loading} onClick={onBack}>Back to sign in</button>
    </>
  );
}
