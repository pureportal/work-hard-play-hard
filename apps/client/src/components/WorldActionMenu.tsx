import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { ContextAnchor } from "./WorldCanvas";

interface WorldActionMenuProps {
  anchor: ContextAnchor | undefined;
  children: ReactNode;
}

export function WorldActionMenu({ anchor, children }: WorldActionMenuProps) {
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
      const x = Math.max(12, Math.min(bounds.width - menu.offsetWidth - 12, anchor.x - menu.offsetWidth / 2));
      const above = anchor.y - menu.offsetHeight - 12;
      const y = Math.max(top, Math.min(bottom - menu.offsetHeight, above >= top ? above : anchor.y + 12));
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    for (const element of [menu, workspace, topBar, dock]) {
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [anchor]);

  return <div ref={ref} className={`world-actions${anchor ? " contextual" : ""}`}>{children}</div>;
}
