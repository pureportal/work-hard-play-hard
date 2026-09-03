import {
  ASSET_CATALOG,
  detectRooms,
  getAssetDefinition,
  getAssetPlacementError,
  getOutdoorBounds,
  getPlacedAssetBounds,
  getWallLength,
  isPointInRoom,
  rectanglesOverlap,
  type FloorLayout,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { createInitialData, createSeedData } from "./seed.js";
import { canOccupy } from "./world/collision.js";

const seedTime = new Date("2026-08-29T12:00:00.000Z");

describe("development seed", () => {
  it("starts an installation without demo identities or private assignments", () => {
    const data = createInitialData(seedTime);

    expect(data.members).toEqual([]);
    expect(data.invitations).toEqual([]);
    expect(data.messages).toEqual([]);
    expect(data.meetings).toEqual([]);
    expect(data.scores).toEqual([]);
    expect(data.layouts.flatMap((layout) => layout.rooms).every((room) => (
      room.access.mode === "open"
      && room.access.assignedPersonIds.length === 0
      && !room.access.knockable
    ))).toBe(true);
    expect(data.layouts.flatMap((layout) => layout.objects).filter((object) => object.id.startsWith("object-desk-")))
      .not.toContainEqual(expect.objectContaining({ label: expect.any(String) }));
  });

  it("covers the virtual-office states used during development", () => {
    const data = createSeedData("user-maya", seedTime);
    const rooms = data.layouts.flatMap((layout) => layout.rooms);
    const objects = data.layouts.flatMap((layout) => layout.objects);

    expect(data.members).toHaveLength(11);
    expect(data.messages.length).toBeGreaterThan(30);
    expect([...new Set(data.members.map((member) => member.role))].sort()).toEqual(["admin", "guest", "member", "owner"]);
    expect([...new Set(data.members.map((member) => member.availability))].sort()).toEqual(["available", "away", "busy", "dnd"]);
    expect(rooms).toHaveLength(9);
    expect([...new Set(data.meetings.map((meeting) => meeting.status))].sort()).toEqual(["ended", "live", "scheduled"]);
    expect(data.meetings).toContainEqual(expect.objectContaining({
      id: "meeting-open-huddle",
      location: expect.objectContaining({ type: "public" }),
      participantIds: ["user-theo"],
    }));
    expect(rooms).toContainEqual(expect.objectContaining({
      id: "room-focus",
      access: expect.objectContaining({
        mode: "assigned",
        assignedPersonIds: expect.arrayContaining(["user-priya"]),
        knockable: true,
      }),
    }));
    expect(rooms).toContainEqual(expect.objectContaining({
      id: "room-quiet",
      access: expect.objectContaining({ assignedPersonIds: expect.arrayContaining(["user-aisha"]) }),
    }));
    expect(data.layouts.flatMap((layout) => layout.objects)).toContainEqual(expect.objectContaining({
      id: "object-tetris",
      assetId: "equipment-tetris",
    }));
    expect(getAssetDefinition("equipment-tetris")).toMatchObject({ kind: "game", buildable: true });
    expect(data.floors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "floor-studio", width: 1_792, height: 1_088 }),
      expect.objectContaining({ id: "floor-rooftop", width: 1_408, height: 896 }),
    ]));
    const seededAssetIds = new Set(objects.map((object) => object.assetId));
    expect(ASSET_CATALOG.assets.map((asset) => asset.id).filter((assetId) => !seededAssetIds.has(assetId))).toEqual([]);
    expect(new Set(objects.filter((object) => object.assetId === "floor-tile").map((object) => object.variantId)))
      .toEqual(new Set(["grass", "stone", "wood"]));
    expect(objects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "object-studio-commons-rug-1-1", variantId: "wood" }),
      expect.objectContaining({ id: "object-studio-entry-step-1-1", variantId: "stone" }),
      expect.objectContaining({ id: "object-south-garden-bed", assetId: "outdoor-garden-bed" }),
      expect.objectContaining({ id: "object-rooftop-garden-rug-1-1", variantId: "wood" }),
      expect.objectContaining({ id: "object-rooftop-deck-cafe-table", assetId: "table-cafe" }),
    ]));

    const studioLayout = data.layouts.find((layout) => layout.floorId === "floor-studio")!;
    const rooftopLayout = data.layouts.find((layout) => layout.floorId === "floor-rooftop")!;
    expect(studioLayout.openings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "door-studio-garden", type: "door" }),
      expect.objectContaining({ id: "window-product-south-west", type: "window" }),
      expect.objectContaining({ id: "window-arcade-south-east", type: "window" }),
    ]));
    expect(rooftopLayout.openings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "door-rooftop-garden", type: "door" }),
      expect.objectContaining({ id: "window-garden-south-west", type: "window" }),
      expect.objectContaining({ id: "window-cafe-south", type: "window" }),
    ]));

    const outdoorObjectIds = data.layouts.flatMap((layout) => layout.objects.filter((object) => {
      const bounds = getPlacedAssetBounds(object);
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      return !layout.rooms.some((room) => isPointInRoom(center.x, center.y, room));
    }).map((object) => object.id));
    expect(outdoorObjectIds).toEqual(expect.arrayContaining([
      "object-east-pool",
      "object-east-garden-bed-a",
      "object-east-bench",
      "object-courtyard-table",
      "object-south-garden-bed",
      "object-rooftop-garden-bed",
      "object-rooftop-deck-cafe-table",
    ]));
    expect(data.gameStatistics).toHaveLength(data.members.length);
    expect(data.gameStatistics.find((statistics) => statistics.userId === "user-priya")).toMatchObject({
      multiplayerWins: 1,
      highestScore: 3_640,
    });
  });

  it("keeps fixture references, positions, and message sequences valid", () => {
    const data = createSeedData("user-maya", seedTime);
    const memberIds = new Set(data.members.map((member) => member.id));
    const floorIds = new Set(data.floors.map((floor) => floor.id));
    const rooms = data.layouts.flatMap((layout) => layout.rooms);
    const roomIds = new Set(rooms.map((room) => room.id));
    const meetingIds = new Set(data.meetings.map((meeting) => meeting.id));
    const conversationIds = new Set(data.conversations.map((conversation) => conversation.id));
    const objectIds = new Set(data.layouts.flatMap((layout) => layout.objects.map((object) => object.id)));
    const gameIds = new Set(data.miniGames.map((game) => game.id));

    expectUnique(data.members.map((member) => member.id));
    expectUnique(data.members.map((member) => member.email));
    expectUnique(data.floors.map((floor) => floor.id));
    expectUnique(rooms.map((room) => room.id));
    expectUnique(data.layouts.flatMap((layout) => layout.objects.map((object) => object.id)));
    expectUnique(data.conversations.map((conversation) => conversation.id));
    expectUnique(data.messages.map((message) => message.id));
    expectUnique(data.meetings.map((meeting) => meeting.id));
    expectUnique(data.scores.map((score) => score.id));
    expect(memberIds.has(data.currentUserId)).toBe(true);

    for (const layout of data.layouts) {
      expect(floorIds.has(layout.floorId)).toBe(true);
      expect(layout.rooms.every((room) => room.floorId === layout.floorId)).toBe(true);
      expect(layout.objects.every((object) => object.floorId === layout.floorId)).toBe(true);
      const floor = data.floors.find((candidate) => candidate.id === layout.floorId)!;
      const detected = detectRooms({ ...floor, floorId: floor.id, walls: layout.walls, openings: layout.openings });
      expect(detected.map((room) => room.bounds)).toEqual(layout.rooms.map((room) => room.bounds));
      expect(layout.rooms.every((room) => room.privateEligible && room.doorIds.length > 0)).toBe(true);
      expect(layout.openings.some((opening) => opening.type === "window")).toBe(true);
      const placed: FloorLayout = { ...layout, objects: [] };
      for (const object of layout.objects) {
        expect(getAssetPlacementError(placed, getOutdoorBounds(floor), object), object.id).toBeUndefined();
        placed.objects.push(object);
      }
      for (const opening of layout.openings) {
        const wall = layout.walls.find((candidate) => candidate.id === opening.wallId)!;
        expect(opening.offset).toBeGreaterThanOrEqual(0);
        expect(opening.offset + opening.width).toBeLessThanOrEqual(getWallLength(wall));
      }
      for (const [index, room] of layout.rooms.entries()) {
        for (const other of layout.rooms.slice(index + 1)) {
          expect(room.footprint.some((left) => other.footprint.some((right) => rectanglesOverlap(left, right)))).toBe(false);
        }
      }
    }

    const onlineMembers = data.members.filter((member) => member.online);
    for (const member of onlineMembers) {
      expect(member.floorId).toBeDefined();
      expect(member.position).toBeDefined();
      const floor = data.floors.find((candidate) => candidate.id === member.floorId)!;
      const layout = data.layouts.find((candidate) => candidate.floorId === member.floorId)!;
      expect(member.position!.x).toBeGreaterThan(0);
      expect(member.position!.x).toBeLessThan(floor.width);
      expect(member.position!.y).toBeGreaterThan(0);
      expect(member.position!.y).toBeLessThan(floor.height);
      expect(canOccupy(
        layout,
        floor,
        member.id,
        member.position!.x,
        member.position!.y,
        member.position!.x,
        member.position!.y,
      )).toBe(true);
    }

    for (const [index, member] of onlineMembers.entries()) {
      for (const coworker of onlineMembers.slice(index + 1)) {
        if (member.floorId === coworker.floorId) {
          expect(Math.hypot(
            member.position!.x - coworker.position!.x,
            member.position!.y - coworker.position!.y,
          )).toBeGreaterThanOrEqual(26);
        }
      }
    }

    for (const conversation of data.conversations) {
      if (conversation.roomId) {
        expect(roomIds.has(conversation.roomId)).toBe(true);
      }
      if (conversation.meetingId) {
        expect(meetingIds.has(conversation.meetingId)).toBe(true);
      }
      for (const participantId of conversation.participantIds ?? []) {
        expect(memberIds.has(participantId)).toBe(true);
      }
      const sequences = data.messages
        .filter((message) => message.conversationId === conversation.id)
        .map((message) => message.sequence)
        .sort((left, right) => left - right);
      expect(sequences).toEqual(Array.from({ length: sequences.length }, (_, index) => index + 1));
    }

    for (const message of data.messages) {
      expect(conversationIds.has(message.conversationId)).toBe(true);
      expect(memberIds.has(message.userId)).toBe(true);
      expect(message.body).toBe(message.body.trim());
      expect(Number.isFinite(Date.parse(message.createdAt))).toBe(true);
    }

    for (const meeting of data.meetings) {
      for (const participantId of meeting.participantIds) {
        expect(memberIds.has(participantId)).toBe(true);
      }
      if (meeting.location.type === "room") {
        expect(roomIds.has(meeting.location.roomId)).toBe(true);
      } else {
        expect(floorIds.has(meeting.location.floorId)).toBe(true);
      }
    }

    for (const game of data.miniGames) {
      expect(objectIds.has(game.objectId)).toBe(true);
    }
    for (const score of data.scores) {
      expect(gameIds.has(score.definitionId)).toBe(true);
      expect(memberIds.has(score.userId)).toBe(true);
      expect(score.won).toBe(score.mode === "multiplayer" && score.placement === 1);
    }
  });
});

function expectUnique(values: string[]): void {
  expect(new Set(values).size).toBe(values.length);
}
