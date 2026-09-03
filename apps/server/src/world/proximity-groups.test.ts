import { describe, expect, it } from "vitest";
import { PROXIMITY_GROUP_REACH_RADIUS, PROXIMITY_INTERACTION_RADIUS } from "@workhard/shared";
import {
  reconcileProximityGroups,
  type ProximityParticipant,
} from "./proximity-groups.js";

function reconcile(participants: ProximityParticipant[]) {
  let nextId = 1;
  return reconcileProximityGroups(participants, () => `group-${nextId++}`);
}

describe("reconcileProximityGroups", () => {
  it("keeps a ready player available without starting a call alone", () => {
    expect(reconcile([
      { userId: "maya", floorId: "studio", x: 0, y: 0 },
    ])).toEqual(new Map());
  });

  it("forms a group when two interaction circles touch", () => {
    const memberships = reconcile([
      { userId: "maya", floorId: "studio", x: 0, y: 0 },
      { userId: "leo", floorId: "studio", x: PROXIMITY_INTERACTION_RADIUS * 2, y: 0 },
    ]);

    expect(memberships.get("maya")).toBe("group-1");
    expect(memberships.get("leo")).toBe("group-1");
  });

  it("joins a ready player to an existing nearby group", () => {
    const memberships = reconcile([
      { userId: "maya", floorId: "studio", x: 0, y: 0, groupId: "group-existing" },
      { userId: "leo", floorId: "studio", x: 140, y: 0, groupId: "group-existing" },
      { userId: "jonas", floorId: "studio", x: 140 + PROXIMITY_GROUP_REACH_RADIUS + PROXIMITY_INTERACTION_RADIUS, y: 0 },
    ]);

    expect(new Set(memberships.values())).toEqual(new Set(["group-existing"]));
    expect([...memberships.keys()].sort()).toEqual(["jonas", "leo", "maya"]);
  });

  it("merges two calls when participants bring their group zones together", () => {
    const memberships = reconcile([
      { userId: "a", floorId: "studio", x: 0, y: 0, groupId: "group-a" },
      { userId: "b", floorId: "studio", x: 140, y: 0, groupId: "group-a" },
      { userId: "c", floorId: "studio", x: 140 + PROXIMITY_GROUP_REACH_RADIUS * 2, y: 0, groupId: "group-b" },
      { userId: "d", floorId: "studio", x: 280 + PROXIMITY_GROUP_REACH_RADIUS * 2, y: 0, groupId: "group-b" },
    ]);

    expect(new Set(memberships.values()).size).toBe(1);
    expect(memberships.size).toBe(4);
  });

  it("keeps a moving call connected through the shared group reach zone", () => {
    const reach = PROXIMITY_GROUP_REACH_RADIUS * 2 - 1;
    const memberships = reconcile([
      { userId: "a", floorId: "studio", x: 0, y: 0, groupId: "group-existing" },
      { userId: "b", floorId: "studio", x: reach, y: 0, groupId: "group-existing" },
      { userId: "c", floorId: "studio", x: reach * 2, y: 0, groupId: "group-existing" },
    ]);

    expect(new Set(memberships.values())).toEqual(new Set(["group-existing"]));
    expect(memberships.size).toBe(3);
  });

  it("splits a call and ends isolated memberships beyond group reach", () => {
    const beyondReach = PROXIMITY_GROUP_REACH_RADIUS * 2 + 1;
    const memberships = reconcile([
      { userId: "a", floorId: "studio", x: 0, y: 0, groupId: "group-existing" },
      { userId: "b", floorId: "studio", x: 120, y: 0, groupId: "group-existing" },
      { userId: "c", floorId: "studio", x: 120 + beyondReach, y: 0, groupId: "group-existing" },
    ]);

    expect(memberships.get("a")).toBe("group-existing");
    expect(memberships.get("b")).toBe("group-existing");
    expect(memberships.has("c")).toBe(false);
  });

  it("splits a separated group into two independent calls", () => {
    const memberships = reconcile([
      { userId: "a", floorId: "studio", x: 0, y: 0, groupId: "group-existing" },
      { userId: "b", floorId: "studio", x: 120, y: 0, groupId: "group-existing" },
      { userId: "c", floorId: "studio", x: 500, y: 0, groupId: "group-existing" },
      { userId: "d", floorId: "studio", x: 620, y: 0, groupId: "group-existing" },
    ]);

    expect(memberships.get("a")).toBe(memberships.get("b"));
    expect(memberships.get("c")).toBe(memberships.get("d"));
    expect(memberships.get("a")).not.toBe(memberships.get("c"));
  });

  it("does not connect overlapping players on different floors", () => {
    expect(reconcile([
      { userId: "maya", floorId: "studio", x: 0, y: 0 },
      { userId: "leo", floorId: "rooftop", x: 0, y: 0 },
    ])).toEqual(new Map());
  });

  it("does not connect overlapping players across acoustic zones", () => {
    expect(reconcile([
      { userId: "maya", floorId: "studio", zoneId: "floor", x: 0, y: 0 },
      { userId: "leo", floorId: "studio", zoneId: "room", x: 0, y: 0 },
    ])).toEqual(new Map());
  });

  it("connects nearby players across spatial grid boundaries", () => {
    const memberships = reconcile([
      { userId: "maya", floorId: "studio", x: -1, y: -1 },
      { userId: "leo", floorId: "studio", x: 1, y: 1 },
    ]);

    expect(memberships.get("maya")).toBe("group-1");
    expect(memberships.get("leo")).toBe("group-1");
  });

  it("handles a large sparse office without creating memberships", () => {
    const participants = Array.from({ length: 2_000 }, (_, index) => ({
      userId: `user-${String(index).padStart(4, "0")}`,
      floorId: "studio",
      x: index * (PROXIMITY_GROUP_REACH_RADIUS * 3),
      y: index % 2,
    }));

    expect(reconcile(participants)).toEqual(new Map());
  });
});
