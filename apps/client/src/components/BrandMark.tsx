import type { CorporateIdentity } from "@workhard/shared";
import { resolveServerUrl } from "../server-url";
import { NorthstarMark } from "./NorthstarMark";

interface BrandMarkProps {
  identity: CorporateIdentity;
  size: number;
}

export function BrandMark({ identity, size }: BrandMarkProps) {
  return identity.logoUrl
    ? <img className="corporate-logo" src={resolveServerUrl(identity.logoUrl)} alt="" />
    : <NorthstarMark size={size} />;
}
