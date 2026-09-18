import { DEFAULT_GAME_SETTINGS, type Floor, type FloorLayout } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { assertPublicReachability, assertTeleportersRetained, findRescuePosition } from "./public-reachability.js";

const floor: Floor = { id: "floor", officeId: "office", level: 1, name: "Floor", width: 640, height: 640, background: "#ffffff", spawn: { x: 160, y: 224 } };
const settings = { ...DEFAULT_GAME_SETTINGS, roomAccess: { mode: "open" as const, assignedPersonIds: [] } };

function layout(): FloorLayout {
  return { floorId: floor.id, revision: 0, walls: [], openings: [], tiles: [], rooms: [], objects: [
    { id: "portal", floorId: floor.id, assetId: "infrastructure-portal", variantId: "violet", rotation: 0, x: 320, y: 320, label: "2" },
  ] };
}

function enclosure(next: FloorLayout, x: number, y: number): void {
  next.walls.push(
    { id: "top", start: { x, y }, end: { x: x + 128, y } },
    { id: "bottom", start: { x, y: y + 128 }, end: { x: x + 128, y: y + 128 } },
    { id: "left", start: { x, y }, end: { x, y: y + 128 } },
    { id: "right", start: { x: x + 128, y }, end: { x: x + 128, y: y + 128 } },
  );
}

describe("public route protection", () => {
  it("rescues to the start normally, or outside when the start is blocked or enclosed", () => {
    const next = layout();
    expect(findRescuePosition(floor, next, settings)).toEqual(floor.spawn);
    enclosure(next, 96, 160);
    expect(findRescuePosition(floor, next, settings)).toEqual({ x: -480, y: -480 });
    next.objects.push({ id: "desk", floorId: floor.id, assetId: "desk-straight", variantId: "oak", rotation: 0, x: 144, y: 208 });
    expect(findRescuePosition(floor, next, settings)).toEqual({ x: -480, y: -480 });
  });

  it("allows open public routes", () => {
    expect(() => assertPublicReachability(floor, layout(), settings)).not.toThrow();
  });

  it.each(["spawn", "portal"])("rejects enclosing the %s even without detected rooms", (target) => {
    const next = layout();
    enclosure(next, target === "spawn" ? 96 : 288, target === "spawn" ? 160 : 288);
    expect(() => assertPublicReachability(floor, next, settings)).toThrow(target === "spawn" ? "SPAWN_UNREACHABLE" : "TELEPORTER_UNREACHABLE");
  });

  it("allows an enclosure with a usable public door but rejects closing it with furniture", () => {
    const next = layout();
    enclosure(next, 288, 288);
    next.openings.push({ id: "door", wallId: "bottom", type: "door", offset: 32, width: 64 });
    expect(() => assertPublicReachability(floor, next, settings)).not.toThrow();
    next.objects.push({ id: "desk", floorId: floor.id, assetId: "desk-straight", variantId: "oak", rotation: 0, x: 304, y: 416 });
    expect(() => assertPublicReachability(floor, next, settings)).toThrow("TELEPORTER_UNREACHABLE");
  });

  it.each(["assigned", "default", "personal"])("rejects %s access around a teleporter", (access) => {
    const next = layout();
    next.rooms.push({ id: "room", floorId: floor.id, name: "Room", color: "#ffffff", capacity: 8,
      bounds: { x: 288, y: 288, width: 128, height: 128 }, footprint: [{ x: 288, y: 288, width: 128, height: 128 }],
      boundary: [], doorIds: [], windowIds: [], privateEligible: true,
      access: { mode: access === "personal" ? "open" : access as "assigned" | "default", assignedPersonIds: ["owner"], knockable: false },
      ...(access === "personal" ? { ownerUserId: "owner" } : {}),
    });
    expect(() => assertPublicReachability(floor, next, { ...settings, roomAccess: { mode: "assigned", assignedPersonIds: ["owner"] } })).toThrow("TELEPORTER_PUBLIC_ONLY");
  });

  it("rejects solid furniture covering the starting position", () => {
    const next = layout();
    next.objects.push({ id: "desk", floorId: floor.id, assetId: "desk-straight", variantId: "oak", rotation: 0, x: 144, y: 208 });
    expect(() => assertPublicReachability(floor, next, settings)).toThrow("SPAWN_BLOCKED");
  });

  it("protects both existence and destination, while allowing movement", () => {
    const previous = layout();
    const next = structuredClone(previous);
    next.objects[0]!.x += 64;
    expect(() => assertTeleportersRetained(previous, next)).not.toThrow();
    next.objects[0]!.label = "3";
    expect(() => assertTeleportersRetained(previous, next)).toThrow("TELEPORTER_PERMANENT");
    next.objects = [];
    expect(() => assertTeleportersRetained(previous, next)).toThrow("TELEPORTER_PERMANENT");
  });
});
