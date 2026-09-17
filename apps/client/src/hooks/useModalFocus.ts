import { useEffect, useRef } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const activeDialogs: HTMLElement[] = [];

export function useModalFocus<T extends HTMLElement>(onClose: () => void, active = true, trapFocus = true) {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) {
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    activeDialogs.push(dialog);
    dialog.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeDialogs.at(-1) !== dialog || event.defaultPrevented) return;
      if (!trapFocus && !(event.target instanceof Node && dialog.contains(event.target))) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !trapFocus) {
        return;
      }
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter((element) => element.tabIndex >= 0 && isVisibleWithin(element, dialog));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      if (document.activeElement === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const wasTopmost = activeDialogs.at(-1) === dialog;
      activeDialogs.splice(activeDialogs.indexOf(dialog), 1);
      if (wasTopmost && previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [active, trapFocus]);

  return dialogRef;
}

function isVisibleWithin(element: HTMLElement, boundary: HTMLElement): boolean {
  if (element.matches(":disabled") || element.closest("[inert]")) return false;
  let current: HTMLElement | null = element;
  while (current) {
    if (current instanceof HTMLDetailsElement && !current.open && !current.querySelector("summary")?.contains(element)) return false;
    const style = getComputedStyle(current);
    if (current.hidden || current.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    if (current === boundary) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}
