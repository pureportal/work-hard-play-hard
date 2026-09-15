export type RoomEntryStatus = "accessible" | "restricted" | "full";

export interface PlayerRoomAccessibility {
  userId: string;
  floors: {
    floorId: string;
    rooms: { roomId: string; status: RoomEntryStatus }[];
  }[];
}
