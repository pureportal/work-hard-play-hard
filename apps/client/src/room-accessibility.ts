import type { RoomEntryStatus } from "@workhard/shared";

export const roomEntryAppearance: Record<RoomEntryStatus, { label: string; color: string }> = {
  accessible: { label: "Can enter", color: "#24875d" },
  restricted: { label: "No access", color: "#c23c50" },
  full: { label: "Full", color: "#b37a17" },
};
