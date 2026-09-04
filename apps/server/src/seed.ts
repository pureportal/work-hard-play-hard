import type {
  BootstrapData,
  ChatMessage,
  Conversation,
  GameScore,
  Invitation,
  Meeting,
  Member,
  MiniGameDefinition,
  Office,
  PlayerGameStatistics,
  Team,
} from "@workhard/shared";
import {
  DEFAULT_GAME_SETTINGS,
  DEFAULT_GLOBAL_KIDNAPPING_SETTINGS,
  DEFAULT_CORPORATE_IDENTITY,
  DEFAULT_PLAYER_KIDNAPPING_SETTINGS,
  TETRIS_DEFINITION_ID,
  WELCOME_COIN_REWARD,
  getDailyRewardStatus,
} from "@workhard/shared";
import { createSeedWorld } from "./seed-world.js";

const team: Team = {
  id: "team-northstar",
  name: "Northstar",
  slug: "northstar",
  accent: "#6c5ce7",
};

const office: Office = {
  id: "office-northstar-hq",
  teamId: team.id,
  name: "Northstar HQ",
};

const { floors, layouts } = createSeedWorld(office.id);

const members: Member[] = [
  {
    id: "user-maya",
    name: "Maya Chen",
    initials: "MC",
    email: "maya@northstar.studio",
    title: "Product Lead",
    role: "owner",
    permissions: ["manage_members", "build"],
    color: "#ff7a66",
    availability: "available",
    online: true,
    floorId: "floor-studio",
    activity: "Product Studio",
    position: { x: 410, y: 650 },
  },
  {
    id: "user-leo",
    name: "Leo Martins",
    initials: "LM",
    email: "leo@northstar.studio",
    title: "Design Engineer",
    role: "admin",
    permissions: ["manage_members", "build"],
    color: "#5b8def",
    availability: "available",
    online: true,
    floorId: "floor-studio",
    activity: "Commons",
    position: { x: 300, y: 310 },
  },
  {
    id: "user-amara",
    name: "Amara Okafor",
    initials: "AO",
    email: "amara@northstar.studio",
    title: "Engineering Lead",
    role: "admin",
    permissions: ["manage_members", "build"],
    color: "#25b99a",
    availability: "busy",
    online: true,
    floorId: "floor-studio",
    activity: "Daily Room",
    position: { x: 735, y: 350 },
  },
  {
    id: "user-jonas",
    name: "Jonas Berg",
    initials: "JB",
    email: "jonas@northstar.studio",
    title: "Frontend Engineer",
    role: "member",
    permissions: [],
    color: "#f4b942",
    availability: "available",
    online: true,
    floorId: "floor-studio",
    activity: "Arcade",
    position: { x: 1230, y: 650 },
  },
  {
    id: "user-priya",
    name: "Priya Nair",
    initials: "PN",
    email: "priya@northstar.studio",
    title: "Product Designer",
    role: "member",
    permissions: [],
    color: "#b26fe8",
    availability: "dnd",
    online: true,
    floorId: "floor-studio",
    activity: "Focus Suite",
    position: { x: 1170, y: 250 },
  },
  {
    id: "user-noah",
    name: "Noah Williams",
    initials: "NW",
    email: "noah@northstar.studio",
    title: "Community",
    role: "member",
    permissions: [],
    color: "#e36d9e",
    availability: "available",
    online: true,
    floorId: "floor-rooftop",
    activity: "Garden",
    position: { x: 350, y: 370 },
  },
  {
    id: "user-elena",
    name: "Elena Rossi",
    initials: "ER",
    email: "elena@northstar.studio",
    title: "Backend Engineer",
    role: "member",
    permissions: [],
    color: "#ef8354",
    availability: "available",
    online: true,
    floorId: "floor-studio",
    activity: "Product Studio",
    position: { x: 650, y: 720 },
  },
  {
    id: "user-theo",
    name: "Theo Park",
    initials: "TP",
    email: "theo@northstar.studio",
    title: "QA Engineer",
    role: "member",
    permissions: [],
    color: "#3b82a0",
    availability: "available",
    online: true,
    floorId: "floor-studio",
    activity: "Open huddle",
    position: { x: 800, y: 760 },
  },
  {
    id: "user-aisha",
    name: "Aisha Khan",
    initials: "AK",
    email: "aisha@northstar.studio",
    title: "User Researcher",
    role: "member",
    permissions: [],
    color: "#ca6f9d",
    availability: "busy",
    online: true,
    floorId: "floor-rooftop",
    activity: "Cafe",
    position: { x: 1080, y: 620 },
  },
  {
    id: "user-sam",
    name: "Sam Rivera",
    initials: "SR",
    email: "sam@northstar.studio",
    title: "Operations",
    role: "member",
    permissions: [],
    color: "#7d8b99",
    availability: "away",
    online: false,
  },
  {
    id: "user-owen",
    name: "Owen Brooks",
    initials: "OB",
    email: "owen@northstar.studio",
    title: "Client Partner",
    role: "guest",
    permissions: [],
    color: "#8c7a6b",
    availability: "away",
    online: false,
  },
];

const conversations: Conversation[] = [
  { id: "conversation-team", name: "Northstar", type: "team", unread: 3 },
  { id: "conversation-product", name: "Product Studio", type: "room", roomId: "room-product", unread: 0 },
  { id: "conversation-garden", name: "Garden", type: "room", roomId: "room-garden", unread: 1 },
  { id: "conversation-daily", name: "Daily Room", type: "meeting", meetingId: "meeting-product-crit", unread: 2 },
  { id: "conversation-open-huddle", name: "Open huddle", type: "meeting", meetingId: "meeting-open-huddle", unread: 0 },
  { id: "conversation-planning", name: "September planning", type: "meeting", meetingId: "meeting-planning", unread: 0 },
  { id: "conversation-leo", name: "Leo Martins", type: "direct", participantIds: ["user-maya", "user-leo"], unread: 0 },
  { id: "conversation-amara", name: "Amara Okafor", type: "direct", participantIds: ["user-maya", "user-amara"], unread: 1 },
  { id: "conversation-jonas", name: "Jonas Berg", type: "direct", participantIds: ["user-maya", "user-jonas"], unread: 0 },
  { id: "conversation-priya", name: "Priya Nair", type: "direct", participantIds: ["user-maya", "user-priya"], unread: 1 },
  { id: "conversation-noah", name: "Noah Williams", type: "direct", participantIds: ["user-maya", "user-noah"], unread: 0 },
  { id: "conversation-elena", name: "Elena Rossi", type: "direct", participantIds: ["user-maya", "user-elena"], unread: 1 },
  { id: "conversation-theo", name: "Theo Park", type: "direct", participantIds: ["user-maya", "user-theo"], unread: 0 },
  { id: "conversation-aisha", name: "Aisha Khan", type: "direct", participantIds: ["user-maya", "user-aisha"], unread: 1 },
  { id: "conversation-sam", name: "Sam Rivera", type: "direct", participantIds: ["user-maya", "user-sam"], unread: 1 },
  { id: "conversation-owen", name: "Owen Brooks", type: "direct", participantIds: ["user-maya", "user-owen"], unread: 0 },
];

function createMessages(now: Date): ChatMessage[] {
  return [
    { id: "message-team-1", conversationId: "conversation-team", userId: "user-amara", body: "API contract is ready for review.", createdAt: shiftedIso(now, -150), sequence: 1 },
    { id: "message-team-2", conversationId: "conversation-team", userId: "user-leo", body: "Nice. I left the latest flow on the board.", createdAt: shiftedIso(now, -145), sequence: 2 },
    { id: "message-team-3", conversationId: "conversation-team", userId: "user-elena", body: "The preview environment is stable again.", createdAt: shiftedIso(now, -138), sequence: 3 },
    { id: "message-team-4", conversationId: "conversation-team", userId: "user-jonas", body: "Tetris score to beat: 4,820.", createdAt: shiftedIso(now, -126), sequence: 4 },
    { id: "message-team-5", conversationId: "conversation-team", userId: "user-maya", body: "Open huddle is live in the Product Studio.", createdAt: shiftedIso(now, -115), sequence: 5 },
    { id: "message-team-6", conversationId: "conversation-team", userId: "user-theo", body: "I will run the entry checks from there.", createdAt: shiftedIso(now, -112), sequence: 6 },
    { id: "message-product-1", conversationId: "conversation-product", userId: "user-maya", body: "Product crit starts in ten.", createdAt: shiftedIso(now, -92), sequence: 1 },
    { id: "message-product-2", conversationId: "conversation-product", userId: "user-priya", body: "I will bring the compact-mode pass.", createdAt: shiftedIso(now, -89), sequence: 2 },
    { id: "message-product-3", conversationId: "conversation-product", userId: "user-elena", body: "Loading states are ready for a look.", createdAt: shiftedIso(now, -84), sequence: 3 },
    { id: "message-product-4", conversationId: "conversation-product", userId: "user-maya", body: "Let us use the Daily Room.", createdAt: shiftedIso(now, -80), sequence: 4 },
    { id: "message-garden-1", conversationId: "conversation-garden", userId: "user-noah", body: "Coffee outside after planning?", createdAt: shiftedIso(now, -70), sequence: 1 },
    { id: "message-garden-2", conversationId: "conversation-garden", userId: "user-aisha", body: "Yes, I will bring the interview notes.", createdAt: shiftedIso(now, -67), sequence: 2 },
    { id: "message-garden-3", conversationId: "conversation-garden", userId: "user-noah", body: "Perfect.", createdAt: shiftedIso(now, -65), sequence: 3 },
    { id: "message-daily-1", conversationId: "conversation-daily", userId: "user-amara", body: "Join when you are ready.", createdAt: shiftedIso(now, -24), sequence: 1 },
    { id: "message-daily-2", conversationId: "conversation-daily", userId: "user-leo", body: "Reviewing the final flow now.", createdAt: shiftedIso(now, -19), sequence: 2 },
    { id: "message-daily-3", conversationId: "conversation-daily", userId: "user-priya", body: "I added the mobile frames.", createdAt: shiftedIso(now, -16), sequence: 3 },
    { id: "message-huddle-1", conversationId: "conversation-open-huddle", userId: "user-theo", body: "Entry checks are green.", createdAt: shiftedIso(now, -8), sequence: 1 },
    { id: "message-huddle-2", conversationId: "conversation-open-huddle", userId: "user-maya", body: "Great, joining in a minute.", createdAt: shiftedIso(now, -6), sequence: 2 },
    { id: "message-planning-1", conversationId: "conversation-planning", userId: "user-noah", body: "The workshop board has the draft agenda.", createdAt: shiftedIso(now, -55), sequence: 1 },
    { id: "message-planning-2", conversationId: "conversation-planning", userId: "user-aisha", body: "I added the research themes.", createdAt: shiftedIso(now, -51), sequence: 2 },
    { id: "message-leo-1", conversationId: "conversation-leo", userId: "user-leo", body: "Can you check the lounge spacing?", createdAt: shiftedIso(now, -132), sequence: 1 },
    { id: "message-leo-2", conversationId: "conversation-leo", userId: "user-maya", body: "On it.", createdAt: shiftedIso(now, -129), sequence: 2 },
    { id: "message-leo-3", conversationId: "conversation-leo", userId: "user-leo", body: "Thanks. I am by the commons table.", createdAt: shiftedIso(now, -124), sequence: 3 },
    { id: "message-amara-1", conversationId: "conversation-amara", userId: "user-amara", body: "Can we pair after the crit?", createdAt: shiftedIso(now, -41), sequence: 1 },
    { id: "message-amara-2", conversationId: "conversation-amara", userId: "user-maya", body: "Yes, meet me in the studio.", createdAt: shiftedIso(now, -38), sequence: 2 },
    { id: "message-jonas-1", conversationId: "conversation-jonas", userId: "user-maya", body: "How is the arcade input feeling?", createdAt: shiftedIso(now, -118), sequence: 1 },
    { id: "message-jonas-2", conversationId: "conversation-jonas", userId: "user-jonas", body: "Much tighter. Come try a round.", createdAt: shiftedIso(now, -114), sequence: 2 },
    { id: "message-priya-1", conversationId: "conversation-priya", userId: "user-priya", body: "I am in focus mode for the next half hour.", createdAt: shiftedIso(now, -36), sequence: 1 },
    { id: "message-priya-2", conversationId: "conversation-priya", userId: "user-maya", body: "Got it. I will knock if it is urgent.", createdAt: shiftedIso(now, -34), sequence: 2 },
    { id: "message-noah-1", conversationId: "conversation-noah", userId: "user-noah", body: "Rooftop planning still works for me.", createdAt: shiftedIso(now, -62), sequence: 1 },
    { id: "message-noah-2", conversationId: "conversation-noah", userId: "user-maya", body: "See you in the Workshop.", createdAt: shiftedIso(now, -59), sequence: 2 },
    { id: "message-elena-1", conversationId: "conversation-elena", userId: "user-elena", body: "Could you review the reconnect copy?", createdAt: shiftedIso(now, -31), sequence: 1 },
    { id: "message-elena-2", conversationId: "conversation-elena", userId: "user-maya", body: "Send it over.", createdAt: shiftedIso(now, -28), sequence: 2 },
    { id: "message-theo-1", conversationId: "conversation-theo", userId: "user-theo", body: "I am standing in the open meeting circle.", createdAt: shiftedIso(now, -10), sequence: 1 },
    { id: "message-aisha-1", conversationId: "conversation-aisha", userId: "user-aisha", body: "The first interview theme is ready.", createdAt: shiftedIso(now, -47), sequence: 1 },
    { id: "message-aisha-2", conversationId: "conversation-aisha", userId: "user-maya", body: "Add it to the planning thread.", createdAt: shiftedIso(now, -44), sequence: 2 },
    { id: "message-sam-1", conversationId: "conversation-sam", userId: "user-sam", body: "I will be back online this afternoon.", createdAt: shiftedIso(now, -75), sequence: 1 },
  ];
}

function createInvitations(now: Date): Invitation[] {
  return [
    { id: "invite-ana", teamId: team.id, email: "ana@example.com", role: "member", permissions: [], status: "pending", expiresAt: shiftedIso(now, 7 * 24 * 60) },
    { id: "invite-guest", teamId: team.id, email: "guest@example.com", role: "guest", permissions: [], status: "pending", expiresAt: shiftedIso(now, 3 * 24 * 60) },
    { id: "invite-revoked", teamId: team.id, email: "former@example.com", role: "member", permissions: [], status: "revoked", expiresAt: shiftedIso(now, 2 * 24 * 60) },
  ];
}

function createMeetings(now: Date): Meeting[] {
  return [
    { id: "meeting-product-crit", title: "Product crit", location: { type: "room", roomId: "room-daily" }, startsAt: shiftedIso(now, -12), durationMinutes: 30, status: "live", participantIds: ["user-amara", "user-leo"] },
    { id: "meeting-open-huddle", title: "Open huddle", location: { type: "public", floorId: "floor-studio", x: 800, y: 760, radius: 82 }, startsAt: shiftedIso(now, -4), durationMinutes: 30, status: "live", participantIds: ["user-theo"] },
    { id: "meeting-planning", title: "September planning", location: { type: "room", roomId: "room-workshop" }, startsAt: shiftedIso(now, 50), durationMinutes: 45, status: "scheduled", participantIds: ["user-maya", "user-noah", "user-aisha"] },
    { id: "meeting-retro", title: "Sprint retro", location: { type: "room", roomId: "room-workshop" }, startsAt: shiftedIso(now, -100), durationMinutes: 45, status: "ended", participantIds: ["user-maya", "user-leo", "user-priya"] },
  ];
}

const miniGames: MiniGameDefinition[] = [
  { id: TETRIS_DEFINITION_ID, name: "Tetris", accent: "#ff7a66", objectId: "object-tetris" },
];

function createScores(now: Date): GameScore[] {
  return [
    { id: "score-jonas", roundId: "round-seed-jonas", definitionId: TETRIS_DEFINITION_ID, userId: "user-jonas", score: 4820, lines: 21, level: 3, mode: "solo", playerCount: 1, placement: 1, won: false, playedAt: shiftedIso(now, -24 * 60) },
    { id: "score-priya", roundId: "round-seed-priya-leo", definitionId: TETRIS_DEFINITION_ID, userId: "user-priya", score: 3640, lines: 17, level: 3, mode: "multiplayer", playerCount: 2, placement: 1, won: true, playedAt: shiftedIso(now, -2 * 24 * 60) },
    { id: "score-leo", roundId: "round-seed-priya-leo", definitionId: TETRIS_DEFINITION_ID, userId: "user-leo", score: 2910, lines: 14, level: 2, mode: "multiplayer", playerCount: 2, placement: 2, won: false, playedAt: shiftedIso(now, -2 * 24 * 60) },
    { id: "score-elena", roundId: "round-seed-elena-theo", definitionId: TETRIS_DEFINITION_ID, userId: "user-elena", score: 2540, lines: 13, level: 2, mode: "multiplayer", playerCount: 2, placement: 1, won: true, playedAt: shiftedIso(now, -3 * 24 * 60) },
    { id: "score-theo", roundId: "round-seed-elena-theo", definitionId: TETRIS_DEFINITION_ID, userId: "user-theo", score: 2100, lines: 11, level: 2, mode: "multiplayer", playerCount: 2, placement: 2, won: false, playedAt: shiftedIso(now, -3 * 24 * 60) },
    { id: "score-noah", roundId: "round-seed-noah", definitionId: TETRIS_DEFINITION_ID, userId: "user-noah", score: 1760, lines: 9, level: 2, mode: "solo", playerCount: 1, placement: 1, won: false, playedAt: shiftedIso(now, -5 * 24 * 60) },
  ];
}

function createGameStatistics(scores: GameScore[]): PlayerGameStatistics[] {
  return members.map((member) => {
    const playerScores = scores.filter((score) => score.userId === member.id);
    return {
      definitionId: TETRIS_DEFINITION_ID,
      userId: member.id,
      gamesPlayed: playerScores.length,
      multiplayerGamesPlayed: playerScores.filter((score) => score.mode === "multiplayer").length,
      multiplayerWins: playerScores.filter((score) => score.won).length,
      highestScore: Math.max(0, ...playerScores.map((score) => score.score)),
      highestLines: Math.max(0, ...playerScores.map((score) => score.lines)),
      totalScore: playerScores.reduce((total, score) => total + score.score, 0),
      totalLines: playerScores.reduce((total, score) => total + score.lines, 0),
    };
  });
}

function shiftedIso(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export function createSeedData(currentUserId = "user-maya", now = new Date()): BootstrapData {
  const scores = createScores(now);
  return structuredClone({
    currentUserId,
    corporateIdentity: DEFAULT_CORPORATE_IDENTITY,
    team,
    office,
    floors,
    members,
    layouts,
    conversations,
    messages: createMessages(now),
    invitations: createInvitations(now),
    meetings: createMeetings(now),
    miniGames,
    scores,
    gameStatistics: createGameStatistics(scores),
    economy: {
      coinBalance: WELCOME_COIN_REWARD,
      lifetimeEarned: WELCOME_COIN_REWARD,
      lifetimeSpent: 0,
      dailyReward: getDailyRewardStatus({ streak: 0 }, now),
      inventory: [],
      recentTransactions: [],
    },
    gameSettings: DEFAULT_GAME_SETTINGS,
    kidnapping: {
      global: DEFAULT_GLOBAL_KIDNAPPING_SETTINGS,
      player: DEFAULT_PLAYER_KIDNAPPING_SETTINGS,
    },
  });
}

export function createInitialData(now = new Date()): BootstrapData {
  const data = createSeedData("", now);
  return {
    ...data,
    members: [],
    layouts: data.layouts.map((layout) => ({
      ...layout,
      objects: layout.objects.map((object) => {
        if (!["object-desk-maya", "object-desk-leo", "object-desk-amara"].includes(object.id)) {
          return object;
        }
        const { label: _label, ...unassignedObject } = object;
        return unassignedObject;
      }),
      rooms: layout.rooms.map((room) => ({
        ...room,
        access: { mode: "open", assignedPersonIds: [], knockable: false },
      })),
    })),
    conversations: data.conversations
      .filter((conversation) => conversation.type === "team" || conversation.type === "room")
      .map((conversation) => ({ ...conversation, unread: 0 })),
    messages: [],
    invitations: [],
    meetings: [],
    scores: [],
    gameStatistics: [],
  };
}
