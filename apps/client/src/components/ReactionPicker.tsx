import { SmilePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactionKind } from "@workhard/shared";
import { REACTION_OPTIONS } from "../reactions";
import { IconButton } from "./IconButton";

interface ReactionPickerProps {
  onReact: (reaction: ReactionKind) => void;
  disabled?: boolean;
}

export function ReactionPicker({ onReact, disabled = false }: ReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!open) {
      return;
    }
    rootRef.current?.querySelector<HTMLButtonElement>(".reaction-popover button")?.focus();
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>(".reaction-trigger")?.focus();
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  return (
    <div className="reaction-control" ref={rootRef}>
      {open && (
        <div className="reaction-popover" role="group" aria-label="Reactions">
          {REACTION_OPTIONS.map((option) => (
            <button
              type="button"
              aria-label={`${option.label} (${option.shortcut})`}
              key={option.kind}
              onClick={() => {
                onReact(option.kind);
                setOpen(false);
                rootRef.current?.querySelector<HTMLButtonElement>(".reaction-trigger")?.focus();
              }}
            >
              <span aria-hidden="true">{option.emoji}</span>
              <kbd aria-hidden="true">{option.shortcut}</kbd>
            </button>
          ))}
        </div>
      )}
      <IconButton
        label="React"
        icon={SmilePlus}
        className={`reaction-trigger ${open ? "is-active" : ""}`}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      />
    </div>
  );
}
