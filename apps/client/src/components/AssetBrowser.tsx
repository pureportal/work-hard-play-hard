import { Film, MousePointerClick, Search, X } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { ASSET_CATALOG, ASSET_RARITIES, type AssetDefinition, type AssetRarity } from "@workhard/shared";
import { useHorizontalWheelScroll } from "../hooks/useHorizontalWheelScroll";
import { useSelectedTabVisibility } from "../hooks/useSelectedTabVisibility";
import { hasAssetFeature, type AssetFeature } from "../asset-features";
import { AssetRarityFilter } from "./AssetRarityFilter";
import "../asset-browser.css";

interface AssetBrowserProps {
  assets: AssetDefinition[];
  categoryLabel: string;
  empty?: ReactNode;
  footer?: ReactNode;
  renderAsset: (asset: AssetDefinition) => ReactNode;
}

export function AssetBrowser({ assets, categoryLabel, empty, footer, renderAsset }: AssetBrowserProps) {
  const panelId = useId();
  const tabsRef = useRef<HTMLDivElement>(null);
  const scrollTabs = useHorizontalWheelScroll(tabsRef);
  const [categoryId, setCategoryId] = useState("all");
  const [rarity, setRarity] = useState<AssetRarity | "all">("all");
  const [feature, setFeature] = useState<AssetFeature | "all">("all");
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const categories = [
    { id: "all", name: "All" },
    ...ASSET_CATALOG.categories.filter((category) => assets.some((asset) => asset.category === category.id)),
  ];
  const selectedCategoryId = categories.some((category) => category.id === categoryId) ? categoryId : "all";
  const visibleAssets = assets.filter((asset) => (selectedCategoryId === "all" || asset.category === selectedCategoryId)
    && (rarity === "all" || asset.rarity === rarity)
    && (feature === "all" || hasAssetFeature(asset, feature))
    && asset.name.toLocaleLowerCase().includes(query));
  if (selectedCategoryId !== "all") {
    visibleAssets.sort((left, right) => ASSET_RARITIES.indexOf(left.rarity) - ASSET_RARITIES.indexOf(right.rarity));
  }

  useSelectedTabVisibility(tabsRef, selectedCategoryId);

  return <div className="asset-browser">
    {assets.length > 0 && <>
      <div className="asset-browser-filters">
        <div className="asset-browser-search">
          <Search size={16} aria-hidden="true" />
          <input aria-label="Search assets" placeholder="Search assets" value={search} onChange={(event) => {
            setSearch(event.target.value);
            if (event.target.value) setCategoryId("all");
          }} />
          {search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={16} /></button>}
        </div>
        <AssetRarityFilter value={rarity} onChange={setRarity} />
      </div>
      <div className="asset-feature-filters" role="group" aria-label="Asset features">
        <button className={feature === "animated" ? "active" : ""} aria-pressed={feature === "animated"}
          onClick={() => setFeature(feature === "animated" ? "all" : "animated")}>
          <Film size={15} aria-hidden="true" />Animated
        </button>
        <button className={feature === "interactive" ? "active" : ""} aria-pressed={feature === "interactive"}
          onClick={() => setFeature(feature === "interactive" ? "all" : "interactive")}>
          <MousePointerClick size={15} aria-hidden="true" />Interactive
        </button>
      </div>
      <div ref={scrollTabs} className="asset-category-tabs" role="tablist" aria-label={categoryLabel}>
        {categories.map((category, index) => <button key={category.id} id={`${panelId}-${category.id}`} role="tab"
          aria-selected={category.id === selectedCategoryId} aria-controls={`${panelId}-assets`} tabIndex={category.id === selectedCategoryId ? 0 : -1}
          className={category.id === selectedCategoryId ? "active" : ""} onClick={() => setCategoryId(category.id)}
          onKeyDown={(event) => {
            let next: number;
            switch (event.key) {
              case "ArrowRight": next = (index + 1) % categories.length; break;
              case "ArrowLeft": next = (index + categories.length - 1) % categories.length; break;
              case "Home": next = 0; break;
              case "End": next = categories.length - 1; break;
              default: return;
            }
            event.preventDefault();
            setCategoryId(categories[next]!.id);
            tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
          }}>{category.name}</button>)}
      </div>
    </>}
    <div key={`${selectedCategoryId}-${rarity}-${feature}-${query}`} className="asset-browser-results" id={`${panelId}-assets`}
      role="tabpanel" aria-labelledby={assets.length ? `${panelId}-${selectedCategoryId}` : undefined} tabIndex={0}>
      {assets.length === 0 ? empty : <div className="asset-browser-grid">
        {visibleAssets.length === 0 && <div className="asset-browser-empty">
          <span role="status">No assets match.</span>
          <button className="secondary-button" onClick={() => { setSearch(""); setRarity("all"); setFeature("all"); setCategoryId("all"); }}>Clear filters</button>
        </div>}
        {visibleAssets.map(renderAsset)}
      </div>}
    </div>
    {footer}
  </div>;
}
