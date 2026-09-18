import { openUrl } from "@tauri-apps/plugin-opener";
import { isNativeClient } from "./native-client";

export async function openAuthorization(connect: () => Promise<string>): Promise<void> {
  if (isNativeClient()) {
    await openUrl(await connect());
    return;
  }

  const tab = window.open("about:blank", "_blank");
  if (!tab) throw new Error("Allow popups for this site and try connecting again.");
  tab.opener = null;
  try {
    const url = await connect();
    if (tab.closed) throw new Error("The connection tab was closed. Try connecting again.");
    tab.location.replace(url);
  } catch (error) {
    tab.close();
    throw error;
  }
}
