import type { GameRoundParticipantState } from "@workhard/shared";

export function selectSpectatorUserId(participants: GameRoundParticipantState[], preferredUserId?: string): string | undefined {
  const playing = participants.filter((participant) => participant.status === "playing");
  if (playing.some((participant) => participant.userId === preferredUserId)) return preferredUserId;
  return playing.sort((left, right) => right.score - left.score || left.userId.localeCompare(right.userId))[0]?.userId;
}
