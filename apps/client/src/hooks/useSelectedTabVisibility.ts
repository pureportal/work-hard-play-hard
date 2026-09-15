import { useEffect, type RefObject } from "react";

export function useSelectedTabVisibility(ref: RefObject<HTMLElement | null>, selectedId: string) {
  useEffect(() => {
    const tabs = ref.current;
    if (!tabs) return;
    const revealSelection = () => {
      const selected = tabs.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!selected || !tabs.clientWidth) return;
      const container = tabs.getBoundingClientRect();
      const item = selected.getBoundingClientRect();
      if (item.left < container.left) tabs.scrollLeft += item.left - container.left;
      else if (item.right > container.right) tabs.scrollLeft += item.right - container.right;
    };
    revealSelection();
    const observer = new ResizeObserver(revealSelection);
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [ref, selectedId]);
}
