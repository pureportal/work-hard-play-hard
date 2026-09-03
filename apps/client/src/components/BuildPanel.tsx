import {
  DoorOpen,
  Eraser,
  Flower2,
  Move,
  PanelsTopLeft,
  RectangleHorizontal,
  RotateCw,
  Sofa,
  Square,
  Trash2,
  Waves,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ASSET_CATALOG, getDefaultAssetVariantId } from "@workhard/shared";
import type { AssetRotation, FloorLayout, GameSettings, LayoutItemReference, LayoutTool, Member, Room, RoomSettings } from "@workhard/shared";
import type { LucideIcon } from "lucide-react";
import { getAssetOrientationLabel, rotateAssetClockwise } from "../asset-orientation";
import { IconButton } from "./IconButton";
import { AssetShape } from "./AssetShape";
import { AssetVariantPicker } from "./AssetVariantPicker";

interface BuildPanelProps {
  layout: FloorLayout;
  members: Member[];
  tool: LayoutTool | null;
  assetId: string;
  assetVariantId: string;
  assetRotation: AssetRotation;
  selectedItem?: LayoutItemReference | undefined;
  movingItem?: LayoutItemReference | undefined;
  gameSettings: GameSettings;
  canManageGameSettings: boolean;
  onToolChange: (tool: LayoutTool | null) => void;
  onAssetChange: (assetId: string) => void;
  onAssetVariantChange: (variantId: string) => void;
  onAssetRotationChange: (rotation: AssetRotation) => void;
  onMoveSelected: () => void;
  onRotateSelected: () => void;
  onRemoveSelected: () => void;
  onUpdateRoom: (roomId: string, settings: RoomSettings) => void;
  onUpdateGameSettings: (settings: GameSettings) => void;
  onClose: () => void;
}

const tools: { id: LayoutTool | null; label: string; icon: LucideIcon }[] = [
  { id: null, label: "Select", icon: PanelsTopLeft },
  { id: "wall", label: "Wall", icon: Square },
  { id: "door", label: "Door", icon: DoorOpen },
  { id: "window", label: "Window", icon: RectangleHorizontal },
  { id: "erase", label: "Erase", icon: Eraser },
];

const categoryIcons: Record<string, LucideIcon> = {
  desks: PanelsTopLeft,
  seating: Sofa,
  tables: RectangleHorizontal,
  plants: Flower2,
  outdoor: Waves,
  decor: Square,
  equipment: PanelsTopLeft,
  surfaces: Square,
};

const buildableCategories = ASSET_CATALOG.categories.filter((category) => category.buildable);

export function BuildPanel({
  layout,
  members,
  tool,
  assetId,
  assetVariantId,
  assetRotation,
  selectedItem,
  movingItem,
  gameSettings,
  canManageGameSettings,
  onToolChange,
  onAssetChange,
  onAssetVariantChange,
  onAssetRotationChange,
  onMoveSelected,
  onRotateSelected,
  onRemoveSelected,
  onUpdateRoom,
  onUpdateGameSettings,
  onClose,
}: BuildPanelProps) {
  const selectedDefinition = ASSET_CATALOG.assets.find((asset) => asset.id === assetId);
  const [categoryId, setCategoryId] = useState(selectedDefinition?.category ?? buildableCategories[0]!.id);
  const categoryAssets = ASSET_CATALOG.assets.filter((asset) => asset.buildable && asset.category === categoryId);
  const selectedObject = selectedItem?.type === "asset" ? layout.objects.find((object) => object.id === selectedItem.id) : undefined;
  const selectedOpening = selectedItem?.type === "opening" ? layout.openings.find((opening) => opening.id === selectedItem.id) : undefined;
  const selectedItemName = selectedObject
    ? getAssetName(selectedObject.assetId)
    : selectedItem?.type === "wall" ? "Wall" : selectedOpening?.type === "door" ? "Door" : selectedOpening ? "Window" : undefined;

  return (
    <aside className="side-panel build-panel" aria-label="Build">
      <div className="panel-header">
        <h2>Build</h2>
        <IconButton label="Close build tools" icon={X} onClick={onClose} />
      </div>

      <div className="panel-scroll build-panel-scroll">
        <div className="build-tools" role="toolbar" aria-label="Layout tools">
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

        <section className="build-section asset-library">
          <h3>Assets</h3>
          <div className="asset-category-tabs" role="tablist" aria-label="Asset categories">
            {buildableCategories.map((category) => {
              const Icon = categoryIcons[category.id] ?? Square;
              return (
                <button
                  key={category.id}
                  role="tab"
                  aria-selected={category.id === categoryId}
                  className={category.id === categoryId ? "active" : ""}
                  onClick={() => setCategoryId(category.id)}
                >
                  <Icon size={15} />
                  <span>{category.name}</span>
                </button>
              );
            })}
          </div>
          <div className="asset-grid" role="tabpanel">
            {categoryAssets.map((asset) => (
              <button
                key={asset.id}
                className={tool === "asset" && asset.id === assetId ? "active" : ""}
                aria-pressed={tool === "asset" && asset.id === assetId}
                onClick={() => {
                  onAssetChange(asset.id);
                  onToolChange("asset");
                }}
              >
                <AssetShape asset={asset} variantId={asset.id === assetId ? assetVariantId : getDefaultAssetVariantId(asset)} />
                <span>{asset.name}</span>
              </button>
            ))}
          </div>
          {(tool === "asset" || movingItem?.type === "asset") && selectedDefinition && (
            <>
              <AssetVariantPicker asset={selectedDefinition} value={assetVariantId} onChange={onAssetVariantChange} />
              <button
                className="asset-rotate"
                aria-label={`Rotate asset clockwise, currently facing ${getAssetOrientationLabel(assetRotation)}`}
                onClick={() => onAssetRotationChange(rotateAssetClockwise(assetRotation))}
              >
                <RotateCw size={16} />
                <span>Rotate · {getAssetOrientationLabel(assetRotation)}</span>
                <kbd>R</kbd>
              </button>
            </>
          )}
        </section>

        <section className="build-section">
          <h3>Rooms</h3>
          <div className="room-list">
            {layout.rooms.map((room) => (
              <RoomEditor key={room.id} room={room} members={members} onSave={onUpdateRoom} />
            ))}
          </div>
        </section>

        {canManageGameSettings && (
          <section className="build-section">
            <h3>Game</h3>
            <label className="build-toggle">
              <input
                type="checkbox"
                checked={gameSettings.allowPlayerAssetPlacementInPublicRooms}
                onChange={(event) => onUpdateGameSettings({
                  allowPlayerAssetPlacementInPublicRooms: event.target.checked,
                })}
              />
              <span>Player assets in open rooms</span>
            </label>
          </section>
        )}
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

interface RoomEditorProps {
  room: Room;
  members: Member[];
  onSave: (roomId: string, settings: RoomSettings) => void;
}

function RoomEditor({ room, members, onSave }: RoomEditorProps) {
  const [name, setName] = useState(room.name);
  const [color, setColor] = useState(room.color);
  const [accessMode, setAccessMode] = useState(room.access.mode);
  const [assignedPersonIds, setAssignedPersonIds] = useState(room.access.assignedPersonIds);
  const [knockable, setKnockable] = useState(room.access.knockable);

  useEffect(() => {
    setName(room.name);
    setColor(room.color);
    setAccessMode(room.access.mode);
    setAssignedPersonIds(room.access.assignedPersonIds);
    setKnockable(room.access.knockable);
  }, [room]);

  const missingAssignee = accessMode === "assigned" && assignedPersonIds.length === 0;
  const save = () => {
    if (!name.trim() || missingAssignee) {
      return;
    }
    onSave(room.id, {
      name: name.trim(),
      color,
      access: {
        mode: accessMode,
        assignedPersonIds,
        knockable: accessMode === "assigned" && knockable,
      },
    });
  };

  const togglePerson = (personId: string, assigned: boolean) => {
    setAssignedPersonIds((current) => assigned
      ? [...current, personId]
      : current.filter((candidate) => candidate !== personId));
  };

  return (
    <details className="room-control">
      <summary>
        <span className="room-swatch" style={{ background: color }} />
        <span>{name}</span>
      </summary>
      <div className="room-fields">
        <label>
          <span>Name</span>
          <input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="room-color-field">
          <span>Color</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <label>
          <span>Access</span>
          <select
            value={accessMode}
            onChange={(event) => {
              const mode = event.target.value as RoomSettings["access"]["mode"];
              setAccessMode(mode);
              if (mode === "open") {
                setKnockable(false);
              }
            }}
          >
            <option value="open">Open</option>
            <option value="assigned" disabled={!room.privateEligible}>Assigned people</option>
          </select>
        </label>
        {!room.privateEligible && <span className="room-validation">Add a door to make private.</span>}
        <fieldset>
          <legend>People</legend>
          <div className="room-people">
            {members.map((member) => (
              <label key={member.id}>
                <input
                  type="checkbox"
                  checked={assignedPersonIds.includes(member.id)}
                  onChange={(event) => togglePerson(member.id, event.target.checked)}
                />
                <span>{member.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {accessMode === "assigned" && (
          <label className="room-knockable">
            <input type="checkbox" checked={knockable} onChange={(event) => setKnockable(event.target.checked)} />
            <span>Allow knocking</span>
          </label>
        )}
        {missingAssignee && <span className="room-validation">Choose at least one person.</span>}
        <button className="primary-button room-save" disabled={!name.trim() || missingAssignee} onClick={save}>Save</button>
      </div>
    </details>
  );
}
