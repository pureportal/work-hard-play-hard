import { getAssetDefinition, getDefaultAssetVariantId, type OwnedAsset } from "@workhard/shared";
import { AssetShape } from "../AssetShape";
import { ConfirmationDialog } from "../ConfirmationDialog";

export function AssetDispositionDialog({ asset, action, pending, error, onConfirm, onClose }: {
  asset: OwnedAsset; action: "sell" | "donate"; pending: boolean; error?: string | undefined; onConfirm: () => void; onClose: () => void;
}) {
  const definition = getAssetDefinition(asset.assetId)!;
  const selling = action === "sell";
  return <ConfirmationDialog
    title={`${selling ? "Sell" : "Donate"} ${definition.name}?`}
    description={selling ? `${Math.floor(asset.purchasePrice / 3)} coins will go to your wallet.` : "This item becomes shared property and cannot be taken back."}
    confirmLabel={selling ? "Sell item" : "Donate item"}
    pending={pending}
    error={error}
    onConfirm={onConfirm}
    onCancel={onClose}
  >
    <AssetShape asset={definition} rotation={0} variantId={getDefaultAssetVariantId(definition)} />
  </ConfirmationDialog>;
}
