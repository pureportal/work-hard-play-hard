import type { ServerEvent } from "@workhard/shared";

export type GameEventDelivery =
  | { scope: "all"; event: ServerEvent }
  | { scope: "floor"; floorId: string; event: ServerEvent }
  | { scope: "users"; userIds: string[]; event: ServerEvent };
