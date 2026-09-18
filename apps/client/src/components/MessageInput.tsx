import { useLayoutEffect, useRef } from "react";
import "../message-input.css";

export function MessageInput({ value, onChange, label, placeholder, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [value]);

  return <textarea
    ref={inputRef}
    className="message-input"
    aria-label={label}
    placeholder={placeholder}
    value={value}
    maxLength={500}
    rows={1}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value)}
    onKeyDown={(event) => {
      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }}
  />;
}
