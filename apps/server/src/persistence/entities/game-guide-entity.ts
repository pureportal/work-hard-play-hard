import { EntitySchema } from "@mikro-orm/core";
import { GAME_GUIDE_STATUSES, type GameGuideStatus } from "@workhard/shared";
import { AuthAccountEntity } from "./auth-entities.js";

export class GameGuideEntity {
  userId!: string;
  status!: GameGuideStatus;
}

export const gameGuideSchema = new EntitySchema({
  class: GameGuideEntity,
  tableName: "game_guide_states",
  properties: {
    userId: { kind: "m:1", entity: () => AuthAccountEntity, primary: true,
      fieldName: "user_id", mapToPk: true, deleteRule: "cascade" } as never,
    status: { enum: true, items: [...GAME_GUIDE_STATUSES] },
  },
});
