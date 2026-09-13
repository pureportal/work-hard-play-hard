import { ASSET_RARITIES, type AssetRarity } from "@workhard/shared";

export function AssetRarityFilter({ value, onChange }: {
  value: AssetRarity | "all";
  onChange: (rarity: AssetRarity | "all") => void;
}) {
  return (
    <label className="asset-rarity-filter">
      <span>Rarity</span>
      <select value={value} onChange={(event) => onChange(event.target.value as AssetRarity | "all")}>
        <option value="all">All rarities</option>
        {ASSET_RARITIES.map((rarity) => (
          <option key={rarity} value={rarity}>{rarity[0]!.toUpperCase() + rarity.slice(1)}</option>
        ))}
      </select>
    </label>
  );
}
