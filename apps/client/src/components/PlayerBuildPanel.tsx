import { Coins, Move, RotateCw, ShoppingBag, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ASSET_CATALOG, MAX_LAYOUT_OBJECTS_PER_FLOOR, MAX_OWNED_ASSETS, getDefaultAssetVariantId } from "@workhard/shared";
import type { AssetRotation, FloorLayout, GameSettings, LayoutItemReference, LayoutTool, PlayerEconomy } from "@workhard/shared";
import { getAssetOrientationLabel, rotateAssetClockwise } from "../asset-orientation";
import { AssetShape } from "./AssetShape";
import { AssetVariantPicker } from "./AssetVariantPicker";
import { IconButton } from "./IconButton";

type EconomyRequest =
  | { id: string; type: "daily" }
  | { id: string; type: "purchase"; assetId: string };

interface PlayerBuildPanelProps {
  currentUserId: string;
  economy: PlayerEconomy;
  gameSettings: GameSettings;
  layout: FloorLayout;
  tool: LayoutTool | null;
  assetId: string;
  assetVariantId: string;
  assetRotation: AssetRotation;
  placingOwnedAssetId?: string | undefined;
  selectedItem?: LayoutItemReference | undefined;
  movingItem?: LayoutItemReference | undefined;
  pendingEconomyRequest?: EconomyRequest | undefined;
  onClaimDaily: () => void;
  onPurchase: (assetId: string) => void;
  onPlace: (ownedAssetId: string, assetId: string) => void;
  onAssetVariantChange: (variantId: string) => void;
  onAssetRotationChange: (rotation: AssetRotation) => void;
  onMoveSelected: () => void;
  onRotateSelected: () => void;
  onRemoveSelected: () => void;
  onClose: () => void;
}

const shopCategories = ASSET_CATALOG.categories.filter((category) =>
  ASSET_CATALOG.assets.some((asset) => asset.category === category.id && asset.shop),
);

export function PlayerBuildPanel({
  currentUserId,
  economy,
  gameSettings,
  layout,
  tool,
  assetId,
  assetVariantId,
  assetRotation,
  placingOwnedAssetId,
  selectedItem,
  movingItem,
  pendingEconomyRequest,
  onClaimDaily,
  onPurchase,
  onPlace,
  onAssetVariantChange,
  onAssetRotationChange,
  onMoveSelected,
  onRotateSelected,
  onRemoveSelected,
  onClose,
}: PlayerBuildPanelProps) {
  const [view, setView] = useState<"inventory" | "shop">("inventory");
  const [categoryId, setCategoryId] = useState(shopCategories[0]!.id);
  const categoryAssets = ASSET_CATALOG.assets.filter((asset) => asset.category === categoryId && asset.shop);
  const selectedObject = selectedItem?.type === "asset"
    ? layout.objects.find((object) => object.id === selectedItem.id && object.ownerUserId === currentUserId)
    : undefined;
  const selectedAsset = selectedObject ? ASSET_CATALOG.assets.find((asset) => asset.id === selectedObject.assetId) : undefined;
  const editingAsset = ASSET_CATALOG.assets.find((asset) => asset.id === assetId);
  const canPlaceOnFloor = layout.rooms.some((room) =>
    room.access.mode === "assigned"
      ? room.access.assignedPersonIds.includes(currentUserId)
      : gameSettings.allowPlayerAssetPlacementInPublicRooms,
  );
  const inventoryGroups = useMemo(() => ASSET_CATALOG.assets.flatMap((asset) => {
    const instances = economy.inventory.filter((ownedAsset) => ownedAsset.assetId === asset.id);
    return instances.length > 0 ? [{ asset, instances }] : [];
  }), [economy.inventory]);
  const inventoryFull = economy.inventory.length >= MAX_OWNED_ASSETS;
  const floorFull = layout.objects.length >= MAX_LAYOUT_OBJECTS_PER_FLOOR;

  return (
    <aside className="side-panel build-panel player-build-panel" aria-label="Build">
      <div className="panel-header">
        <h2>Build</h2>
        <IconButton label="Close build tools" icon={X} onClick={onClose} />
      </div>
      <div className="panel-scroll build-panel-scroll">
        <section className="economy-summary" aria-label="Coins and daily bonus">
          <div className="coin-balance" aria-label={`${economy.coinBalance.toLocaleString()} coins`}>
            <Coins size={17} /><strong>{economy.coinBalance.toLocaleString()}</strong>
          </div>
          <div className="daily-reward">
            <div>
              <strong>Daily bonus</strong>
              {economy.dailyReward.streak > 0 && <span>{economy.dailyReward.streak}-day streak</span>}
            </div>
            <button
              className="primary-button"
              disabled={!economy.dailyReward.claimable || Boolean(pendingEconomyRequest)}
              onClick={onClaimDaily}
            >
              {pendingEconomyRequest?.type === "daily"
                ? "Claiming…"
                : economy.dailyReward.claimable ? `Claim ${economy.dailyReward.amount}` : "Claimed"}
            </button>
          </div>
        </section>

        {selectedObject && selectedAsset && (
          <section className="build-selection" aria-label={`Selected ${selectedAsset.name}`}>
            <strong>{selectedAsset.name}</strong>
            <div>
              <button className={selectedItemMatches(selectedItem, movingItem) ? "active" : ""} onClick={onMoveSelected}>
                <Move size={16} />Move
              </button>
              <button onClick={onRotateSelected}><RotateCw size={16} />Rotate</button>
              <button className="danger" onClick={onRemoveSelected}><Trash2 size={16} />Remove</button>
            </div>
          </section>
        )}

        <div className="asset-view-tabs" role="tablist" aria-label="Assets">
          <button role="tab" aria-selected={view === "inventory"} className={view === "inventory" ? "active" : ""} onClick={() => setView("inventory")}>Inventory</button>
          <button role="tab" aria-selected={view === "shop"} className={view === "shop" ? "active" : ""} onClick={() => setView("shop")}>Shop</button>
        </div>

        {view === "shop" ? (
          <section className="build-section asset-library" aria-label="Asset shop">
            <div className="asset-category-tabs" role="tablist" aria-label="Shop categories">
              {shopCategories.map((category) => (
                <button
                  key={category.id}
                  role="tab"
                  aria-selected={category.id === categoryId}
                  className={category.id === categoryId ? "active" : ""}
                  onClick={() => setCategoryId(category.id)}
                >
                  <span>{category.name}</span>
                </button>
              ))}
            </div>
            <div className="shop-grid" role="tabpanel">
              {categoryAssets.map((asset) => {
                const pending = pendingEconomyRequest?.type === "purchase" && pendingEconomyRequest.assetId === asset.id;
                const unavailable = !asset.shop!.available;
                const insufficient = economy.coinBalance < asset.shop!.price;
                const shortfall = asset.shop!.price - economy.coinBalance;
                const actionLabel = unavailable
                  ? "Unavailable"
                  : inventoryFull ? "Inventory full"
                    : insufficient ? `Need ${shortfall}` : "Buy";
                const accessibleActionLabel = unavailable
                  ? `${asset.name} unavailable`
                  : inventoryFull ? `Inventory full for ${asset.name}`
                    : insufficient ? `Need ${shortfall} more coins for ${asset.name}` : `Buy ${asset.name}`;
                return (
                  <article className="shop-asset" key={asset.id}>
                    <AssetShape asset={asset} />
                    <div><strong>{asset.name}</strong><span>{asset.shop!.price} coins</span></div>
                    <button
                      aria-label={accessibleActionLabel}
                      disabled={unavailable || inventoryFull || insufficient || Boolean(pendingEconomyRequest)}
                      onClick={() => onPurchase(asset.id)}
                    >
                      {pending ? "Buying…" : actionLabel}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="build-section asset-library" aria-label="Inventory">
            {inventoryGroups.length === 0 ? (
              <div className="inventory-empty">
                <ShoppingBag size={22} />
                <span>No assets yet.</span>
                <button onClick={() => setView("shop")}>Open shop</button>
              </div>
            ) : (
              <div className="inventory-grid">
                {inventoryGroups.map(({ asset, instances }) => {
                  const available = instances.filter((instance) => !instance.placement);
                  const placing = instances.some((instance) => instance.id === placingOwnedAssetId);
                  return (
                    <article className={placing ? "inventory-asset active" : "inventory-asset"} key={asset.id}>
                      <AssetShape asset={asset} variantId={asset.id === assetId ? assetVariantId : getDefaultAssetVariantId(asset)} />
                      <div><strong>{asset.name}</strong><span>{available.length} available · {instances.length - available.length} placed</span></div>
                      <button
                        disabled={available.length === 0 || !canPlaceOnFloor || floorFull}
                        onClick={() => onPlace(available[0]!.id, asset.id)}
                      >
                        {placing ? "Placing…" : floorFull ? "Floor full" : "Place"}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
            {!canPlaceOnFloor && inventoryGroups.length > 0 && (
              <span className="room-validation">No rooms on this floor allow placement.</span>
            )}
          </section>
        )}
        {((tool === "asset" && placingOwnedAssetId) || movingItem?.type === "asset") && editingAsset && (
          <section className="build-section asset-placement-options">
            <AssetVariantPicker asset={editingAsset} value={assetVariantId} onChange={onAssetVariantChange} />
            <button
              className="asset-rotate"
              aria-label={`Rotate asset clockwise, currently facing ${getAssetOrientationLabel(assetRotation)}`}
              onClick={() => onAssetRotationChange(rotateAssetClockwise(assetRotation))}
            >
              <RotateCw size={16} /><span>Rotate · {getAssetOrientationLabel(assetRotation)}</span><kbd>R</kbd>
            </button>
          </section>
        )}
      </div>
    </aside>
  );
}

function selectedItemMatches(left?: LayoutItemReference, right?: LayoutItemReference): boolean {
  return Boolean(left && right && left.type === right.type && left.id === right.id);
}
