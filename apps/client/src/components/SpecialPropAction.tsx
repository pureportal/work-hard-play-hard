import { SPECIAL_PROPS, SPECIAL_PROP_RANGE, getPlacedAssetBounds, type WorldObject, type WorldPlayer } from "@workhard/shared";
import type { DisplaySpecialPropUse } from "../special-props";

interface SpecialPropActionProps {
  object: WorldObject;
  player: WorldPlayer | undefined;
  unavailable: boolean;
  uses: DisplaySpecialPropUse[];
  now: number;
  onUse: () => void;
  onApproach: () => void;
}

export function SpecialPropAction({ object, player, unavailable, uses, now, onUse, onApproach }: SpecialPropActionProps) {
  const prop = SPECIAL_PROPS[object.assetId];
  if (!prop) return null;
  const remaining = Math.max(0, Math.ceil(((uses.find(use => use.objectId === object.id)?.cooldownUntil ?? 0) - now) / 1000));
  const bounds = getPlacedAssetBounds(object);
  const inRange = player?.floorId === object.floorId && Math.hypot(
    Math.max(bounds.x - player.x, 0, player.x - bounds.x - bounds.width),
    Math.max(bounds.y - player.y, 0, player.y - bounds.y - bounds.height),
  ) <= SPECIAL_PROP_RANGE;
  if (unavailable) return <button className="secondary-button" disabled>In meeting</button>;
  if (remaining) return <button className="secondary-button" disabled>Ready in {remaining}s</button>;
  return <button className="primary-button" onClick={inRange ? onUse : onApproach}>{inRange ? prop.action : "Walk to object"}</button>;
}
