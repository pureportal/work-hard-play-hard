import { PROXIMITY_GROUP_REACH_RADIUS, PROXIMITY_INTERACTION_RADIUS } from "@workhard/shared";

const PROXIMITY_EXIT_DISTANCE = PROXIMITY_GROUP_REACH_RADIUS * 2;
const PROXIMITY_GRID_SIZE = PROXIMITY_EXIT_DISTANCE;

export interface ProximityParticipant {
  userId: string;
  floorId: string;
  zoneId?: string;
  x: number;
  y: number;
  groupId?: string;
}

interface Component {
  key: string;
  participantIndexes: number[];
}

interface ExistingGroupCandidate {
  componentIndex: number;
  groupId: string;
  memberCount: number;
}

export function reconcileProximityGroups(
  input: ProximityParticipant[],
  createGroupId: () => string,
): Map<string, string> {
  const participants = [...input].sort((left, right) => left.userId.localeCompare(right.userId));
  const components = connectedComponents(participants);
  const assignedGroupIds = assignExistingGroupIds(participants, components);
  const memberships = new Map<string, string>();

  for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
    const groupId = assignedGroupIds.get(componentIndex) ?? createGroupId();
    for (const participantIndex of components[componentIndex]!.participantIndexes) {
      memberships.set(participants[participantIndex]!.userId, groupId);
    }
  }

  return memberships;
}

function connectedComponents(participants: ProximityParticipant[]): Component[] {
  const roots = participants.map((_, index) => index);

  const find = (index: number): number => {
    let root = index;
    while (roots[root] !== root) {
      root = roots[root]!;
    }
    while (roots[index] !== index) {
      const parent = roots[index]!;
      roots[index] = root;
      index = parent;
    }
    return root;
  };

  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      roots[rightRoot] = leftRoot;
    }
  };

  const gridsByZone = new Map<string, Map<string, number[]>>();
  for (let rightIndex = 0; rightIndex < participants.length; rightIndex += 1) {
    const right = participants[rightIndex]!;
    const zoneKey = `${right.floorId}\u0000${right.zoneId ?? right.floorId}`;
    let grid = gridsByZone.get(zoneKey);
    if (!grid) {
      grid = new Map();
      gridsByZone.set(zoneKey, grid);
    }
    const cellX = Math.floor(right.x / PROXIMITY_GRID_SIZE);
    const cellY = Math.floor(right.y / PROXIMITY_GRID_SIZE);
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const nearbyIndexes = grid.get(`${cellX + offsetX}:${cellY + offsetY}`);
        if (!nearbyIndexes) {
          continue;
        }
        for (const leftIndex of nearbyIndexes) {
          const left = participants[leftIndex]!;
          const sameExistingGroup = Boolean(left.groupId && left.groupId === right.groupId);
          const reach = sameExistingGroup
            ? PROXIMITY_EXIT_DISTANCE
            : participantReachRadius(left) + participantReachRadius(right);
          const deltaX = left.x - right.x;
          const deltaY = left.y - right.y;
          if (deltaX * deltaX + deltaY * deltaY <= reach * reach) {
            union(leftIndex, rightIndex);
          }
        }
      }
    }
    const cellKey = `${cellX}:${cellY}`;
    const cell = grid.get(cellKey);
    if (cell) {
      cell.push(rightIndex);
    } else {
      grid.set(cellKey, [rightIndex]);
    }
  }

  const indexesByRoot = new Map<number, number[]>();
  for (let index = 0; index < participants.length; index += 1) {
    const root = find(index);
    const indexes = indexesByRoot.get(root) ?? [];
    indexes.push(index);
    indexesByRoot.set(root, indexes);
  }

  return [...indexesByRoot.values()]
    .filter((participantIndexes) => participantIndexes.length > 1)
    .map((participantIndexes) => ({
      key: participantIndexes.map((index) => participants[index]!.userId).join(":"),
      participantIndexes,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function participantReachRadius(participant: ProximityParticipant): number {
  return participant.groupId ? PROXIMITY_GROUP_REACH_RADIUS : PROXIMITY_INTERACTION_RADIUS;
}

function assignExistingGroupIds(
  participants: ProximityParticipant[],
  components: Component[],
): Map<number, string> {
  const candidates: ExistingGroupCandidate[] = [];
  for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
    const counts = new Map<string, number>();
    for (const participantIndex of components[componentIndex]!.participantIndexes) {
      const groupId = participants[participantIndex]!.groupId;
      if (groupId) {
        counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
      }
    }
    for (const [groupId, memberCount] of counts) {
      candidates.push({ componentIndex, groupId, memberCount });
    }
  }

  candidates.sort((left, right) =>
    right.memberCount - left.memberCount
    || components[right.componentIndex]!.participantIndexes.length - components[left.componentIndex]!.participantIndexes.length
    || left.groupId.localeCompare(right.groupId)
    || components[left.componentIndex]!.key.localeCompare(components[right.componentIndex]!.key));

  const assignedGroupIds = new Map<number, string>();
  const claimedGroupIds = new Set<string>();
  for (const candidate of candidates) {
    if (assignedGroupIds.has(candidate.componentIndex) || claimedGroupIds.has(candidate.groupId)) {
      continue;
    }
    assignedGroupIds.set(candidate.componentIndex, candidate.groupId);
    claimedGroupIds.add(candidate.groupId);
  }
  return assignedGroupIds;
}
