import {
  Armchair,
  Archive,
  Boxes,
  BrickWall,
  DoorOpen,
  Diamond,
  KeyRound,
  Coffee,
  Eraser,
  Flower2,
  Grid2X2,
  LampDesk,
  Lightbulb,
  Move,
  MousePointer2,
  PanelsTopLeft,
  RectangleHorizontal,
  RotateCw,
  Square,
  Table2,
  Trash2,
  TreePine,
  Utensils,
  X,
} from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { ASSET_CATALOG, ASSET_RARITIES, getDefaultAssetVariantId } from "@workhard/shared";
import type { AssetRarity, AssetRotation, FloorLayout, LayoutItemReference, LayoutTool } from "@workhard/shared";
import type { LucideIcon } from "lucide-react";
import { getAssetOrientationLabel, rotateAssetClockwise } from "../asset-orientation";
import { useHorizontalWheelScroll } from "../hooks/useHorizontalWheelScroll";
import { useSelectedTabVisibility } from "../hooks/useSelectedTabVisibility";
import { IconButton } from "./IconButton";
import { AssetShape } from "./AssetShape";
import { AssetVariantPicker } from "./AssetVariantPicker";
import { AssetRarityFilter } from "./AssetRarityFilter";
import "../build-panel.css";

interface BuildPanelProps {
  accountControls?: ReactNode;
  projectControls?: ReactNode;
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

const categoryIcons: Record<string, LucideIcon> = {
  desks: PanelsTopLeft,
  seating: Armchair,
  tables: Table2,
  plants: Flower2,
  outdoor: TreePine,
  decor: LampDesk,
  equipment: Boxes,
  "floor-types": Grid2X2,
  "floor-decorations": RectangleHorizontal,
  storage: Archive,
  lighting: Lightbulb,
  breakroom: Coffee,
  food: Utensils,
};

const buildableCategories = ASSET_CATALOG.categories.filter((category) => category.buildable);

export function BuildPanel({
  accountControls,
  projectControls,
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
  const panelId = useId();
  const categoryTabsRef = useRef<HTMLDivElement>(null);
  const scrollCategoryTabs = useHorizontalWheelScroll(categoryTabsRef);
  const [categoryId, setCategoryId] = useState(selectedDefinition?.category ?? buildableCategories[0]!.id);
  const [rarity, setRarity] = useState<AssetRarity | "all">("all");
  const categoryAssets = ASSET_CATALOG.assets
    .filter((asset) => asset.buildable && asset.category === categoryId && (rarity === "all" || asset.rarity === rarity))
    .sort((left, right) => ASSET_RARITIES.indexOf(left.rarity) - ASSET_RARITIES.indexOf(right.rarity));
  const selectedObject = selectedItem?.type === "asset" ? layout.objects.find((object) => object.id === selectedItem.id) : undefined;
  const selectedOpening = selectedItem?.type === "opening" ? layout.openings.find((opening) => opening.id === selectedItem.id) : undefined;
  const selectedItemName = selectedObject
    ? getAssetName(selectedObject.assetId)
    : selectedItem?.type === "wall" ? "Wall" : selectedOpening?.type === "door" ? "Door" : selectedOpening ? "Window" : undefined;

  useSelectedTabVisibility(categoryTabsRef, categoryId);

  return (
    <aside className="side-panel build-panel build-layout-panel" aria-label="Build">
      <div className="panel-header">
        <h2>Build</h2>
        <div className="build-panel-actions">
          <button className="secondary-button build-access-button" onClick={onOpenRooms}>Room settings</button>
          {onInspectAccess && <IconButton label="Room access" icon={KeyRound} onClick={onInspectAccess} />}
          <IconButton label="Close build tools" icon={X} onClick={onClose} />
        </div>
      </div>

      {accountControls}
      {projectControls}
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

      <div className="build-workspace" inert={disabled}>
        <section className="build-section asset-library" aria-labelledby={`${panelId}-assets`}>
          <div className="build-assets-header">
            <h3 id={`${panelId}-assets`}>Assets</h3>
            <AssetRarityFilter value={rarity} onChange={setRarity} />
          </div>
          <div ref={scrollCategoryTabs} className="asset-category-tabs" role="tablist" aria-label="Asset categories">
            {buildableCategories.map((category, index) => {
              const Icon = categoryIcons[category.id] ?? Square;
              return (
                <button
                  key={category.id}
                  id={`${panelId}-category-${category.id}`}
                  role="tab"
                  aria-selected={category.id === categoryId}
                  aria-controls={`${panelId}-asset-list`}
                  tabIndex={category.id === categoryId ? 0 : -1}
                  className={category.id === categoryId ? "active" : ""}
                  onClick={() => setCategoryId(category.id)}
                  onKeyDown={(event) => {
                    let next: number;
                    switch (event.key) {
                      case "ArrowRight": next = (index + 1) % buildableCategories.length; break;
                      case "ArrowLeft": next = (index + buildableCategories.length - 1) % buildableCategories.length; break;
                      case "Home": next = 0; break;
                      case "End": next = buildableCategories.length - 1; break;
                      default: return;
                    }
                    event.preventDefault();
                    setCategoryId(buildableCategories[next]!.id);
                    categoryTabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
                  }}
                >
                  <Icon size={15} />
                  <span>{category.name}</span>
                </button>
              );
            })}
          </div>
          <div className="build-asset-scroll build-section-scroll" key={`${categoryId}-${rarity}`} id={`${panelId}-asset-list`} role="tabpanel" aria-labelledby={`${panelId}-category-${categoryId}`} tabIndex={0}>
            {selectedItem && selectedItemName && (
              <section className="build-selection" aria-label={`Selected ${selectedItemName}`}>
                <strong>{selectedItemName}</strong>
                <div>
                  <button className={itemMatches(selectedItem, movingItem) ? "active" : ""} onClick={onMoveSelected}>
                    <Move size={16} />Move
                  </button>
                  {selectedItem.type !== "opening" && (
                    <button onClick={onRotateSelected}><RotateCw size={16} />Rotate</button>
                  )}
                  <button className="danger" onClick={onRemoveSelected}><Trash2 size={16} />Remove</button>
                </div>
              </section>
            )}
            <div className="asset-grid">
              {categoryAssets.length === 0 && <span className="asset-filter-empty">No assets match.</span>}
              {categoryAssets.map((asset) => (
                <button
                  key={asset.id}
                  aria-label={asset.name}
                  className={tool === "asset" && asset.id === assetId ? "active" : ""}
                  aria-pressed={tool === "asset" && asset.id === assetId}
                  aria-description={`${asset.rarity[0]!.toUpperCase() + asset.rarity.slice(1)} · ${asset.shop?.price} coins`}
                  data-rarity={asset.rarity}
                  onClick={() => {
                    onAssetChange(asset.id);
                    onToolChange("asset");
                  }}
                >
                  <AssetShape asset={asset} rotation={asset.id === assetId ? assetRotation : 0} variantId={asset.id === assetId ? assetVariantId : getDefaultAssetVariantId(asset)} />
                  <span>{asset.name}</span>
                  <span className="asset-price">{asset.shop?.price} coins</span>
                </button>
              ))}
            </div>
          </div>
          {(tool === "asset" || movingItem?.type === "asset") && selectedDefinition && (
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
          )}
        </section>

      </div>
    </aside>
  );
}

function getAssetName(assetId: string): string {
  return ASSET_CATALOG.assets.find((asset) => asset.id === assetId)?.name ?? "Asset";
}

function itemMatches(left?: LayoutItemReference, right?: LayoutItemReference): boolean {
  return Boolean(left && right && left.type === right.type && left.id === right.id);
}
