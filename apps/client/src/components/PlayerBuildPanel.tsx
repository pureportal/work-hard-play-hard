import { Archive, Coins, Gift, Move, RotateCw, ShoppingBag } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ASSET_CATALOG, MAX_LAYOUT_OBJECTS_PER_FLOOR, getDefaultAssetVariantId, roomAccessAllows, roomBuildAllows } from "@workhard/shared";
import type { AssetRotation, Floor, FloorLayout, GameSettings, LayoutItemReference, LayoutTool, OrganisationState, PlayerEconomy } from "@workhard/shared";
import { getAssetOrientationLabel, rotateAssetClockwise } from "../asset-orientation";
import { AssetShape } from "./AssetShape";
import { AssetBrowser } from "./AssetBrowser";
import { AssetFeatureIndicators } from "./AssetFeatureIndicators";
import { AssetVariantPicker } from "./AssetVariantPicker";
import { SurfaceHeader } from "./SurfaceHeader";
import { PlayerAssetShop } from "./PlayerAssetShop";
import { AssetDispositionDialog } from "./economy/AssetDispositionDialog";
import { PersonalPlacedAssets } from "./PersonalPlacedAssets";
import "../player-build-panel.css";

type EconomyRequest =
  | { id: string; type: "daily" }
  | { id: string; type: "purchase"; assetId: string };

interface PlayerBuildPanelProps {
  accountControls?: ReactNode;
  projectControls?: ReactNode;
  onSell?: (ownedAssetId: string) => void;
  onDonate?: (ownedAssetId: string) => void;
  currentUserId: string;
  playerFloorId: string;
  organisation: OrganisationState;
  onOpenRooms: () => void;
  economy: PlayerEconomy;
  gameSettings: GameSettings;
  layout: FloorLayout;
  layouts: FloorLayout[];
  floors: Floor[];
  tool: LayoutTool | null;
  assetId: string;
  assetVariantId: string;
  assetRotation: AssetRotation;
  placingOwnedAssetId?: string | undefined;
  draftAssetIds?: string[] | undefined;
  selectedItem?: LayoutItemReference | undefined;
  movingItem?: LayoutItemReference | undefined;
  pendingEconomyRequest?: EconomyRequest | undefined;
  pendingPublicAction?: boolean;
  publicActionError?: string | undefined;
  onOpenDaily: () => void;
  onPurchase: (assetId: string) => void;
  onPlace: (ownedAssetId: string, assetId: string) => void;
  onFocus: (floorId: string, objectId: string) => void;
  onAssetVariantChange: (variantId: string) => void;
  onAssetRotationChange: (rotation: AssetRotation) => void;
  onMoveSelected: () => void;
  onRotateSelected: () => void;
  onRemoveSelected: () => void;
  onClose: () => void;
}

export function PlayerBuildPanel({
  accountControls,
  projectControls,
  onSell,
  onDonate,
  currentUserId,
  playerFloorId,
  organisation,
  onOpenRooms,
  economy,
  gameSettings,
  layout,
  layouts,
  floors,
  tool,
  assetId,
  assetVariantId,
  assetRotation,
  placingOwnedAssetId,
  draftAssetIds = [],
  selectedItem,
  movingItem,
  pendingEconomyRequest,
  pendingPublicAction = false,
  publicActionError,
  onOpenDaily,
  onPurchase,
  onPlace,
  onFocus,
  onAssetVariantChange,
  onAssetRotationChange,
  onMoveSelected,
  onRotateSelected,
  onRemoveSelected,
  onClose,
}: PlayerBuildPanelProps) {
  const tabs = ["inventory", "placed", "shop"] as const;
  const [view, setView] = useState<typeof tabs[number]>("inventory");
  const panelId = useId();
  const [disposition, setDisposition] = useState<{ assetId: string; action: "sell" | "donate" }>();
  const disposingAsset = economy.inventory.find((asset) => asset.id === disposition?.assetId && !asset.placement);
  useEffect(() => { if (disposition && !disposingAsset) setDisposition(undefined); }, [disposition, disposingAsset]);
  const selectedObject = selectedItem?.type === "asset"
    ? layout.objects.find((object) => object.id === selectedItem.id && object.ownerUserId === currentUserId)
    : undefined;
  const selectedAsset = selectedObject ? ASSET_CATALOG.assets.find((asset) => asset.id === selectedObject.assetId) : undefined;
  const editingAsset = ASSET_CATALOG.assets.find((asset) => asset.id === assetId);
  const canPlaceOnFloor = layout.rooms.some((room) => roomBuildAllows(room, currentUserId, gameSettings, organisation)
    || roomAccessAllows(room, currentUserId, gameSettings, organisation) && room.personalAreas?.some((area) => area.ownerUserId === currentUserId));
  const inventoryGroups = useMemo(() => ASSET_CATALOG.assets.flatMap((asset) => {
    const instances = economy.inventory.filter((ownedAsset) => ownedAsset.assetId === asset.id);
    return instances.length > 0 ? [{ asset, instances }] : [];
  }), [economy.inventory]);
  const inventoryByAssetId = useMemo(() => new Map(inventoryGroups.map((group) => [group.asset.id, group.instances])), [inventoryGroups]);
  const floorFull = layout.objects.length >= MAX_LAYOUT_OBJECTS_PER_FLOOR;
  const viewingPlayerFloor = layout.floorId === playerFloorId;
  const selectionControls = <>
    {!viewingPlayerFloor && <p className="personal-floor-notice">Visit this floor to edit or place items.</p>}
    {selectedObject && selectedAsset && (
      <section className="build-selection" aria-label={`Selected ${selectedAsset.name}`}>
        <strong>{selectedObject.label ?? selectedAsset.name}</strong>
        <div>
          <button className={`inventory-action${selectedItemMatches(selectedItem, movingItem) ? " active" : ""}`} disabled={!viewingPlayerFloor} onClick={onMoveSelected}>
            <Move size={16} aria-hidden="true" />{selectedItemMatches(selectedItem, movingItem) ? "Cancel move" : "Move"}
          </button>
          <button className="inventory-action" disabled={!viewingPlayerFloor} onClick={onRotateSelected}><RotateCw size={16} aria-hidden="true" />Rotate</button>
          <button className="inventory-action inventory-action-store" onClick={onRemoveSelected}><Archive size={16} aria-hidden="true" />Store</button>
        </div>
      </section>
    )}
  </>;
  const dailyBonus = (
    <section className="economy-summary" aria-label="Daily bonus">
      <div className="daily-reward">
        <div>
          <strong>Daily bonus</strong>
          {economy.dailyReward.streak > 0 && <span>{economy.dailyReward.streak}-day streak</span>}
        </div>
        <button
          className="primary-button"
          onClick={onOpenDaily}
        >
          <Gift size={16} aria-hidden="true" />Open bonus
        </button>
      </div>
    </section>
  );

  return (
    <aside className="side-panel build-panel player-build-panel" aria-label="Build">
      <SurfaceHeader className="panel-header" title="Build" closeLabel="Close build tools" onClose={onClose}
        description={<span className="coin-balance" data-guide="wallet" aria-label={`${economy.coinBalance.toLocaleString()} coins`}>
          <Coins size={15} aria-hidden="true" /><strong>{economy.coinBalance.toLocaleString()}</strong>
        </span>}
        actions={<button className="secondary-button build-access-button" onClick={onOpenRooms}>Room settings</button>} />
      {accountControls}
      <div className="asset-view-tabs" role="tablist" aria-label="Assets" data-guide="assets">
        {tabs.map((tab) => <button key={tab} id={`${panelId}-${tab}-tab`} role="tab"
          aria-selected={view === tab} aria-controls={`${panelId}-${tab}`} tabIndex={view === tab ? 0 : -1}
          className={view === tab ? "active" : ""} onClick={() => setView(tab)} onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1]!
              : tabs[(tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]!;
            setView(next);
            document.getElementById(`${panelId}-${next}-tab`)?.focus();
          }}>{tab === "inventory" ? "Inventory" : tab === "placed" ? "Placed" : "Shop"}</button>)}
      </div>
      <div className="player-shop-view" id={`${panelId}-shop`} role="tabpanel" aria-labelledby={`${panelId}-shop-tab`} hidden={view !== "shop"}>
        <PlayerAssetShop economy={economy} pending={Boolean(pendingEconomyRequest)}
          purchasingAssetId={pendingEconomyRequest?.type === "purchase" ? pendingEconomyRequest.assetId : undefined} onPurchase={onPurchase} />
      </div>
      <div className="panel-scroll build-panel-scroll" id={`${panelId}-placed`} role="tabpanel" aria-labelledby={`${panelId}-placed-tab`} hidden={view !== "placed"}>
        {view === "placed" && selectionControls}
        <PersonalPlacedAssets currentUserId={currentUserId} layouts={layouts} floors={floors}
          activeFloorId={layout.floorId} selectedItem={selectedItem} onFocus={onFocus} />
      </div>
      <div className="player-inventory-view" id={`${panelId}-inventory`} role="tabpanel" aria-labelledby={`${panelId}-inventory-tab`} hidden={view !== "inventory"}>
        {view === "inventory" && selectionControls}
        <section className="build-section asset-library" aria-label="Inventory">
          <AssetBrowser assets={inventoryGroups.map(({ asset }) => asset)} categoryLabel="Inventory categories" empty={
            <div className="inventory-empty">
              <ShoppingBag size={22} />
              <span>No assets yet.</span>
              <button onClick={() => setView("shop")}>Open shop</button>
            </div>
          } renderAsset={(asset) => {
                const instances = inventoryByAssetId.get(asset.id)!;
                const available = instances.filter((instance) => !instance.placement && !draftAssetIds.includes(instance.id));
                const drafted = instances.filter((instance) => !instance.placement && draftAssetIds.includes(instance.id)).length;
                const placing = instances.some((instance) => instance.id === placingOwnedAssetId);
                return (
                  <article className={`catalog-asset inventory-asset${placing ? " active" : ""}`} key={asset.id} data-rarity={asset.rarity}>
                    <AssetShape asset={asset} rotation={asset.id === assetId ? assetRotation : 0} variantId={asset.id === assetId ? assetVariantId : getDefaultAssetVariantId(asset)} />
                    <div className="catalog-asset-details"><span className="catalog-asset-name"><strong>{asset.name}</strong><AssetFeatureIndicators asset={asset} /></span><span>{available.length} available · {instances.length - available.length - drafted} placed{drafted ? ` · ${drafted} in draft` : ""}</span></div>
                    <button
                      disabled={pendingPublicAction || Boolean(pendingEconomyRequest) || available.length === 0 || !viewingPlayerFloor || !canPlaceOnFloor || floorFull}
                      onClick={() => onPlace(available[0]!.id, asset.id)}
                    >
                      {placing ? "Placing…" : floorFull ? "Floor full" : "Place"}
                    </button>
                    {available[0] && (onSell || onDonate) && <div className="inventory-actions">
                      {onSell && <button className="inventory-action inventory-action-sell" disabled={pendingPublicAction || Boolean(pendingEconomyRequest)}
                        aria-label={`Sell ${asset.name} for ${Math.floor(available[0]!.purchasePrice / 3)} coins`} onClick={() => setDisposition({ assetId: available[0]!.id, action: "sell" })}>
                        <Coins size={17} aria-hidden="true" />Sell <span className="inventory-sale-value">{Math.floor(available[0]!.purchasePrice / 3)}</span>
                      </button>}
                      {onDonate && <button className="inventory-action" aria-label={`Donate ${asset.name}`} disabled={pendingPublicAction || Boolean(pendingEconomyRequest)} onClick={() => setDisposition({ assetId: available[0]!.id, action: "donate" })}>
                        <Gift size={16} aria-hidden="true" />Donate
                      </button>}
                    </div>}
                  </article>
                );
              }} footer={((tool === "asset" && placingOwnedAssetId) || movingItem?.type === "asset") && editingAsset && (
              <div className="asset-placement-options">
                <AssetVariantPicker asset={editingAsset} rotation={assetRotation} value={assetVariantId} onChange={onAssetVariantChange} />
                <button className="asset-rotate"
                  aria-label={`Rotate asset clockwise, currently facing ${getAssetOrientationLabel(assetRotation)}`}
                  onClick={() => onAssetRotationChange(rotateAssetClockwise(assetRotation))}>
                  <RotateCw size={16} /><span>Rotate · {getAssetOrientationLabel(assetRotation)}</span><kbd>R</kbd>
                </button>
              </div>
            )} />
          {!canPlaceOnFloor && inventoryGroups.length > 0 && (
            <span className="room-validation">No rooms on this floor allow placement.</span>
          )}
        </section>
      </div>
      {projectControls ?? dailyBonus}
      {disposition && disposingAsset && <AssetDispositionDialog asset={disposingAsset} action={disposition.action} pending={pendingPublicAction}
        error={publicActionError}
        onClose={() => setDisposition(undefined)} onConfirm={() => {
          if (disposition.action === "sell") onSell?.(disposingAsset.id);
          else onDonate?.(disposingAsset.id);
        }} />}
    </aside>
  );
}

function selectedItemMatches(left?: LayoutItemReference, right?: LayoutItemReference): boolean {
  return Boolean(left && right && left.type === right.type && left.id === right.id);
}
