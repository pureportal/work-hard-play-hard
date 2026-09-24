import { describe, expect, it } from "vitest";
import { createOrganisation, type Room } from "@workhard/shared";
import { createTestEconomy, createTestGameSettings } from "../../test-fixtures";
import { createGuideSteps, dailyGuideContent, type GuideData } from "./guide-steps";

function fixture(): GuideData {
  const room: Room = {
    id: "meeting", floorId: "floor", name: "Team room", meetingRoom: true, color: "#fff", capacity: 4,
    bounds: { x: 0, y: 0, width: 320, height: 320 }, footprint: [], boundary: [], doorIds: [], windowIds: [], privateEligible: true,
    access: { mode: "open", assignedPersonIds: [], knockable: false }, build: { mode: "default", assignedPersonIds: [] },
  };
  return {
    currentUserId: "player", economy: createTestEconomy(), organisation: createOrganisation(), gameSettings: createTestGameSettings(),
    layouts: [{ floorId: "floor", revision: 0, walls: [], openings: [], objects: [], tiles: [], rooms: [room] }],
  };
}

describe("Game guide state selection", () => {
  it("introduces stamping and starting a case before other systems when the Desk is enabled", () => {
    const data = { ...fixture(), features: { approvalDesk: true } } as GuideData;
    const steps = createGuideSteps(data, "floor", new Set());
    expect(steps.slice(0, 2).map((step) => step.id)).toEqual(["desk-stamp", "desk-case"]);
    expect(steps.slice(0, 2).every((step) => step.screen.panel === "approvalDesk" && step.blockTargetInteraction === false)).toBe(true);
    expect(createGuideSteps(fixture(), "floor", new Set()).some((step) => step.screen.panel === "approvalDesk")).toBe(false);
  });

  it("does not direct a player to join a restricted room", () => {
    const data = fixture();
    data.layouts[0]!.rooms[0]!.access.mode = "none";
    const steps = createGuideSteps(data, "floor", new Set());
    expect(steps.some(step => step.id === "meetings")).toBe(false);
    expect(steps.some(step => step.id === "room-access")).toBe(true);
  });

  it("includes a room after the player has been let in", () => {
    const data = fixture();
    data.layouts[0]!.rooms[0]!.access.mode = "none";
    expect(createGuideSteps(data, "floor", new Set(["meeting"])).find(step => step.id === "meetings")?.target).toContain('[data-guide-room="meeting"]');
  });

  it("omits room screens when the floor has no rooms", () => {
    const data = fixture();
    data.layouts[0]!.rooms = [];
    expect(createGuideSteps(data, "floor", new Set()).some(step => step.screen.panel === "rooms" || step.screen.panel === "meetings")).toBe(false);
    expect(createGuideSteps(data, "floor", new Set()).find(step => step.id === "items")?.content).toContain("Visit a floor with rooms");
  });

  it("only offers CEO room calls when room access grants them", () => {
    const data = fixture();
    data.organisation = createOrganisation("player");
    data.layouts[0]!.rooms[0]!.access = { mode: "assigned", assignedPersonIds: [], ceos: false, knockable: false };
    expect(createGuideSteps(data, "floor", new Set()).some(step => step.id === "meetings")).toBe(false);
    data.layouts[0]!.rooms[0]!.access.ceos = true;
    expect(createGuideSteps(data, "floor", new Set()).some(step => step.id === "meetings")).toBe(true);
  });

  it("explains unavailable placement, including for a CEO", () => {
    const data = fixture();
    data.organisation = createOrganisation("player");
    expect(createGuideSteps(data, "floor", new Set()).find(step => step.id === "items")?.content).toContain("no space where you can place items");
    data.gameSettings.roomBuild.mode = "open";
    expect(createGuideSteps(data, "floor", new Set()).find(step => step.id === "items")?.content).toContain("Choose Place");
  });

  it("recognizes a player's personal area without general building access", () => {
    const data = fixture();
    data.layouts[0]!.rooms[0]!.personalAreas = [{ id: "desk", name: "Desk", ownerUserId: "player", bounds: { x: 0, y: 0, width: 64, height: 64 } }];
    expect(createGuideSteps(data, "floor", new Set()).find(step => step.id === "items")?.content).toContain("Choose Place");
  });

  it("switches the daily instructions after a claim", () => {
    const reward = createTestEconomy().dailyReward;
    expect(dailyGuideContent(reward)).toContain("Claim your daily bonus");
    expect(dailyGuideContent({ ...reward, claimable: false })).toContain("already claimed");
  });
});
