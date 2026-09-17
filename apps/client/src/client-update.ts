import { isNativeClient } from "./native-client";

let updateCheck: Promise<boolean> | undefined;

export function reloadUpdatedClient(): Promise<boolean> {
  if (isNativeClient() || !import.meta.env.PROD || !["http:", "https:"].includes(window.location.protocol)) {
    return Promise.resolve(false);
  }
  updateCheck ??= checkForUpdate();
  return updateCheck;
}

async function checkForUpdate(): Promise<boolean> {
  const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
  if (!entry) return false;
  try {
    const reloadKey = `northstar:client-update:${entry}`;
    if (sessionStorage.getItem(reloadKey)) return false;
    const indexUrl = new URL(`${import.meta.env.BASE_URL}index.html`, window.location.href);
    const response = await fetch(indexUrl, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("text/html")) return false;
    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    const source = page.querySelector('script[type="module"][src]')?.getAttribute("src");
    if (!source) return false;
    const nextEntry = new URL(source, indexUrl);
    if (nextEntry.origin !== window.location.origin || nextEntry.href === entry) return false;
    sessionStorage.setItem(reloadKey, "1");
    window.location.reload();
    return true;
  } catch (error) {
    console.warn("Client update check failed.", error);
    return false;
  }
}
