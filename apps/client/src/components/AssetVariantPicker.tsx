import { getAssetVariants } from "@workhard/shared";
import type { AssetDefinition, AssetRotation } from "@workhard/shared";
import { AssetShape } from "./AssetShape";

interface AssetVariantPickerProps {
  asset: AssetDefinition;
  rotation?: AssetRotation;
  value: string;
  onChange: (variantId: string) => void;
}

export function AssetVariantPicker({ asset, rotation = 0, value, onChange }: AssetVariantPickerProps) {
  const variants = getAssetVariants(asset);
  return (
    <div className="asset-variant-control">
      <span>Design</span>
      <div className="asset-variants" role="radiogroup" aria-label={`${asset.name} design`}>
        {variants.map((variant, index) => (
          <button
            key={variant.id}
            type="button"
            role="radio"
            aria-checked={variant.id === value}
            tabIndex={variant.id === value ? 0 : -1}
            className={variant.id === value ? "active" : ""}
            onClick={() => onChange(variant.id)}
            onKeyDown={(event) => {
              let next: number;
              switch (event.key) {
                case "ArrowRight":
                case "ArrowDown": next = (index + 1) % variants.length; break;
                case "ArrowLeft":
                case "ArrowUp": next = (index + variants.length - 1) % variants.length; break;
                case "Home": next = 0; break;
                case "End": next = variants.length - 1; break;
                default: return;
              }
              event.preventDefault();
              onChange(variants[next]!.id);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
            }}
          >
            <AssetShape asset={asset} variantId={variant.id} rotation={rotation} />
            <span>{variant.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
