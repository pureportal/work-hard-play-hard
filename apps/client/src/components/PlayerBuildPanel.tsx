import { Archive, Coins, Copy, Gift, Move, RotateCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ASSET_CATALOG, MAX_LAYOUT_OBJECTS_PER_FLOOR, MAX_OWNED_ASSETS, availablePublicMoney, isPermanentAsset, getDefaultAssetVariantId, roomAccessAllows, roomBuildAllows } from "@workhard/shared";
import type { AssetRotation, Floor, FloorLayout, GameSettings, LayoutItemReference, LayoutTool, OrganisationState, PlayerEconomy, PublicEconomy } from "@workhard/shared";
import { getAssetOrientationLabel, rotateAssetClockwise } from "../asset-orientation";
import { AssetShape } from "./AssetShape";
import { AssetBrowser } from "./AssetBrowser";
import { AssetFeatureIndicators } from "./AssetFeatureIndicators";
import { AssetVariantPicker } from "./AssetVariantPicker";
import { SurfaceHeader } from "./SurfaceHeader";
import { AssetDispositionDialog } from "./economy/AssetDispositionDialog";
import { PersonalPlacedAssets } from "./PersonalPlacedAssets";
import { useContextActions, type ContextAction } from "./ContextMenu";
import "../player-build-panel.css";

type EconomyRequest = { id: string; type: "daily" };

interface PlayerBuildPanelProps {
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
  draftAssetIds?: string[] | undefined;
  selectedItem?: LayoutItemReference | undefined;
  movingItem?: LayoutItemReference | undefined;
  pendingEconomyRequest?: EconomyRequest | undefined;
  pendingPublicAction?: boolean;
  publicActionError?: string | undefined;
  ownership: "personal" | "shared";
  publicEconomy: PublicEconomy;
  draftPublicAssetIds?: string[] | undefined;
  onOwnershipChange: (ownership: "personal" | "shared") => void;
  onSelectAsset: (assetId: string, ownedAssetId?: string, publicAssetId?: string) => void;
  onOpenStructure: () => void;
  onOpenSharedTransfer: () => void;
  onProposeSale: (publicAssetId: string) => void;
  onFocus: (floorId: string, objectId: string) => void;
  onAssetVariantChange: (variantId: string) => void;
  onAssetRotationChange: (rotation: AssetRotation) => void;
  onMoveSelected: () => void;
  onCopySelected?: () => void;
  onRotateSelected: () => void;
  onRemoveSelected: () => void;
  onClose: () => void;
}

const catalogAssets = ASSET_CATALOG.assets.filter((asset) => asset.buildable && asset.shop && !isPermanentAsset(asset.id) && asset.kind !== "portal");

export function PlayerBuildPanel({
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
  draftAssetIds = [],
  selectedItem,
  movingItem,
  pendingEconomyRequest,
  pendingPublicAction = false,
  publicActionError,
  ownership,
  publicEconomy,
  draftPublicAssetIds = [],
  onOwnershipChange,
  onSelectAsset,
  onOpenStructure,
  onOpenSharedTransfer,
  onProposeSale,
  onFocus,
  onAssetVariantChange,
  onAssetRotationChange,
  onMoveSelected,
  onCopySelected,
  onRotateSelected,
  onRemoveSelected,
  onClose,
}: PlayerBuildPanelProps) {
  const contextActions = useContextActions();
  const [placedOpen, setPlacedOpen] = useState(false);
  const [disposition, setDisposition] = useState<{ assetId: string; action: "sell" | "donate" }>();
  const disposingAsset = economy.inventory.find((asset) => asset.id === disposition?.assetId && !asset.placement);
  useEffect(() => { if (disposition && !disposingAsset) setDisposition(undefined); }, [disposition, disposingAsset]);
  const selectedObject = selectedItem?.type === "asset"
    ? layout.objects.find((object) => object.id === selectedItem.id && (ownership === "shared" || object.ownerUserId === currentUserId))
    : undefined;
  const selectedAsset = selectedObject ? ASSET_CATALOG.assets.find((asset) => asset.id === selectedObject.assetId) : undefined;
  const editingAsset = ASSET_CATALOG.assets.find((asset) => asset.id === assetId);
  const canPlaceOnFloor = layout.rooms.some((room) => roomBuildAllows(room, currentUserId, gameSettings, organisation)
    || ownership === "personal" && roomAccessAllows(room, currentUserId, gameSettings, organisation)
      && room.personalAreas?.some((area) => area.ownerUserId === currentUserId));
  const floorFull = layout.objects.length >= MAX_LAYOUT_OBJECTS_PER_FLOOR;
  const viewingPlayerFloor = layout.floorId === playerFloorId;
  const availableSelectedCopy = selectedObject && (ownership === "shared" || economy.inventory.some((asset) => asset.assetId === selectedObject.assetId
    && !asset.placement && !draftAssetIds.includes(asset.id)));
  const selectionControls = <>
    {!viewingPlayerFloor && <p className="personal-floor-notice">Visit this floor to edit or place items.</p>}
    {selectedObject && selectedAsset && (
      <section className="build-selection" aria-label={`Selected ${selectedAsset.name}`}>
        <strong>{selectedObject.label ?? selectedAsset.name}</strong>
        <div>
          {availableSelectedCopy && onCopySelected && (
            <button className="inventory-action" disabled={!viewingPlayerFloor || !canPlaceOnFloor || floorFull || pendingPublicAction || Boolean(pendingEconomyRequest)} onClick={onCopySelected}>
              <Copy size={16} aria-hidden="true" />Copy
            </button>
          )}
          <button className={`inventory-action${selectedItemMatches(selectedItem, movingItem) ? " active" : ""}`} disabled={!viewingPlayerFloor || pendingPublicAction} aria-keyshortcuts="M" onClick={onMoveSelected}>
            <Move size={16} aria-hidden="true" />{selectedItemMatches(selectedItem, movingItem) ? "Cancel move" : "Move"}<kbd aria-hidden="true">M</kbd>
          </button>
          <button className="inventory-action" disabled={!viewingPlayerFloor || pendingPublicAction} aria-keyshortcuts="R" onClick={onRotateSelected}><RotateCw size={16} aria-hidden="true" />Rotate<kbd aria-hidden="true">R</kbd></button>
          {selectedAsset.kind !== "portal" && (!selectedObject.ownerUserId || selectedObject.ownerUserId === currentUserId) && <button className="inventory-action inventory-action-store" disabled={pendingPublicAction || !selectedObject.ownerUserId && !viewingPlayerFloor} aria-keyshortcuts="D" onClick={onRemoveSelected}><Archive size={16} aria-hidden="true" />{selectedObject.ownerUserId ? "Store" : "Remove"}<kbd aria-hidden="true">D</kbd></button>}
        </div>
      </section>
    )}
  </>;
  return (
    <aside className="side-panel build-panel player-build-panel" aria-label="Build">
      <SurfaceHeader className="panel-header" title="Build" closeLabel="Close build tools" onClose={onClose}
        description={<span className="coin-balance" data-guide="wallet" aria-label={`${economy.coinBalance.toLocaleString()} coins`}>
          <Coins size={15} aria-hidden="true" /><strong>{economy.coinBalance.toLocaleString()}</strong>
        </span>}
        actions={<button className="secondary-button build-access-button" onClick={onOpenRooms}>Room settings</button>} />
      <div className="furnishing-controls">
        <label>Ownership<select value={ownership} disabled={pendingPublicAction || Boolean(pendingEconomyRequest)} onChange={(event) => onOwnershipChange(event.target.value as "personal" | "shared")}>
          <option value="personal">Personal</option><option value="shared">Shared</option>
        </select></label>
        <button className="secondary-button" onClick={onOpenSharedTransfer}>Shared funds · {availablePublicMoney(publicEconomy, "workspace").toLocaleString()}</button>
        <button className="secondary-button" onClick={onOpenStructure}>Structure</button>
      </div>
      {selectionControls}
      <button className="secondary-button furnishing-placed-toggle" aria-expanded={placedOpen} onClick={() => setPlacedOpen(!placedOpen)}>Placed items</button>
      {placedOpen && <div className="panel-scroll build-panel-scroll">
        <PersonalPlacedAssets ownership={ownership} currentUserId={currentUserId} layouts={layouts} floors={floors}
          activeFloorId={layout.floorId} selectedItem={selectedItem} onFocus={onFocus} onOpenInventory={() => setPlacedOpen(false)} />
      </div>}
      {!placedOpen && <div className="player-inventory-view" data-guide="assets">
        <section className="build-section asset-library" aria-label="Furniture">
          <AssetBrowser assets={catalogAssets} categoryLabel="Furniture categories" renderAsset={(asset) => {
            const personal = economy.inventory.filter((instance) => instance.assetId === asset.id && !instance.placement && !draftAssetIds.includes(instance.id));
            const shared = publicEconomy.inventory.filter((instance) => instance.assetId === asset.id && instance.fundId === "workspace" && !draftPublicAssetIds.includes(instance.id));
            const owned = ownership === "personal" ? personal[0] : undefined;
            const stored = ownership === "shared" ? shared[0] : undefined;
            const count = ownership === "personal" ? personal.length : shared.length;
            const price = owned || stored ? 0 : asset.shop!.price;
            const balance = ownership === "personal" ? economy.coinBalance : availablePublicMoney(publicEconomy, "workspace");
            const sharedOnly = ownership === "personal" && !asset.shop!.available && !owned;
            const inventoryFull = ownership === "personal" && !owned && economy.inventory.length >= MAX_OWNED_ASSETS;
            const disabled = pendingPublicAction || Boolean(pendingEconomyRequest) || !viewingPlayerFloor || !canPlaceOnFloor || floorFull || sharedOnly || inventoryFull || ownership === "personal" && price > balance;
            const select = () => onSelectAsset(asset.id, owned?.id, stored?.id);
            const label = sharedOnly ? "Shared only" : inventoryFull ? "Inventory full" : floorFull ? "Floor full" : ownership === "personal" && price > balance ? `Need ${price - balance}` : "Preview";
            const sellable = personal.find((instance) => instance.purchasePrice >= 3);
            return <article className={`catalog-asset inventory-asset${tool === "asset" && assetId === asset.id ? " active" : ""}`} key={asset.id}
              data-rarity={asset.rarity} aria-description={`${asset.rarity} rarity`} tabIndex={0} {...contextActions(() => {
                const actions: ContextAction[] = [{ label: "Preview", icon: Move, onSelect: select, disabled }];
                if (ownership === "personal" && onSell && sellable) actions.push({ label: "Sell", icon: Coins, onSelect: () => setDisposition({ assetId: sellable.id, action: "sell" }), disabled: pendingPublicAction });
                if (ownership === "personal" && onDonate && owned) actions.push({ label: "Donate", icon: Gift, onSelect: () => setDisposition({ assetId: owned.id, action: "donate" }), disabled: pendingPublicAction });
                if (stored && stored.paid >= 3) actions.push({ label: "Propose sale", icon: Coins, onSelect: () => onProposeSale(stored.id), disabled: pendingPublicAction });
                return actions;
              })}>
              <AssetShape asset={asset} rotation={asset.id === assetId ? assetRotation : 0} variantId={asset.id === assetId ? assetVariantId : getDefaultAssetVariantId(asset)} />
              <div className="catalog-asset-details"><strong>{asset.name}</strong><span>{count ? `${count} owned` : `${price} coins`}</span></div>
              <span className="catalog-asset-features"><AssetFeatureIndicators asset={asset} /></span>
              <button aria-label={`${label} ${asset.name}`} disabled={disabled} onClick={select}>{label}</button>
              {ownership === "personal" && owned && <div className="inventory-actions">
                {onSell && sellable && <button className="inventory-action inventory-action-sell" disabled={pendingPublicAction}
                  aria-label={`Sell ${asset.name} for ${Math.floor(sellable.purchasePrice / 3)} coins`} onClick={() => setDisposition({ assetId: sellable.id, action: "sell" })}><Coins size={17} aria-hidden="true" />Sell</button>}
                {onDonate && <button className="inventory-action" disabled={pendingPublicAction} aria-label={`Donate ${asset.name}`} onClick={() => setDisposition({ assetId: owned.id, action: "donate" })}><Gift size={16} aria-hidden="true" />Donate</button>}
              </div>}
              {stored && stored.paid >= 3 && <button className="inventory-action" disabled={pendingPublicAction} onClick={() => onProposeSale(stored.id)}>Propose sale · {Math.floor(stored.paid / 3)}</button>}
            </article>;
          }} footer={(tool === "asset" || movingItem?.type === "asset") && editingAsset && (
            <div className="asset-placement-options">
              <AssetVariantPicker asset={editingAsset} rotation={assetRotation} value={assetVariantId} onChange={onAssetVariantChange} />
              <button className="asset-rotate" aria-label={`Rotate asset clockwise, currently facing ${getAssetOrientationLabel(assetRotation)}`}
                onClick={() => onAssetRotationChange(rotateAssetClockwise(assetRotation))}>
                <RotateCw size={16} /><span>Rotate · {getAssetOrientationLabel(assetRotation)}</span><kbd>R</kbd>
              </button>
            </div>
          )} />
          {!canPlaceOnFloor && <span className="room-validation">No rooms on this floor allow placement.</span>}
        </section>
      </div>}
      {projectControls}
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
