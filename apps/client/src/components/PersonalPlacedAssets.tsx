import { LocateFixed, PackageOpen } from "lucide-react";
import { useMemo } from "react";
import { getPlacedAssetBounds, isPointInRoom, requireAssetDefinition } from "@workhard/shared";
import type { Floor, FloorLayout, LayoutItemReference } from "@workhard/shared";
import { AssetShape } from "./AssetShape";

interface PersonalPlacedAssetsProps {
  currentUserId: string;
  layouts: FloorLayout[];
  floors: Floor[];
  activeFloorId: string;
  selectedItem: LayoutItemReference | undefined;
  onFocus: (floorId: string, objectId: string) => void;
}

export function PersonalPlacedAssets({ currentUserId, layouts, floors, activeFloorId, selectedItem, onFocus }: PersonalPlacedAssetsProps) {
  const groups = useMemo(() => floors.flatMap((floor) => {
    const layout = layouts.find((candidate) => candidate.floorId === floor.id);
    const objects = layout?.objects.filter((object) => object.ownerUserId === currentUserId) ?? [];
    return layout && objects.length ? [{ floor, layout, objects }] : [];
  }), [currentUserId, floors, layouts]);

  if (!groups.length) {
    return <div className="inventory-empty"><PackageOpen size={24} aria-hidden="true" /><span>No placed items yet.</span></div>;
  }

  return <div className="personal-placed-assets">
    {groups.map(({ floor, layout, objects }) => <section className="build-section" key={floor.id} aria-label={floor.name}>
      <h3>{floor.name}</h3>
      <div className="inventory-grid">
        {objects.map((object) => {
          const asset = requireAssetDefinition(object.assetId);
          const bounds = getPlacedAssetBounds(object);
          const room = layout.rooms.find((candidate) => isPointInRoom(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, candidate));
          const selected = activeFloorId === floor.id && selectedItem?.type === "asset" && selectedItem.id === object.id;
          const name = object.label ?? asset.name;
          return <button key={object.id} className={`placed-asset${selected ? " active" : ""}`}
            aria-label={`Focus ${name} in ${room ? `${room.name}, ` : ""}${floor.name}`} aria-pressed={selected}
            onClick={() => onFocus(floor.id, object.id)}>
            <AssetShape asset={asset} rotation={object.rotation} variantId={object.variantId} />
            <span className="placed-asset-details"><strong>{name}</strong>{room && <span>{room.name}</span>}</span>
            <LocateFixed size={19} aria-hidden="true" />
          </button>;
        })}
      </div>
    </section>)}
  </div>;
}
