import {
  Archive,
  BrickWall,
  DoorOpen,
  Diamond,
  KeyRound,
  Eraser,
  Move,
  MousePointer2,
  RectangleHorizontal,
  RotateCw,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { ASSET_CATALOG, getAssetDefinition, getTeleporterPrice, getDefaultAssetVariantId } from "@workhard/shared";
import type { AssetRotation, FloorLayout, LayoutItemReference, LayoutTool } from "@workhard/shared";
import type { LucideIcon } from "lucide-react";
import { getAssetOrientationLabel, rotateAssetClockwise } from "../asset-orientation";
import { IconButton } from "./IconButton";
import { SurfaceHeader } from "./SurfaceHeader";
import { AssetShape } from "./AssetShape";
import { AssetVariantPicker } from "./AssetVariantPicker";
import { AssetBrowser } from "./AssetBrowser";
import { AssetFeatureIndicators } from "./AssetFeatureIndicators";
import { hasAssetFeature } from "../asset-features";
import "../build-panel.css";

interface BuildPanelProps {
  floorCount?: number;
  accountControls?: ReactNode;
  projectControls?: ReactNode;
  reviewing?: boolean;
  disabled?: boolean;
  layout: FloorLayout;
  tool: LayoutTool | null;
  assetId: string;
  assetVariantId: string;
  assetRotation: AssetRotation;
  selectedItem?: LayoutItemReference | undefined;
  movingItem?: LayoutItemReference | undefined;
  onToolChange: (tool: LayoutTool | null) => void;
  onAssetChange: (assetId: string) => void;
  onAssetVariantChange: (variantId: string) => void;
  onAssetRotationChange: (rotation: AssetRotation) => void;
  onMoveSelected: () => void;
  onRotateSelected: () => void;
  onRemoveSelected: () => void;
  onInspectAccess?: (() => void) | undefined;
  onOpenRooms: () => void;
  onClose: () => void;
}

const tools: { id: LayoutTool | null; label: string; icon: LucideIcon }[] = [
  { id: null, label: "Select", icon: MousePointer2 },
  { id: "wall", label: "Wall", icon: BrickWall },
  { id: "door", label: "Door", icon: DoorOpen },
  { id: "window", label: "Window", icon: RectangleHorizontal },
  { id: "spawn", label: "Start point", icon: Diamond },
  { id: "erase", label: "Erase", icon: Eraser },
];

const buildableAssets = ASSET_CATALOG.assets.filter((asset) => asset.buildable);

export function BuildPanel({
  floorCount = 1,
  accountControls,
  projectControls,
  reviewing = false,
  disabled = false,
  layout,
  tool,
  assetId,
  assetVariantId,
  assetRotation,
  selectedItem,
  movingItem,
  onToolChange,
  onAssetChange,
  onAssetVariantChange,
  onAssetRotationChange,
  onMoveSelected,
  onRotateSelected,
  onRemoveSelected,
  onInspectAccess,
  onOpenRooms,
  onClose,
}: BuildPanelProps) {
  const selectedDefinition = ASSET_CATALOG.assets.find((asset) => asset.id === assetId);
  const selectedObject = selectedItem?.type === "asset" ? layout.objects.find((object) => object.id === selectedItem.id) : undefined;
  const selectedOpening = selectedItem?.type === "opening" ? layout.openings.find((opening) => opening.id === selectedItem.id) : undefined;
  const selectedItemName = selectedObject
    ? getAssetName(selectedObject.assetId)
    : selectedItem?.type === "wall" ? "Wall" : selectedOpening?.type === "door" ? "Door" : selectedOpening ? "Window" : undefined;

  if (reviewing) return (
    <aside className="side-panel build-panel build-layout-panel" aria-label="Build" data-reviewing>
      <SurfaceHeader className="panel-header" title="Proposal" closeLabel="Close proposal preview" onClose={onClose} />
      {projectControls}
    </aside>
  );

  return (
    <aside className="side-panel build-panel build-layout-panel" aria-label="Build">
      <SurfaceHeader className="panel-header" title="Build" closeLabel="Close build tools" onClose={onClose}
        actions={<>
          <button className="secondary-button build-access-button" onClick={onOpenRooms}>Room settings</button>
          {onInspectAccess && <IconButton label="Room access" icon={KeyRound} onClick={onInspectAccess} />}
        </>} />

      {accountControls}
      <div className="build-tools layout-tools" role="toolbar" aria-label="Layout tools" inert={disabled}>
        {tools.map(({ id, label, icon: Icon }) => (
          <button
            key={label}
            className={tool === id ? "active" : ""}
            aria-pressed={tool === id}
            onClick={() => onToolChange(id)}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {selectedItem && selectedItemName && (
        <section className="build-selection" aria-label={`Selected ${selectedItemName}`} inert={disabled}>
          <strong>{selectedItemName}</strong>
          <div>
            <button className={itemMatches(selectedItem, movingItem) ? "active" : ""} onClick={onMoveSelected}>
              <Move size={16} aria-hidden="true" />{itemMatches(selectedItem, movingItem) ? "Cancel move" : "Move"}
            </button>
            {selectedItem.type !== "opening" && (
              <button onClick={onRotateSelected}><RotateCw size={16} aria-hidden="true" />Rotate</button>
            )}
            {getAssetDefinition(selectedObject?.assetId ?? "")?.kind !== "portal" && <button className={selectedObject?.ownerUserId ? "" : "danger"} onClick={onRemoveSelected}>
              {selectedObject?.ownerUserId ? <Archive size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
              {selectedObject?.ownerUserId ? "Store" : "Remove"}
            </button>}
          </div>
        </section>
      )}

      {tool === "asset" && selectedDefinition?.kind === "portal" && <p>Creates a new floor. Cannot be removed.</p>}

      <div className="build-workspace" inert={disabled}>
        <section className="build-section asset-library" aria-label="Assets">
          <AssetBrowser assets={buildableAssets} categoryLabel="Asset categories"
            renderAsset={(asset) => <button key={asset.id} aria-label={asset.name}
              className={`catalog-asset catalog-selectable${tool === "asset" && asset.id === assetId ? " active" : ""}`}
              aria-pressed={tool === "asset" && asset.id === assetId}
              aria-description={[
                `${asset.rarity[0]!.toUpperCase() + asset.rarity.slice(1)} · ${asset.kind === "portal" ? getTeleporterPrice(floorCount) : asset.shop?.price} coins`,
                ...(hasAssetFeature(asset, "animated") ? ["Animated"] : []),
                ...(hasAssetFeature(asset, "interactive") ? ["Interactive"] : []),
              ].join(" · ")}
              data-rarity={asset.rarity} onClick={() => { onAssetChange(asset.id); if (tool !== "asset" || asset.id === assetId) onToolChange("asset"); }}>
              <AssetShape asset={asset} rotation={asset.id === assetId ? assetRotation : 0}
                variantId={asset.id === assetId ? assetVariantId : getDefaultAssetVariantId(asset)} />
              <span className="catalog-asset-details"><strong>{asset.name}</strong>
                <span>{asset.kind === "portal" ? getTeleporterPrice(floorCount) : asset.shop?.price} coins</span></span>
              <span className="catalog-asset-features"><AssetFeatureIndicators asset={asset} /></span>
            </button>}
            footer={(tool === "asset" || movingItem?.type === "asset") && selectedDefinition && (
            <div className="asset-placement-options">
              <AssetVariantPicker asset={selectedDefinition} rotation={assetRotation} value={assetVariantId} onChange={onAssetVariantChange} />
              <button
                className="asset-rotate"
                aria-label={`Rotate asset clockwise, currently facing ${getAssetOrientationLabel(assetRotation)}`}
                onClick={() => onAssetRotationChange(rotateAssetClockwise(assetRotation))}
              >
                <RotateCw size={16} />
                <span>Rotate · {getAssetOrientationLabel(assetRotation)}</span>
                <kbd>R</kbd>
              </button>
            </div>
          )} />
        </section>

      </div>
      {projectControls}
    </aside>
  );
}

function getAssetName(assetId: string): string {
  return ASSET_CATALOG.assets.find((asset) => asset.id === assetId)?.name ?? "Asset";
}

function itemMatches(left?: LayoutItemReference, right?: LayoutItemReference): boolean {
  return Boolean(left && right && left.type === right.type && left.id === right.id);
}
