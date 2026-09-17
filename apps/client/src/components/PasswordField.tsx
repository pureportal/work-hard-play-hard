import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

interface PasswordFieldProps {
  id: string;
  autoComplete: "current-password" | "new-password";
  name?: string;
  label?: string;
  maxLength?: number | undefined;
}

export function PasswordField({ id, autoComplete, name = "password", label = "Password", maxLength = 128 }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-field">
        <input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete}
          minLength={autoComplete === "new-password" ? 8 : 1} maxLength={maxLength} required />
        <button type="button" className="auth-password-toggle" aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible} aria-controls={id} onClick={() => setVisible((current) => !current)}>
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
