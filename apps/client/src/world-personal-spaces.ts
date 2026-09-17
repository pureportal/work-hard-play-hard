import { Container, Graphics, Text } from "pixi.js";
import type { FloorLayout, Member } from "@workhard/shared";

export function createPersonalSpaceOverlay(layout: FloorLayout, members: ReadonlyMap<string, Member>, userId: string): Container {
  const overlay = new Container();
  for (const room of layout.rooms) {
    const spaces = room.ownerUserId
      ? [{ ownerUserId: room.ownerUserId, bounds: room.bounds, footprint: room.footprint }]
      : (room.personalAreas ?? []).map((area) => ({ ...area, footprint: [area.bounds] }));
    for (const space of spaces) {
      const owner = members.get(space.ownerUserId);
      if (!owner) continue;
      const color = space.ownerUserId === userId ? "#73d9b0" : "#b0a0f7";
      const outline = new Graphics();
      for (const rect of space.footprint) outline.rect(rect.x, rect.y, rect.width, rect.height);
      outline.fill({ color, alpha: 0.1 }).stroke({ color, width: 2, alpha: 0.9 });
      const label = new Text({ text: owner.name, style: { fontFamily: "Inter, Segoe UI, sans-serif", fontSize: 12, fontWeight: "600", fill: color } });
      const x = space.bounds.x + 8;
      const y = space.bounds.y + space.bounds.height - 29;
      label.position.set(x + 7, y + 5);
      const plate = new Graphics().roundRect(x, y, label.width + 14, 24, 6).fill({ color: "#20212a", alpha: 0.94 });
      overlay.addChild(outline, plate, label);
    }
  }
  overlay.eventMode = "none";
  return overlay;
}
