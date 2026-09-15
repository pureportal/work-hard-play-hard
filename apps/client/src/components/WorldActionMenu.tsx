import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { ContextAnchor } from "./WorldCanvas";

interface WorldActionMenuProps {
  anchor: ContextAnchor | undefined;
  besidePlayer?: boolean;
  children: ReactNode;
}

export function WorldActionMenu({ anchor, besidePlayer = false, children }: WorldActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    const workspace = menu?.parentElement;
    if (!menu || !workspace || !anchor) return;
    const topBar = workspace.querySelector(".top-bar");
    const dock = workspace.querySelector(".control-dock");
    const position = () => {
      const bounds = workspace.getBoundingClientRect();
      const top = (topBar?.getBoundingClientRect().bottom ?? bounds.top) - bounds.top + 12;
      const bottom = (dock?.getBoundingClientRect().top ?? bounds.bottom) - bounds.top - 12;
      menu.style.maxHeight = `${Math.max(0, bottom - top)}px`;
      const right = anchor.x + 32;
      const left = anchor.x - menu.offsetWidth - 32;
      const side = besidePlayer ? right + menu.offsetWidth <= bounds.width - 12 ? right : left >= 12 ? left : undefined : undefined;
      const x = side ?? Math.max(12, Math.min(bounds.width - menu.offsetWidth - 12, anchor.x - menu.offsetWidth / 2));
      const above = anchor.y - menu.offsetHeight - 12;
      const desiredTop = side !== undefined ? anchor.y - 48 : above >= top ? above : anchor.y + 12;
      const y = Math.max(top, Math.min(bottom - menu.offsetHeight, desiredTop));
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    for (const element of [menu, workspace, topBar, dock]) {
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [anchor, besidePlayer]);

  return <div ref={ref} className={`world-actions${anchor ? " contextual" : ""}`}>{children}</div>;
}
