import { describe, expect, it } from "vitest";
import { createSeedData } from "./seed.js";
import { canOccupy } from "./world/collision.js";

const seedTime = new Date("2026-08-29T12:00:00.000Z");

describe("development seed", () => {
  it("covers the virtual-office states used during development", () => {
    const data = createSeedData("user-maya", seedTime);
    const areaTypes = data.layouts.flatMap((layout) => layout.areas.map((area) => area.type));

    expect(data.members).toHaveLength(11);
    expect(data.messages.length).toBeGreaterThan(30);
    expect([...new Set(data.members.map((member) => member.role))].sort()).toEqual(["admin", "guest", "member", "owner"]);
    expect([...new Set(data.members.map((member) => member.availability))].sort()).toEqual(["available", "away", "busy", "dnd"]);
    expect([...new Set(areaTypes)].sort()).toEqual(["arcade", "desk", "kitchen", "lounge", "meeting", "private"]);
    expect([...new Set(data.meetings.map((meeting) => meeting.status))].sort()).toEqual(["ended", "live", "scheduled"]);
    expect(data.meetings).toContainEqual(expect.objectContaining({
      id: "meeting-open-huddle",
      location: expect.objectContaining({ type: "public" }),
      participantIds: ["user-theo"],
    }));
    expect(data.layouts.flatMap((layout) => layout.areas)).toContainEqual(expect.objectContaining({
      id: "area-focus",
      locked: true,
      memberIds: expect.arrayContaining(["user-priya"]),
    }));
    expect(data.layouts.flatMap((layout) => layout.areas)).toContainEqual(expect.objectContaining({
      visibility: "members",
      memberIds: expect.arrayContaining(["user-aisha"]),
    }));
  });

  it("keeps fixture references, positions, and message sequences valid", () => {
    const data = createSeedData("user-maya", seedTime);
    const memberIds = new Set(data.members.map((member) => member.id));
    const floorIds = new Set(data.floors.map((floor) => floor.id));
    const areas = data.layouts.flatMap((layout) => layout.areas);
    const areaIds = new Set(areas.map((area) => area.id));
    const meetingIds = new Set(data.meetings.map((meeting) => meeting.id));
    const conversationIds = new Set(data.conversations.map((conversation) => conversation.id));
    const objectIds = new Set(data.layouts.flatMap((layout) => layout.objects.map((object) => object.id)));
    const gameIds = new Set(data.miniGames.map((game) => game.id));

    expectUnique(data.members.map((member) => member.id));
    expectUnique(data.members.map((member) => member.email));
    expectUnique(data.floors.map((floor) => floor.id));
    expectUnique(areas.map((area) => area.id));
    expectUnique(data.layouts.flatMap((layout) => layout.objects.map((object) => object.id)));
    expectUnique(data.conversations.map((conversation) => conversation.id));
    expectUnique(data.messages.map((message) => message.id));
    expectUnique(data.meetings.map((meeting) => meeting.id));
    expectUnique(data.scores.map((score) => score.id));
    expect(memberIds.has(data.currentUserId)).toBe(true);

    for (const layout of data.layouts) {
      expect(floorIds.has(layout.floorId)).toBe(true);
      expect(layout.areas.every((area) => area.floorId === layout.floorId)).toBe(true);
      expect(layout.objects.every((object) => object.floorId === layout.floorId)).toBe(true);
      for (const area of layout.areas.filter((candidate) => candidate.type === "meeting" || candidate.type === "private")) {
        expect(area.doors.length).toBeGreaterThan(0);
        for (const door of area.doors) {
          const length = door.side === "top" || door.side === "bottom" ? area.width : area.height;
          expect(door.offset).toBeGreaterThanOrEqual(0);
          expect(door.offset + door.width).toBeLessThanOrEqual(length);
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
      if (conversation.areaId) {
        expect(areaIds.has(conversation.areaId)).toBe(true);
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
        expect(areaIds.has(meeting.location.areaId)).toBe(true);
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
    }
  });
});

function expectUnique(values: string[]): void {
  expect(new Set(values).size).toBe(values.length);
}
