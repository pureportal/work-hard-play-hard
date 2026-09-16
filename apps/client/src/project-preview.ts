import { getOpeningRect, getPlacedAssetBounds, getWallSolidRects, subtractRect, type FloorLayout, type Rect } from "@workhard/shared";

export interface ProjectMark { bounds: Rect; change: "added" | "removed" }

export function projectPreviewMarks(saved: FloorLayout, draft: FloorLayout): ProjectMark[] {
  const marks: ProjectMark[] = [];
  for (const [source, target, change] of [[draft, saved, "added"], [saved, draft, "removed"]] as const) {
    const targetWalls = target.walls.flatMap((wall) => getWallSolidRects(wall, target.openings));
    for (const wall of source.walls) {
      let pieces = getWallSolidRects(wall, source.openings);
      for (const obstacle of targetWalls) pieces = pieces.flatMap((rect) => subtractRect(rect, obstacle));
      marks.push(...pieces.map((bounds) => ({ bounds, change })));
    }
    for (const opening of source.openings) {
      const wall = source.walls.find((candidate) => candidate.id === opening.wallId)!;
      const bounds = getOpeningRect(wall, opening);
      if (!target.openings.some((candidate) => {
        const targetWall = target.walls.find((entry) => entry.id === candidate.wallId)!;
        return candidate.type === opening.type && JSON.stringify(getOpeningRect(targetWall, candidate)) === JSON.stringify(bounds);
      })) marks.push({ bounds, change });
    }
    for (const object of source.objects) {
      if (JSON.stringify(object) !== JSON.stringify(target.objects.find((candidate) => candidate.id === object.id))) marks.push({ bounds: getPlacedAssetBounds(object), change });
    }
  }
  return marks;
}
