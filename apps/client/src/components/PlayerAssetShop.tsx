import { ASSET_CATALOG, MAX_OWNED_ASSETS, isPermanentAsset, type PlayerEconomy } from "@workhard/shared";
import { AssetBrowser } from "./AssetBrowser";
import { AssetFeatureIndicators } from "./AssetFeatureIndicators";
import { AssetShape } from "./AssetShape";

interface PlayerAssetShopProps {
  economy: PlayerEconomy;
  pending: boolean;
  purchasingAssetId?: string | undefined;
  onPurchase: (assetId: string) => void;
}

const shopAssets = ASSET_CATALOG.assets.filter((asset) => asset.shop && !isPermanentAsset(asset.id));

export function PlayerAssetShop({ economy, pending, purchasingAssetId, onPurchase }: PlayerAssetShopProps) {
  const inventoryFull = economy.inventory.length >= MAX_OWNED_ASSETS;

  return <section className="player-asset-shop" aria-label="Asset shop">
    <AssetBrowser assets={shopAssets} categoryLabel="Shop categories" renderAsset={(asset) => {
      const unavailable = !asset.shop!.available;
      const insufficient = economy.coinBalance < asset.shop!.price;
      const shortfall = asset.shop!.price - economy.coinBalance;
      const actionLabel = unavailable ? "Shared only" : inventoryFull ? "Inventory full" : insufficient ? `Need ${shortfall}` : "Buy";
      const accessibleActionLabel = unavailable ? `${asset.name} is available in Shared` : inventoryFull ? `Inventory full for ${asset.name}`
        : insufficient ? `Need ${shortfall} more coins for ${asset.name}` : `Buy ${asset.name}`;
      return <article className="catalog-asset shop-asset" key={asset.id} data-rarity={asset.rarity} aria-description={`${asset.rarity} rarity`}>
        <AssetShape asset={asset} />
        <div className="catalog-asset-details"><strong>{asset.name}</strong><span>{asset.shop!.price} coins</span></div>
        <span className="catalog-asset-features"><AssetFeatureIndicators asset={asset} /></span>
        <button aria-label={accessibleActionLabel} disabled={unavailable || inventoryFull || insufficient || pending}
          onClick={() => onPurchase(asset.id)}>{purchasingAssetId === asset.id ? "Buying…" : actionLabel}</button>
      </article>;
    }} />
  </section>;
}
