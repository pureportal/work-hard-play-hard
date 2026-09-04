import type { CorporateIdentity } from "@workhard/shared";
import { resolveServerUrl } from "./server-url";

export function applyCorporateIdentity(identity: CorporateIdentity): void {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", identity.primaryColor);
  root.style.setProperty("--brand-secondary", identity.secondaryColor);
  root.style.setProperty("--brand-on-primary", contrastingTextColor(identity.primaryColor));
  document.title = identity.applicationName;

  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!favicon) {
    return;
  }
  favicon.dataset.defaultHref ||= favicon.href;
  favicon.href = identity.logoUrl ? resolveServerUrl(identity.logoUrl) : favicon.dataset.defaultHref;
}

export function contrastingTextColor(color: string): "#ffffff" | "#171821" {
  const luminance = relativeLuminance(color);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / (relativeLuminance("#171821") + 0.05);
  return whiteContrast >= darkContrast ? "#ffffff" : "#171821";
}

function relativeLuminance(color: string): number {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return [red, green, blue]
    .map((channel) => channel / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
}
