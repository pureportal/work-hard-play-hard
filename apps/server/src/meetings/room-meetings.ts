import { createHash } from "node:crypto";
import type { Conversation, Meeting, Room } from "@workhard/shared";

export function synchronizeRoomMeetings(previousRooms: Room[], rooms: Room[], meetings: Meeting[], conversations: Conversation[]): void {
  const roomIds = new Set([...previousRooms, ...rooms].filter((room) => room.meetingRoom).map((room) => room.id));
  for (const roomId of roomIds) {
    const id = `room-meeting-${createHash("sha256").update(roomId).digest("hex").slice(0, 32)}`;
    const room = rooms.find((candidate) => candidate.id === roomId);
    let meeting = meetings.find((candidate) => candidate.id === id);
    if (!room?.meetingRoom) {
      if (meeting) meeting.status = "ended";
      continue;
    }
    if (!meeting) {
      meeting = { id, title: room.name, location: { type: "room", roomId }, status: "idle", participantIds: [] };
      meetings.push(meeting);
      conversations.push({ id: `conversation-${id}`, name: room.name, type: "meeting", meetingId: id, unread: 0 });
    }
    meeting.title = room.name;
    if (meeting.status === "ended") meeting.status = "idle";
    const conversation = conversations.find((candidate) => candidate.meetingId === id);
    if (conversation) conversation.name = room.name;
  }
}
