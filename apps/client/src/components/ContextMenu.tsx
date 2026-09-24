import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Copy, ExternalLink, type LucideIcon } from "lucide-react";

export interface ContextAction {
  label: string;
  onSelect: () => void;
  icon: LucideIcon;
  group?: string;
  disabled?: boolean;
  danger?: boolean;
}

type OpenContextMenu = (actions: ContextAction[], x: number, y: number, trigger?: HTMLElement) => void;

const ContextMenuContext = createContext<OpenContextMenu>(() => { throw new Error("ContextMenuProvider is missing"); });

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<{ actions: ContextAction[]; x: number; y: number; trigger: HTMLElement | undefined }>();
  const [copyError, setCopyError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const open: OpenContextMenu = (actions, x, y, trigger) => {
    if (actions.some((action) => !action.disabled)) setMenu({ actions, x, y, trigger });
  };

  useEffect(() => {
    const suppressBrowserMenu = (event: globalThis.MouseEvent) => {
      const editable = event.target instanceof Element && event.target.closest("input, textarea, [contenteditable]");
      if (editable && typeof globalThis.PointerEvent === "function"
        && event instanceof globalThis.PointerEvent && event.pointerType === "touch") return;
      event.preventDefault();
    };
    const openLinkMenu = (event: globalThis.MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor) return;
      setMenu({
        x: event.clientX,
        y: event.clientY,
        trigger: anchor,
        actions: [
          { label: "Open link", icon: ExternalLink, onSelect: () => anchor.click() },
          { label: "Copy link", icon: Copy, onSelect: () => {
            void (async () => {
              try { await navigator.clipboard.writeText(anchor.href); setCopyError(false); }
              catch { setCopyError(true); }
            })();
          } },
        ],
      });
    };
    document.addEventListener("contextmenu", suppressBrowserMenu, true);
    document.addEventListener("contextmenu", openLinkMenu);
    return () => {
      document.removeEventListener("contextmenu", suppressBrowserMenu, true);
      document.removeEventListener("contextmenu", openLinkMenu);
    };
  }, []);

  useEffect(() => {
    if (!copyError) return;
    const timer = window.setTimeout(() => setCopyError(false), 4000);
    return () => window.clearTimeout(timer);
  }, [copyError]);

  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: globalThis.PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(undefined);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(undefined);
        menu.trigger?.focus({ preventScroll: true });
      }
    };
    const close = () => setMenu(undefined);
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu) return;
    const element = menuRef.current;
    if (!element) return;
    const margin = 8;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const right = left + (viewport?.width ?? window.innerWidth);
    const bottom = top + (viewport?.height ?? window.innerHeight);
    element.style.maxHeight = `${Math.max(80, bottom - top - margin * 2)}px`;
    element.style.left = `${Math.max(left + margin, Math.min(menu.x, right - element.offsetWidth - margin))}px`;
    element.style.top = `${Math.max(top + margin, Math.min(menu.y, bottom - element.offsetHeight - margin))}px`;
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [menu]);

  const groups = menu?.actions.reduce<{ label: string | undefined; actions: ContextAction[] }[]>((result, action) => {
    const last = result.at(-1);
    if (last && last.label === action.group) last.actions.push(action);
    else result.push({ label: action.group, actions: [action] });
    return result;
  }, []);

  return <ContextMenuContext.Provider value={open}>
    {children}
    {menu && createPortal(<div ref={menuRef} className="app-context-menu" role="menu" aria-label="Actions" onKeyDown={(event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        setMenu(undefined);
        menu.trigger?.focus({ preventScroll: true });
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      if (!buttons.length) return;
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>
      {groups?.map((group, groupIndex) => <div className="app-context-group" role="group" aria-label={group.label} key={`${group.label ?? "actions"}-${groupIndex}`}>
        {group.label && menu.actions.length >= 4 && groups.length > 1 && <div className="app-context-group-label" aria-hidden="true">{group.label}</div>}
        {group.actions.map((action, index) => <button key={`${action.label}-${index}`} type="button" role="menuitem"
          className={action.danger ? `danger${index > 0 ? " separated" : ""}` : undefined} disabled={action.disabled}
          onClick={() => { setMenu(undefined); menu.trigger?.focus({ preventScroll: true }); action.onSelect(); }}>
          <span className="app-context-icon"><action.icon size={17} strokeWidth={1.9} aria-hidden="true" /></span>
          <span>{action.label}</span>
        </button>)}
      </div>)}
    </div>, document.body)}
    {copyError && createPortal(<div className="app-context-error" role="alert">Could not copy link.</div>, document.body)}
  </ContextMenuContext.Provider>;
}

export function useOpenContextMenu(): OpenContextMenu {
  return useContext(ContextMenuContext);
}

export function useContextActions() {
  const open = useOpenContextMenu();
  const pending = useRef<{ id: number; x: number; y: number; pointerId: number } | undefined>(undefined);
  const suppressClick = useRef(false);
  const clickReset = useRef<number | undefined>(undefined);

  const cancel = () => {
    if (pending.current) window.clearTimeout(pending.current.id);
    pending.current = undefined;
  };

  useEffect(() => () => {
    cancel();
    if (clickReset.current) window.clearTimeout(clickReset.current);
  }, []);

  return (actions: () => ContextAction[]) => ({
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (event.target instanceof Element && event.target.closest("a[href]")) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
      open(actions(), event.clientX, event.clientY, event.currentTarget);
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse" || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest("a[href], [data-context-press-ignore]")) return;
      cancel();
      const trigger = event.currentTarget;
      const { clientX: x, clientY: y, pointerId } = event;
      pending.current = { x, y, pointerId, id: window.setTimeout(() => {
        pending.current = undefined;
        suppressClick.current = true;
        if (clickReset.current) window.clearTimeout(clickReset.current);
        clickReset.current = window.setTimeout(() => { suppressClick.current = false; }, 750);
        open(actions(), x, y, trigger);
      }, 520) };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const press = pending.current;
      if (press && press.pointerId === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = event.currentTarget.getBoundingClientRect();
      open(actions(), bounds.left + Math.min(bounds.width / 2, 40), bounds.top + Math.min(bounds.height / 2, 40), event.currentTarget);
    },
  });
}
