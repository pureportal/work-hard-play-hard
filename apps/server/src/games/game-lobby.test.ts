import { getGameArea, type WorldPlayer } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { nearbyGameParticipants } from "./game-lobby.js";

describe("game interaction areas", () => {
  it.each(["object-falling-blocks", "object-tic-tac-toe", "object-chess"])("enters every edge of the drawn %s circle", (id) => {
    const object = new DemoStore().getObject(id)!;
    const area = getGameArea(object);
    for (let angle = 0; angle < 360; angle += 15) {
      const radians = angle * Math.PI / 180;
      const player: WorldPlayer = { userId: "human", floorId: object.floorId, connected: true,
        availability: "available", facing: "down", x: area.x + Math.cos(radians) * (area.radius - 0.01),
        y: area.y + Math.sin(radians) * (area.radius - 0.01) };
      expect(nearbyGameParticipants([player], object, new Set(["human"]), [])).toEqual(["human"]);
      player.x = area.x + Math.cos(radians) * (area.radius + 1);
      player.y = area.y + Math.sin(radians) * (area.radius + 1);
      expect(nearbyGameParticipants([player], object, new Set(["human"]), [])).toEqual([]);
    }
  });
});
