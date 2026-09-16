import {
  BUILD_GRID_SIZE, BUILD_PRICES, WORKSPACE_FUND_ID, assetResaleValue, getAssetDefinition,
  getPlacedAssetBounds, getOpeningRect, getWallLength, getWallRect, isPermanentAsset, isUnitWithin, normalizeWall, roomBuildAllows,
  type ConstructionReceipt, type FloorLayout, type GameSettings, type OrganisationState,
  type ProjectQuote, type PublicAsset, type PublicFund, type Rect,
} from "@workhard/shared";

function constructionItems(layout: FloorLayout): Map<string, number> {
  const items = new Map<string, number>();
  for (const input of layout.walls) {
    const wall = normalizeWall(input);
    const horizontal = wall.start.y === wall.end.y;
    for (let offset = 0; offset < getWallLength(wall); offset += BUILD_GRID_SIZE) {
      items.set(`wall:${horizontal ? "h" : "v"}:${wall.start.x + (horizontal ? offset : 0)}:${wall.start.y + (horizontal ? 0 : offset)}`, BUILD_PRICES.wall);
    }
  }
  for (const opening of layout.openings) items.set(`opening:${opening.id}`, BUILD_PRICES[opening.type]);
  for (const object of layout.objects) {
    if (object.ownerUserId) continue;
    const definition = getAssetDefinition(object.assetId);
    if (!definition) throw new Error("ASSET_UNAVAILABLE");
    if (!definition.buildable) items.set(`asset:${object.id}`, 0);
    else {
      if (!definition.shop) throw new Error("ASSET_UNAVAILABLE");
      items.set(`asset:${object.id}`, definition.shop.price);
    }
  }
  return items;
}

export function quoteProject(previous: FloorLayout, next: FloorLayout, fundId: string, receipts: ConstructionReceipt[], inventory: PublicAsset[] = [], donatedObjects: Map<string, string> = new Map()): ProjectQuote {
  const before = constructionItems(previous);
  const after = constructionItems(next);
  const paid = new Map(receipts.filter((receipt) => receipt.floorId === previous.floorId).map((receipt) => [receipt.key, receipt]));
  const refunds = new Map<string, number>();
  const purchases: ConstructionReceipt[] = [];
  const removedKeys: string[] = [];
  const inventoryIds: string[] = [];
  let cost = 0;
  for (const [key, price] of after) {
    if (before.has(key)) continue;
    const inventoryId = donatedObjects.get(key);
    const item = inventoryId ? inventory.find((asset) => asset.id === inventoryId && asset.fundId === fundId) : undefined;
    if (inventoryId && (!item || inventoryIds.includes(inventoryId))) throw new Error("PUBLIC_ASSET_UNAVAILABLE");
    if (item) inventoryIds.push(item.id);
    else cost += price;
    purchases.push({ key, floorId: next.floorId, fundId, paid: item ? item.paid : price });
  }
  for (const key of before.keys()) {
    if (after.has(key)) continue;
    removedKeys.push(key);
    const receipt = paid.get(key);
    if (receipt) refunds.set(receipt.fundId, (refunds.get(receipt.fundId) ?? 0) + assetResaleValue(receipt.paid));
  }
  const structural = JSON.stringify(previous.walls) !== JSON.stringify(next.walls)
    || JSON.stringify(previous.openings) !== JSON.stringify(next.openings)
    || JSON.stringify(previous.objects.filter((object) => isPermanentAsset(object.assetId))) !== JSON.stringify(next.objects.filter((object) => isPermanentAsset(object.assetId)));
  const changedPublicProperty = previous.objects.some((object) => !object.ownerUserId
    && JSON.stringify(object) !== JSON.stringify(next.objects.find((candidate) => candidate.id === object.id)));
  return { cost, refund: [...refunds.values()].reduce((sum, value) => sum + value, 0),
    refunds: [...refunds].map(([id, amount]) => ({ fundId: id, amount })), structural,
    destructive: removedKeys.length > 0, requiresApproval: structural || removedKeys.length > 0 || changedPublicProperty,
    purchases, removedKeys, inventoryIds };
}

export function assertProjectScope(previous: FloorLayout, next: FloorLayout, fund: PublicFund, userId: string, settings: GameSettings, organisation: OrganisationState): boolean {
  for (const room of previous.rooms) {
    const access = room.access.mode === "default" ? settings.roomAccess : room.access;
    if (access.mode === "open") continue;
    const retained = next.rooms.find((candidate) => candidate.id === room.id);
    if (!retained || JSON.stringify(retained.footprint) !== JSON.stringify(room.footprint)
      || (room.privateEligible && !retained.privateEligible)
      || JSON.stringify(retained.access) !== JSON.stringify(room.access)) throw new Error("ROOM_PRIVACY_PROTECTED");
  }
  const affected: Rect[] = [];
  let outsideOwnArea = false;
  for (const [source, target] of [[previous, next], [next, previous]] as const) {
    for (const object of source.objects) {
      const other = target.objects.find((candidate) => candidate.id === object.id);
      if (JSON.stringify(object) === JSON.stringify(other)) continue;
      if (object.ownerUserId) throw new Error("PRIVATE_ASSET_PROTECTED");
      if (fund.unitId && (object.publicFundId ?? WORKSPACE_FUND_ID) !== fund.id) throw new Error("PUBLIC_FUND_SCOPE");
      affected.push(getPlacedAssetBounds(object));
    }
    const targetItems = constructionItems(target);
    for (const input of source.walls) {
      const wall = normalizeWall(input);
      const horizontal = wall.start.y === wall.end.y;
      for (let offset = 0; offset < getWallLength(wall); offset += BUILD_GRID_SIZE) {
        const start = { x: wall.start.x + (horizontal ? offset : 0), y: wall.start.y + (horizontal ? 0 : offset) };
        if (!targetItems.has(`wall:${horizontal ? "h" : "v"}:${start.x}:${start.y}`)) affected.push(getWallRect({
          id: wall.id, start, end: { x: start.x + (horizontal ? BUILD_GRID_SIZE : 0), y: start.y + (horizontal ? 0 : BUILD_GRID_SIZE) },
        }));
      }
    }
    for (const opening of source.openings) {
      if (JSON.stringify(opening) === JSON.stringify(target.openings.find((candidate) => candidate.id === opening.id))) continue;
      const wall = source.walls.find((candidate) => candidate.id === opening.wallId);
      const other = target.openings.find((candidate) => candidate.id === opening.id);
      const otherWall = other && target.walls.find((candidate) => candidate.id === other.wallId);
      if (wall && (!other || !otherWall || JSON.stringify(getOpeningRect(wall, opening)) !== JSON.stringify(getOpeningRect(otherWall, other)) || opening.type !== other.type)) affected.push(getOpeningRect(wall, opening));
    }
  }
  for (const bounds of affected) {
    const rooms = previous.rooms.filter((room) => room.footprint.some((rect) => intersects(rect, bounds)));
    const assignment = organisation.assignments.find((entry) => entry.userId === userId);
    if (rooms.some((room) => room.organisationUnitId && (!assignment || !isUnitWithin(organisation, assignment.unitId, room.organisationUnitId)))) outsideOwnArea = true;
    if (rooms.some((room) => !roomBuildAllows(room, userId, settings, organisation))) throw new Error("ASSET_ROOM_FORBIDDEN");
    if (fund.unitId && (!rooms.length || rooms.some((room) => !room.organisationUnitId
      || !isUnitWithin(organisation, room.organisationUnitId, fund.unitId!)))) throw new Error("PUBLIC_FUND_SCOPE");
  }
  return outsideOwnArea;
}

function intersects(left: Rect, right: Rect): boolean {
  return left.x <= right.x + right.width && left.x + left.width >= right.x
    && left.y <= right.y + right.height && left.y + left.height >= right.y;
}
