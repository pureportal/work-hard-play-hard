import type { MediaIceServer } from "@workhard/shared";
import { mediaIceServersSchema } from "./media-protocol.js";

export function readMediaIceServers(): MediaIceServer[] {
  const configured = process.env.MEETING_ICE_SERVERS?.trim();
  const servers = configured ? JSON.parse(configured) : [{ urls: ["stun:stun.cloudflare.com:3478"] }];
  return mediaIceServersSchema.parse(servers).map(({ urls, username, credential }) => ({
    urls, ...(username !== undefined ? { username } : {}), ...(credential !== undefined ? { credential } : {}),
  }));
}
