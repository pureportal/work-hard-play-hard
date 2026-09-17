import { useId, useRef, type ReactNode } from "react";
import { useHorizontalWheelScroll } from "../hooks/useHorizontalWheelScroll";
import { useSelectedTabVisibility } from "../hooks/useSelectedTabVisibility";

export function DialogTabs<T extends string>({ label, tabs, value, onChange, children }: {
  label: string; tabs: readonly { id: T; label: string; count?: number }[]; value: T; onChange: (value: T) => void; children: ReactNode;
}) {
  const id = useId();
  const tabsRef = useRef<HTMLDivElement>(null);
  const scrollTabs = useHorizontalWheelScroll(tabsRef);
  useSelectedTabVisibility(tabsRef, value);
  return <>
    <div ref={scrollTabs} className="dialog-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button key={tab.id} id={`${id}-${tab.id}`} type="button" role="tab"
        aria-selected={value === tab.id} aria-controls={`${id}-content`} tabIndex={value === tab.id ? 0 : -1}
        onClick={() => onChange(tab.id)} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
            : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined;
          if (next === undefined) return;
          event.preventDefault();
          onChange(tabs[next]!.id);
          document.getElementById(`${id}-${tabs[next]!.id}`)?.focus();
        }}>{tab.label}{Boolean(tab.count) && <span className="dialog-tab-count">{tab.count}</span>}</button>)}
    </div>
    <div className="dialog-tab-content" role="tabpanel" id={`${id}-content`} aria-labelledby={`${id}-${value}`} tabIndex={0}>{children}</div>
  </>;
}
