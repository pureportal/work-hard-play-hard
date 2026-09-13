import { distanceFromGameArea, type WorldObject, type WorldPlayer } from "@workhard/shared";

export function nearbyGameParticipants(
  players: Iterable<WorldPlayer>,
  object: WorldObject,
  connectedUserIds: ReadonlySet<string>,
  previous: readonly string[],
  capacity = Infinity,
): string[] {
  const candidates = [...players]
    .filter((player) => player.connected && connectedUserIds.has(player.userId) && player.floorId === object.floorId)
    .map((player) => ({ userId: player.userId, distance: distanceFromGameArea(player, object) }))
    .sort((left, right) => left.distance - right.distance || left.userId.localeCompare(right.userId));
  const distances = new Map(candidates.map(({ userId, distance }) => [userId, distance]));
  const next = previous.filter((userId) => (distances.get(userId) ?? Infinity) <= 16);
  for (const candidate of candidates) {
    if (next.length >= capacity) break;
    if (candidate.distance <= 0 && !next.includes(candidate.userId)) next.push(candidate.userId);
  }
  return next;
}
