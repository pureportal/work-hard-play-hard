import { Coins, Move, RotateCw, ShoppingBag, Trash2, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { ASSET_CATALOG, MAX_LAYOUT_OBJECTS_PER_FLOOR, getDefaultAssetVariantId, roomBuildAllows } from "@workhard/shared";
import type { AssetRotation, FloorLayout, GameSettings, LayoutItemReference, LayoutTool, OrganisationState, PlayerEconomy } from "@workhard/shared";
import { getAssetOrientationLabel, rotateAssetClockwise } from "../asset-orientation";
import { AssetShape } from "./AssetShape";
import { AssetVariantPicker } from "./AssetVariantPicker";
import { IconButton } from "./IconButton";
import { PlayerAssetShop } from "./PlayerAssetShop";
import "../player-build-panel.css";

type EconomyRequest =
  | { id: string; type: "daily" }
  | { id: string; type: "purchase"; assetId: string };

interface PlayerBuildPanelProps {
  currentUserId: string;
  organisation: OrganisationState;
  onOpenRooms: () => void;
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

export function PlayerBuildPanel({
  currentUserId,
  organisation,
  onOpenRooms,
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
  const panelId = useId();
  const selectedObject = selectedItem?.type === "asset"
    ? layout.objects.find((object) => object.id === selectedItem.id && object.ownerUserId === currentUserId)
    : undefined;
  const selectedAsset = selectedObject ? ASSET_CATALOG.assets.find((asset) => asset.id === selectedObject.assetId) : undefined;
  const editingAsset = ASSET_CATALOG.assets.find((asset) => asset.id === assetId);
  const canPlaceOnFloor = layout.rooms.some((room) => roomBuildAllows(room, currentUserId, gameSettings, organisation));
  const inventoryGroups = useMemo(() => ASSET_CATALOG.assets.flatMap((asset) => {
    const instances = economy.inventory.filter((ownedAsset) => ownedAsset.assetId === asset.id);
    return instances.length > 0 ? [{ asset, instances }] : [];
  }), [economy.inventory]);
  const floorFull = layout.objects.length >= MAX_LAYOUT_OBJECTS_PER_FLOOR;
  const dailyBonus = (
    <section className="economy-summary" aria-label="Daily bonus">
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
  );

  return (
    <aside className="side-panel build-panel player-build-panel" aria-label="Build">
      <div className="panel-header">
        <h2>Build</h2>
        <button className="secondary-button" onClick={onOpenRooms}>Room settings</button>
        <div className="build-panel-actions">
          <div className="coin-balance" aria-label={`${economy.coinBalance.toLocaleString()} coins`}>
            <Coins size={17} /><strong>{economy.coinBalance.toLocaleString()}</strong>
          </div>
          <IconButton label="Close build tools" icon={X} onClick={onClose} />
        </div>
      </div>
      <div className="asset-view-tabs" role="tablist" aria-label="Assets">
        {(["inventory", "shop"] as const).map((tab) => <button key={tab} id={`${panelId}-${tab}-tab`} role="tab"
          aria-selected={view === tab} aria-controls={`${panelId}-${tab}`} tabIndex={view === tab ? 0 : -1}
          className={view === tab ? "active" : ""} onClick={() => setView(tab)} onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? "inventory" : event.key === "End" ? "shop" : view === "inventory" ? "shop" : "inventory";
            setView(next);
            document.getElementById(`${panelId}-${next}-tab`)?.focus();
          }}>{tab === "inventory" ? "Inventory" : "Shop"}</button>)}
      </div>
      <div className="player-shop-view" id={`${panelId}-shop`} role="tabpanel" aria-labelledby={`${panelId}-shop-tab`} hidden={view !== "shop"}>
        <PlayerAssetShop economy={economy} pending={Boolean(pendingEconomyRequest)}
          purchasingAssetId={pendingEconomyRequest?.type === "purchase" ? pendingEconomyRequest.assetId : undefined} onPurchase={onPurchase} />
      </div>
      <div className="panel-scroll build-panel-scroll" id={`${panelId}-inventory`} role="tabpanel" aria-labelledby={`${panelId}-inventory-tab`} hidden={view !== "inventory"}>
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
                    <AssetShape asset={asset} rotation={asset.id === assetId ? assetRotation : 0} variantId={asset.id === assetId ? assetVariantId : getDefaultAssetVariantId(asset)} />
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
        {((tool === "asset" && placingOwnedAssetId) || movingItem?.type === "asset") && editingAsset && (
          <section className="build-section asset-placement-options">
            <AssetVariantPicker asset={editingAsset} rotation={assetRotation} value={assetVariantId} onChange={onAssetVariantChange} />
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
      {dailyBonus}
    </aside>
  );
}

function selectedItemMatches(left?: LayoutItemReference, right?: LayoutItemReference): boolean {
  return Boolean(left && right && left.type === right.type && left.id === right.id);
}
