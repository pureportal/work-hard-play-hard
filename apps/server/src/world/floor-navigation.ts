import {
  getCorrespondingFloorPortals,
  getFloorPortals,
  type Floor,
  type FloorLayout,
  type Position,
} from "@workhard/shared";

export interface FloorRouteTransition {
  sourcePortalId: string;
  destinationPortalId: string;
  floorId: string;
}

export interface FloorRouteLeg {
  floorId: string;
  path: Position[];
  transition?: FloorRouteTransition;
}

interface FloorRoutePoint extends Position {
  floorId: string;
}

interface FindFloorRouteOptions {
  floors: readonly Floor[];
  layouts: readonly FloorLayout[];
  start: FloorRoutePoint;
  destination: FloorRoutePoint;
  findPath: (
    floorId: string,
    start: Position,
    destination: Position,
    target: "destination" | "transition",
  ) => Position[] | undefined;
}

interface SearchState extends FloorRoutePoint {
  key: string;
  cost: number;
}

interface Predecessor {
  key: string;
  leg: FloorRouteLeg;
}

const START_KEY = "start";
const DESTINATION_KEY = "destination";
const TRANSITION_COST = 1;

export function findFloorRoute({
  floors,
  layouts,
  start,
  destination,
  findPath,
}: FindFloorRouteOptions): FloorRouteLeg[] | undefined {
  const startFloor = floors.find((floor) => floor.id === start.floorId);
  const destinationFloor = floors.find((floor) => floor.id === destination.floorId);
  if (!startFloor || !destinationFloor || startFloor.officeId !== destinationFloor.officeId) {
    return undefined;
  }

  if (start.floorId === destination.floorId) {
    const path = findPath(start.floorId, toPosition(start), toPosition(destination), "destination");
    return path ? [{ floorId: start.floorId, path }] : undefined;
  }

  const portals = getFloorPortals(floors, layouts);
  const portalsByFloor = new Map<string, typeof portals>();
  for (const portal of portals) {
    portalsByFloor.set(portal.floorId, [...(portalsByFloor.get(portal.floorId) ?? []), portal]);
  }
  const queued: SearchState[] = [{ key: START_KEY, ...start, cost: 0 }];
  const costs = new Map<string, number>([[START_KEY, 0]]);
  const predecessors = new Map<string, Predecessor>();

  while (queued.length > 0) {
    queued.sort((left, right) => left.cost - right.cost);
    const current = queued.shift();
    if (!current || current.cost !== costs.get(current.key)) {
      continue;
    }
    if (current.key === DESTINATION_KEY) {
      return reconstructRoute(predecessors);
    }

    if (current.floorId === destination.floorId) {
      const path = findPath(current.floorId, toPosition(current), toPosition(destination), "destination");
      if (path) {
        relax(
          queued,
          costs,
          predecessors,
          current,
          { key: DESTINATION_KEY, ...destination },
          { floorId: current.floorId, path },
          pathDistance(current, path),
        );
      }
    }

    for (const sourcePortal of portalsByFloor.get(current.floorId) ?? []) {
      const path = findPath(current.floorId, toPosition(current), sourcePortal.position, "transition");
      if (!path) {
        continue;
      }
      for (const destinationPortal of getCorrespondingFloorPortals(portals, sourcePortal)) {
        relax(
          queued,
          costs,
          predecessors,
          current,
          {
            key: portalKey(destinationPortal.floorId, destinationPortal.object.id),
            floorId: destinationPortal.floorId,
            ...destinationPortal.position,
          },
          {
            floorId: current.floorId,
            path,
            transition: {
              sourcePortalId: sourcePortal.object.id,
              destinationPortalId: destinationPortal.object.id,
              floorId: destinationPortal.floorId,
            },
          },
          pathDistance(current, path) + TRANSITION_COST,
        );
      }
    }
  }

  return undefined;
}

function relax(
  queued: SearchState[],
  costs: Map<string, number>,
  predecessors: Map<string, Predecessor>,
  current: SearchState,
  next: Omit<SearchState, "cost">,
  leg: FloorRouteLeg,
  edgeCost: number,
): void {
  const cost = current.cost + edgeCost;
  if (cost >= (costs.get(next.key) ?? Number.POSITIVE_INFINITY)) {
    return;
  }
  costs.set(next.key, cost);
  predecessors.set(next.key, { key: current.key, leg });
  queued.push({ ...next, cost });
}

function reconstructRoute(predecessors: Map<string, Predecessor>): FloorRouteLeg[] | undefined {
  const route: FloorRouteLeg[] = [];
  let key = DESTINATION_KEY;
  while (key !== START_KEY) {
    const predecessor = predecessors.get(key);
    if (!predecessor) {
      return undefined;
    }
    route.unshift(predecessor.leg);
    key = predecessor.key;
  }
  return route;
}

function pathDistance(start: Position, path: readonly Position[]): number {
  let distance = 0;
  let previous = start;
  for (const point of path) {
    distance += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  return distance;
}

function portalKey(floorId: string, portalId: string): string {
  return `portal:${floorId}:${portalId}`;
}

function toPosition(point: Position): Position {
  return { x: point.x, y: point.y };
}
