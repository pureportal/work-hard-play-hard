import { getAssetVariants } from "@workhard/shared";
import type { AssetDefinition } from "@workhard/shared";

interface AssetVariantPickerProps {
  asset: AssetDefinition;
  value: string;
  onChange: (variantId: string) => void;
}

export function AssetVariantPicker({ asset, value, onChange }: AssetVariantPickerProps) {
  return (
    <div className="asset-variant-control">
      <span>Design</span>
      <div className="asset-variants" role="radiogroup" aria-label={`${asset.name} design`}>
        {getAssetVariants(asset).map((variant) => (
          <button
            key={variant.id}
            type="button"
            role="radio"
            aria-checked={variant.id === value}
            className={variant.id === value ? "active" : ""}
            onClick={() => onChange(variant.id)}
          >
            <span
              className="asset-variant-swatch"
              style={{ background: `linear-gradient(135deg, ${variant.color} 0 62%, ${variant.accentColor} 62%)` }}
            />
            <span>{variant.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
