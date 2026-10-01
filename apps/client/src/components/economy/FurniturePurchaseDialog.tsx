import { isInPersonalSpace, requireAssetDefinition, snapToAssetRaster, type FloorLayout, type ProjectEdit } from "@workhard/shared";
import { ConfirmationDialog } from "../ConfirmationDialog";

export function FurniturePurchaseDialog({ placement, layout, userId, hasDraft, draftNeedsApproval, approvalRate, pending, error, onConfirm, onCancel }: {
  placement: Extract<ProjectEdit, { tool: "asset" }>;
  layout: FloorLayout;
  userId: string;
  hasDraft: boolean;
  draftNeedsApproval: boolean;
  approvalRate: number;
  pending: boolean;
  error: string | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const asset = requireAssetDefinition(placement.assetId);
  const candidate = { id: "preview", floorId: layout.floorId, assetId: asset.id,
    x: snapToAssetRaster(placement.position.x), y: snapToAssetRaster(placement.position.y),
    variantId: placement.variantId, rotation: placement.rotation };
  const personalPlacement = isInPersonalSpace(layout, candidate, userId);
  const draftPlacement = hasDraft || !personalPlacement;
  const needsApproval = approvalRate > 0 && (draftNeedsApproval || !personalPlacement);
  return <ConfirmationDialog title={`Place ${asset.name}`}
    description={`Personal · ${asset.shop!.price} coins${draftPlacement ? needsApproval ? ". Adds to a draft for approval." : ". Adds to your draft." : ""}`}
    confirmLabel={draftPlacement ? "Buy and add to draft" : "Buy and place"} pending={pending} error={error} onConfirm={onConfirm} onCancel={onCancel} />;
}
