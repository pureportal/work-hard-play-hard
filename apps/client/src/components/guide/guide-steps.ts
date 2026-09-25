import { DAILY_REWARD_AMOUNTS, GAME_REWARD_DAILY_CAP, roomAccessAllows, roomBuildAllows, type BootstrapData, type DailyRewardStatus } from "@workhard/shared";
import type { Step } from "react-joyride";

export type GuideScreen = { panel: "build" | "approvals" | "meetings" | null }
  | { panel: "approvalDesk" }
  | { panel: "rooms"; floorId: string; roomId: string };

export type GuideStep = Step & { screen: GuideScreen; target: string };

export function dailyGuideContent(reward: DailyRewardStatus): string {
  return reward.claimable
    ? `Claim your daily bonus from the gift button. Keep your streak going to earn up to ${DAILY_REWARD_AMOUNTS.at(-1)} coins a day; miss a day and it resets.`
    : "Today’s bonus is already claimed. The gift button reopens your rewards. Come back after midnight UTC to keep your streak going.";
}

export type GuideData = Pick<BootstrapData, "currentUserId" | "layouts" | "gameSettings" | "organisation" | "economy"> & { features?: BootstrapData["features"] };

export function createGuideSteps(data: GuideData, floorId: string, grantedRoomIds: Set<string>): GuideStep[] {
  const rooms = data.layouts.find(layout => layout.floorId === floorId)?.rooms ?? [];
  const accessible = rooms.filter(room => roomAccessAllows(room, data.currentUserId, data.gameSettings, data.organisation) || grantedRoomIds.has(room.id));
  const meeting = accessible.find(room => room.meetingRoom);
  const shared = accessible.filter(room => !room.meetingRoom);
  const canPlace = rooms.some(room => roomBuildAllows(room, data.currentUserId, data.gameSettings, data.organisation)
    || roomAccessAllows(room, data.currentUserId, data.gameSettings, data.organisation) && room.personalAreas?.some(area => area.ownerUserId === data.currentUserId));
  const steps: GuideStep[] = [];
  if (data.features?.approvalDesk) steps.push(
    { id: "desk-stamp", target: '[data-guide="desk-stamp"]', title: "Stamp a form", content: "Stamp to add forms and shorten an active case.", screen: { panel: "approvalDesk" }, placement: "left", blockTargetInteraction: false },
    { id: "desk-case", target: '[data-guide="desk-case"]', title: "Start a case", content: "Choose a case to process while you play.", screen: { panel: "approvalDesk" }, placement: "left", blockTargetInteraction: false },
  );
  steps.push(
    {
      id: "coins", target: '[data-guide="wallet"]', title: "Pocket money",
      content: `Finish Falling Blocks rounds or play Tic-Tac-Toe against another player to earn up to ${GAME_REWARD_DAILY_CAP} coins a day. Spend them in the Shop or donate to a shared fund for construction.`,
      screen: { panel: "build" }, placement: "right",
    },
    {
      id: "daily", target: '[data-guide="daily"]', title: "A little payday",
      content: dailyGuideContent(data.economy.dailyReward),
      screen: { panel: null }, placement: "bottom",
    },
    {
      id: "items", target: '[data-guide="assets"]', title: "Make yourself at home",
      content: canPlace
        ? "Shop purchases go into Inventory. Choose Place to furnish a room where you can build, or your personal area. Placed lets you find or store your items."
        : rooms.length
          ? "Shop purchases go into Inventory. This floor has no space where you can place items yet. Check Room settings for building access."
          : "Shop purchases stay in Inventory until you have a room to furnish. Visit a floor with rooms to place your items.",
      screen: { panel: "build" }, placement: "left",
    },
    {
      id: "approvals", target: '[data-guide="proposals"]', title: "Your vote shapes the place",
      content: "Approve or Reject changes to shared spaces, spending, and room rules. A majority must approve before Apply proposal makes the change. Construction uses the shared fund.",
      screen: { panel: "approvals" }, placement: "top",
    },
  );
  if (shared[0]) steps.push({
    id: "shared-rooms", target: '[data-guide="room-directory"]', title: "Find your spot",
    content: "For a quick chat or call, walk up to someone in a shared room. Room settings shows who can enter and build.",
    screen: { panel: "rooms", floorId, roomId: shared[0].id }, placement: "right",
  });
  if (rooms.some(room => !accessible.includes(room))) steps.push({
    id: "room-access", target: '[data-guide="room-directory"]', title: "Behind closed doors",
    content: "Some rooms have restricted access. If a door offers Knock, ask someone inside to let you in. Being let in does not grant building access.",
    screen: { panel: "rooms", floorId, roomId: rooms.find(room => !accessible.includes(room))!.id }, placement: "right",
  });
  if (meeting) steps.push({
    id: "meetings", target: `[data-guide="meetings"] [data-guide-room=${JSON.stringify(meeting.id)}]`, title: meeting.name,
    content: "Start or join a room call here. Joining takes you to that room; microphone and camera controls are in the call.",
    screen: { panel: "meetings" }, placement: "left",
  });
  steps.push({
    id: "explore", target: '[data-guide="world"]', title: "Over to you",
    content: "Tap or click the floor to move. Drag to pan; pinch or use the camera controls to zoom. On a keyboard, use WASD or arrow keys.",
    screen: { panel: null }, placement: "center",
  });
  return steps;
}
