import { Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { ASSET_CATALOG, MAX_OWNED_ASSETS, isPermanentAsset, type AssetRarity, type PlayerEconomy } from "@workhard/shared";
import { useHorizontalWheelScroll } from "../hooks/useHorizontalWheelScroll";
import { useSelectedTabVisibility } from "../hooks/useSelectedTabVisibility";
import { AssetRarityFilter } from "./AssetRarityFilter";
import { AssetShape } from "./AssetShape";

interface PlayerAssetShopProps {
  economy: PlayerEconomy;
  pending: boolean;
  purchasingAssetId?: string | undefined;
  onPurchase: (assetId: string) => void;
}

const categories = [
  { id: "all", name: "All" },
  ...ASSET_CATALOG.categories.filter((category) => ASSET_CATALOG.assets.some((asset) => asset.category === category.id && asset.shop && !isPermanentAsset(asset.id))),
];

export function PlayerAssetShop({ economy, pending, purchasingAssetId, onPurchase }: PlayerAssetShopProps) {
  const panelId = useId();
  const tabsRef = useRef<HTMLDivElement>(null);
  const scrollTabs = useHorizontalWheelScroll(tabsRef);
  const [categoryId, setCategoryId] = useState("all");
  const [rarity, setRarity] = useState<AssetRarity | "all">("all");
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const assets = ASSET_CATALOG.assets.filter((asset) => asset.shop
    && !isPermanentAsset(asset.id)
    && (categoryId === "all" || asset.category === categoryId)
    && (rarity === "all" || asset.rarity === rarity)
    && asset.name.toLocaleLowerCase().includes(query));
  const inventoryFull = economy.inventory.length >= MAX_OWNED_ASSETS;

  useSelectedTabVisibility(tabsRef, categoryId);

  return <section className="player-asset-shop" aria-label="Asset shop">
    <div className="shop-filters">
      <div className="shop-search">
        <Search size={16} aria-hidden="true" />
        <input aria-label="Search shop" placeholder="Search assets" value={search} onChange={(event) => {
          setSearch(event.target.value);
          setCategoryId("all");
        }} />
        {search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={16} /></button>}
      </div>
      <AssetRarityFilter value={rarity} onChange={setRarity} />
    </div>
    <div ref={scrollTabs} className="asset-category-tabs" role="tablist" aria-label="Shop categories">
      {categories.map((category, index) => <button key={category.id} id={`${panelId}-${category.id}`} role="tab"
        aria-selected={category.id === categoryId} aria-controls={`${panelId}-assets`} tabIndex={category.id === categoryId ? 0 : -1}
        className={category.id === categoryId ? "active" : ""} onClick={() => setCategoryId(category.id)}
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
        }}><span>{category.name}</span></button>)}
    </div>
    <div key={`${categoryId}-${rarity}-${query}`} className="panel-scroll shop-results" id={`${panelId}-assets`}
      role="tabpanel" aria-labelledby={`${panelId}-${categoryId}`} tabIndex={0}>
      <div className="shop-grid">
        {assets.length === 0 && <div className="shop-empty">
          <span role="status">No assets match.</span>
          <button className="secondary-button" onClick={() => { setSearch(""); setRarity("all"); setCategoryId("all"); }}>Clear filters</button>
        </div>}
        {assets.map((asset) => {
          const unavailable = !asset.shop!.available;
          const insufficient = economy.coinBalance < asset.shop!.price;
          const shortfall = asset.shop!.price - economy.coinBalance;
          const actionLabel = unavailable ? "Unavailable" : inventoryFull ? "Inventory full" : insufficient ? `Need ${shortfall}` : "Buy";
          const accessibleActionLabel = unavailable ? `${asset.name} unavailable` : inventoryFull ? `Inventory full for ${asset.name}`
            : insufficient ? `Need ${shortfall} more coins for ${asset.name}` : `Buy ${asset.name}`;
          return <article className="shop-asset" key={asset.id}>
            <AssetShape asset={asset} />
            <div><strong>{asset.name}</strong><span>{asset.shop!.price} coins</span></div>
            <button aria-label={accessibleActionLabel} disabled={unavailable || inventoryFull || insufficient || pending}
              onClick={() => onPurchase(asset.id)}>{purchasingAssetId === asset.id ? "Buying…" : actionLabel}</button>
          </article>;
        })}
      </div>
    </div>
  </section>;
}
