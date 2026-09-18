export type BuildView = "personal" | "shared" | "donate" | "funds";

export function BuildEconomyNavigation({ view, onChange }: { view: BuildView; onChange: (view: BuildView) => void }) {
  return <nav className="build-economy-navigation" aria-label="Build accounts">
    {(["personal", "shared", "donate", "funds"] as const).map((value) => <button key={value} type="button"
      aria-current={view === value ? "page" : undefined} className={view === value ? "active" : ""}
      onClick={() => onChange(value)}>{value === "personal" ? "Personal" : value === "shared" ? "Shared" : value === "donate" ? "Donate" : "Approvals"}</button>)}
  </nav>;
}
