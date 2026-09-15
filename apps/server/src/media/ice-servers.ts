import type { MediaIceServer } from "@workhard/shared";
import { mediaIceServersSchema } from "./media-protocol.js";

export function readMediaIceServers(): MediaIceServer[] {
  const configured = process.env.MEETING_ICE_SERVERS;
  return configured ? mediaIceServersSchema.parse(JSON.parse(configured)).map(({ urls, username, credential }) => ({
    urls, ...(username !== undefined ? { username } : {}), ...(credential !== undefined ? { credential } : {}),
  })) : [];
}
