import {
  Archive,
  BrickWall,
  Copy,
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
import { useEffect, useState, type ReactNode } from "react";
import { ASSET_CATALOG, getAssetDefinition, getTeleporterPrice, getDefaultAssetVariantId } from "@workhard/shared";
import type { AssetRotation, FloorLayout, LayoutItemReference, LayoutTool, ProjectEdit } from "@workhard/shared";
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
  fillableRoomIds?: readonly string[];
  currentRoomId?: string | undefined;
  onFillRoom?: (edit: Extract<ProjectEdit, { tool: "room.fill_tiles" }>) => void;
  onMoveSelected: () => void;
  onCopySelected?: () => void;
  onRotateSelected: () => void;
  onRemoveSelected: () => void;
  onInspectAccess?: (() => void) | undefined;
  onOpenRooms: () => void;
  onClose: () => void;
}

const tools: { id: LayoutTool | null; label: string; icon: LucideIcon; shortcut: string }[] = [
  { id: null, label: "Select", icon: MousePointer2, shortcut: "1" },
  { id: "wall", label: "Wall", icon: BrickWall, shortcut: "2" },
  { id: "door", label: "Door", icon: DoorOpen, shortcut: "3" },
  { id: "window", label: "Window", icon: RectangleHorizontal, shortcut: "4" },
  { id: "spawn", label: "Start point", icon: Diamond, shortcut: "5" },
  { id: "erase", label: "Erase", icon: Eraser, shortcut: "6" },
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
  fillableRoomIds,
  currentRoomId,
  onFillRoom,
  onMoveSelected,
  onCopySelected,
  onRotateSelected,
  onRemoveSelected,
  onInspectAccess,
  onOpenRooms,
  onClose,
}: BuildPanelProps) {
  const [pickerOpen, setPickerOpen] = useState(tool === null);
  const [fillRoomId, setFillRoomId] = useState("");
  const [fillMode, setFillMode] = useState<"keep" | "replace">("keep");
  const [randomRotation, setRandomRotation] = useState(false);
  const [mobile, setMobile] = useState(() => window.innerWidth <= 700);
  useEffect(() => {
    const update = () => setMobile(window.innerWidth <= 700);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(() => {
    if (reviewing || disabled) return;
    const selectTool = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
        || document.querySelector('[aria-modal="true"]')) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
      const selectedTool = tools.find(({ shortcut }) => shortcut === event.key);
      if (!selectedTool) return;
      event.preventDefault();
      onToolChange(selectedTool.id);
      if (selectedTool.id !== null) setPickerOpen(false);
    };
    window.addEventListener("keydown", selectTool);
    return () => window.removeEventListener("keydown", selectTool);
  }, [disabled, onToolChange, reviewing]);
  const selectedDefinition = ASSET_CATALOG.assets.find((asset) => asset.id === assetId);
  const fillableRooms = layout.rooms.filter((room) => !fillableRoomIds || fillableRoomIds.includes(room.id));
  const selectedFillRoomId = fillableRooms.some((room) => room.id === fillRoomId) ? fillRoomId
    : fillableRooms.find((room) => room.id === currentRoomId)?.id ?? fillableRooms[0]?.id ?? "";
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
    <aside className="side-panel build-panel build-layout-panel" aria-label="Build" data-compact={!pickerOpen}>
      <SurfaceHeader className="panel-header" title="Build" closeLabel="Close build tools" onClose={onClose}
        actions={<>
          <button className="secondary-button build-access-button" onClick={onOpenRooms}>Room settings</button>
          {onInspectAccess && <IconButton label="Room access" icon={KeyRound} onClick={onInspectAccess} />}
        </>} />

      {accountControls}
      <div className="build-tools layout-tools" role="toolbar" aria-label="Layout tools" inert={disabled}>
        {tools.map(({ id, label, icon: Icon, shortcut }) => (
          <button
            key={label}
            className={tool === id ? "active" : ""}
            aria-pressed={tool === id}
            aria-keyshortcuts={shortcut}
            onClick={() => { onToolChange(id); if (id !== null) setPickerOpen(false); }}
          >
            <Icon size={19} />
            <span>{label}</span>
            <kbd aria-hidden="true">{shortcut}</kbd>
          </button>
        ))}
      </div>

      {mobile && <button type="button" className="secondary-button build-picker-toggle" aria-expanded={pickerOpen} aria-controls="build-asset-picker"
        onClick={() => setPickerOpen((open) => !open)}>{pickerOpen ? "Hide items" : "Show items"}</button>}

      {selectedItem && selectedItemName && (
        <section className="build-selection" aria-label={`Selected ${selectedItemName}`} inert={disabled}>
          <strong>{selectedItemName}</strong>
          <div>
            {selectedObject && getAssetDefinition(selectedObject.assetId)?.buildable && onCopySelected && (
              <button onClick={onCopySelected}><Copy size={16} aria-hidden="true" />Copy</button>
            )}
            <button className={itemMatches(selectedItem, movingItem) ? "active" : ""} aria-keyshortcuts="M" onClick={onMoveSelected}>
              <Move size={16} aria-hidden="true" />{itemMatches(selectedItem, movingItem) ? "Cancel move" : "Move"}<kbd aria-hidden="true">M</kbd>
            </button>
            {selectedItem.type !== "opening" && (
              <button aria-keyshortcuts="R" onClick={onRotateSelected}><RotateCw size={16} aria-hidden="true" />Rotate<kbd aria-hidden="true">R</kbd></button>
            )}
            {getAssetDefinition(selectedObject?.assetId ?? "")?.kind !== "portal" && <button className={selectedObject?.ownerUserId ? "" : "danger"} aria-keyshortcuts="D" onClick={onRemoveSelected}>
              {selectedObject?.ownerUserId ? <Archive size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
              {selectedObject?.ownerUserId ? "Store" : "Remove"}<kbd aria-hidden="true">D</kbd>
            </button>}
          </div>
        </section>
      )}

      {tool === "asset" && selectedDefinition?.kind === "portal" && <p>Creates a new floor. Cannot be removed.</p>}

      <div className="build-workspace" id="build-asset-picker" inert={disabled}>
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
              data-rarity={asset.rarity} onClick={() => { onAssetChange(asset.id); if (tool !== "asset" || asset.id === assetId) onToolChange("asset"); setPickerOpen(false); }}>
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
              {selectedDefinition.kind === "floor-tile" && onFillRoom && <div className="room-tile-fill">
                <label>Room
                  <select value={selectedFillRoomId} onChange={(event) => setFillRoomId(event.target.value)}>
                    {fillableRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
                  </select>
                </label>
                <label>Existing tiles
                  <select value={fillMode} onChange={(event) => setFillMode(event.target.value as "keep" | "replace")}>
                    <option value="keep">Keep Existing Tiles</option>
                    <option value="replace">Replace Existing Tiles</option>
                  </select>
                </label>
                <label className="room-tile-random"><input type="checkbox" checked={randomRotation}
                  onChange={(event) => setRandomRotation(event.target.checked)} />Randomize tile rotation</label>
                <button className="secondary-button" disabled={!selectedFillRoomId} onClick={() => onFillRoom({
                  tool: "room.fill_tiles", roomId: selectedFillRoomId, assetId, variantId: assetVariantId,
                  mode: fillMode, rotation: assetRotation, randomRotation,
                })}>Fill room with tiles</button>
              </div>}
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
