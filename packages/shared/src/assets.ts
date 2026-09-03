import assetCatalogSource from "./asset-catalog.json" with { type: "json" };
import type { Position, Rect } from "./geometry.js";

export const ASSET_ROTATIONS = [0, 90, 180, 270] as const;

export type AssetRotation = typeof ASSET_ROTATIONS[number];
export type AssetLayer = "ground" | "floor" | "surface";
export type AssetPlacementTarget = "floor" | "decoration";
export type AssetCellType = "flooring" | "body" | "surface" | "support" | "seat" | "foliage" | "decoration" | "passage";
export type AssetKind = "floor-tile" | "desk" | "chair" | "sofa" | "table" | "plant" | "garden" | "pool" | "laptop" | "lamp" | "monitor" | "coffee" | "bookshelf" | "whiteboard" | "arcade" | "gong" | "game" | "portal";
export type AssetPattern = "wood" | "stone" | "grass";
export type FacingDirection = "up" | "down" | "left" | "right";

export interface RasterCell {
  x: number;
  y: number;
}

export interface RasterRange extends RasterCell {
  width: number;
  height: number;
}

export interface RasterCellSelector {
  cells?: RasterCell[];
  range?: RasterRange;
}

export interface AssetCellRegion extends RasterCellSelector {
  type: AssetCellType;
  solid: boolean;
  allows?: AssetPlacementTarget[];
}

export interface AssetInteractionDefinition extends RasterCellSelector {
  id: string;
  name: string;
  type: "seat";
  direction: FacingDirection;
}

export interface AssetDefinition {
  id: string;
  name: string;
  category: string;
  kind: AssetKind;
  themeSetId: string;
  buildable: boolean;
  radius?: number;
  shop?: {
    price: number;
    available: boolean;
  };
  placement: {
    layer: AssetLayer;
    requires: AssetPlacementTarget;
  };
  footprint: AssetCellRegion[];
  interactions?: AssetInteractionDefinition[];
}

export interface AssetVariantDefinition {
  id: string;
  name: string;
  color: string;
  secondaryColor: string;
  accentColor: string;
  pattern?: AssetPattern;
}

export interface AssetThemeSet {
  id: string;
  variants: AssetVariantDefinition[];
}

export interface AssetCategory {
  id: string;
  name: string;
  buildable: boolean;
}

export interface AssetCatalog {
  rasterSize: number;
  themeSets: AssetThemeSet[];
  categories: AssetCategory[];
  assets: AssetDefinition[];
}

export interface WorldObject {
  id: string;
  floorId: string;
  assetId: string;
  x: number;
  y: number;
  rotation: AssetRotation;
  variantId: string;
  label?: string;
  ownerUserId?: string;
  ownedAssetId?: string;
}

export interface ResolvedAssetCell extends RasterCell {
  type: AssetCellType;
  solid: boolean;
  allows: AssetPlacementTarget[];
}

export interface PlacedAssetCell extends ResolvedAssetCell {
  worldX: number;
  worldY: number;
}

export interface PlacedAssetInteraction {
  id: string;
  name: string;
  type: "seat";
  direction: FacingDirection;
  cells: PlacedAssetCell[];
  center: Position;
  bounds: Rect;
}

const validAssetKinds = new Set<AssetKind>(["floor-tile", "desk", "chair", "sofa", "table", "plant", "garden", "pool", "laptop", "lamp", "monitor", "coffee", "bookshelf", "whiteboard", "arcade", "gong", "game", "portal"]);
const validCellTypes = new Set<AssetCellType>(["flooring", "body", "surface", "support", "seat", "foliage", "decoration", "passage"]);
const validPatterns = new Set<AssetPattern>(["wood", "stone", "grass"]);
const validDirections = new Set<FacingDirection>(["up", "down", "left", "right"]);
const validLayers = new Set<AssetLayer>(["ground", "floor", "surface"]);
const validPlacementTargets = new Set<AssetPlacementTarget>(["floor", "decoration"]);

const assetCatalog = assetCatalogSource as AssetCatalog;
validateAssetCatalog(assetCatalog);

export const ASSET_CATALOG = assetCatalog;
export const ASSET_RASTER_SIZE = assetCatalog.rasterSize;

const definitionsById = new Map(assetCatalog.assets.map((asset) => [asset.id, asset]));
const themeSetsById = new Map(assetCatalog.themeSets.map((themeSet) => [themeSet.id, themeSet]));
const footprintCache = new Map<string, ResolvedAssetCell[]>();
const placedCellCache = new WeakMap<WorldObject, {
  assetId: string;
  x: number;
  y: number;
  rotation: AssetRotation;
  cells: PlacedAssetCell[];
}>();

export function getAssetDefinition(assetId: string): AssetDefinition | undefined {
  return definitionsById.get(assetId);
}

export function requireAssetDefinition(assetId: string): AssetDefinition {
  const definition = getAssetDefinition(assetId);
  if (!definition) {
    throw new Error("ASSET_NOT_FOUND");
  }
  return definition;
}

export function getAssetVariants(definition: AssetDefinition): AssetVariantDefinition[] {
  const themeSet = themeSetsById.get(definition.themeSetId);
  if (!themeSet) {
    throw new Error("ASSET_THEME_SET_NOT_FOUND");
  }
  return themeSet.variants;
}

export function getDefaultAssetVariantId(definition: AssetDefinition): string {
  return getAssetVariants(definition)[0]!.id;
}

export function requireAssetVariant(definition: AssetDefinition, variantId: string): AssetVariantDefinition {
  const variant = getAssetVariants(definition).find((candidate) => candidate.id === variantId);
  if (!variant) {
    throw new Error("ASSET_VARIANT_NOT_FOUND");
  }
  return variant;
}

export function getAssetFootprintCells(definition: AssetDefinition, rotation: AssetRotation = 0): ResolvedAssetCell[] {
  const cacheKey = `${definition.id}:${rotation}`;
  const cached = footprintCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const size = getUnrotatedAssetRasterSize(definition);
  const cells = new Map<string, ResolvedAssetCell>();
  for (const region of definition.footprint) {
    for (const cell of expandRasterSelector(region)) {
      const rotated = rotateRasterCell(cell, size.width, size.height, rotation);
      cells.set(rasterCellKey(rotated), {
        ...rotated,
        type: region.type,
        solid: region.solid,
        allows: [...(region.allows ?? [])],
      });
    }
  }
  const resolved = [...cells.values()].sort((left, right) => left.y - right.y || left.x - right.x);
  footprintCache.set(cacheKey, resolved);
  return resolved;
}

export function getPlacedAssetCells(object: WorldObject): PlacedAssetCell[] {
  const cached = placedCellCache.get(object);
  if (
    cached
    && cached.assetId === object.assetId
    && cached.x === object.x
    && cached.y === object.y
    && cached.rotation === object.rotation
  ) {
    return cached.cells;
  }
  const cells = getAssetFootprintCells(requireAssetDefinition(object.assetId), object.rotation).map((cell) => ({
    ...cell,
    worldX: object.x + cell.x * ASSET_RASTER_SIZE,
    worldY: object.y + cell.y * ASSET_RASTER_SIZE,
  }));
  placedCellCache.set(object, {
    assetId: object.assetId,
    x: object.x,
    y: object.y,
    rotation: object.rotation,
    cells,
  });
  return cells;
}

export function getAssetRasterSize(
  definition: AssetDefinition,
  rotation: AssetRotation = 0,
): { width: number; height: number } {
  const cells = getAssetFootprintCells(definition, rotation);
  return {
    width: Math.max(...cells.map((cell) => cell.x)) + 1,
    height: Math.max(...cells.map((cell) => cell.y)) + 1,
  };
}

export function getCenteredAssetPosition(
  definition: AssetDefinition,
  rotation: AssetRotation,
  point: Position,
): Position {
  const size = getAssetRasterSize(definition, rotation);
  return {
    x: snapToAssetRaster(point.x - size.width * ASSET_RASTER_SIZE / 2),
    y: snapToAssetRaster(point.y - size.height * ASSET_RASTER_SIZE / 2),
  };
}

export function getPlacedAssetCellRects(object: WorldObject, solidOnly = false): Rect[] {
  return getPlacedAssetCells(object)
    .filter((cell) => !solidOnly || cell.solid)
    .map((cell) => ({
      x: cell.worldX,
      y: cell.worldY,
      width: ASSET_RASTER_SIZE,
      height: ASSET_RASTER_SIZE,
    }));
}

export function getPlacedAssetBounds(object: WorldObject): Rect {
  return boundsForPlacedCells(getPlacedAssetCells(object));
}

export function getPlacedAssetInteractions(object: WorldObject): PlacedAssetInteraction[] {
  const definition = requireAssetDefinition(object.assetId);
  const size = getUnrotatedAssetRasterSize(definition);
  const footprintByKey = new Map(getPlacedAssetCells(object).map((cell) => [rasterCellKey(cell), cell]));
  return (definition.interactions ?? []).map((interaction) => {
    const cells = expandRasterSelector(interaction).map((cell) => {
      const rotated = rotateRasterCell(cell, size.width, size.height, object.rotation);
      const placed = footprintByKey.get(rasterCellKey(rotated));
      if (!placed) {
        throw new Error("ASSET_INTERACTION_OUTSIDE_FOOTPRINT");
      }
      return placed;
    });
    const bounds = boundsForPlacedCells(cells);
    return {
      id: interaction.id,
      name: interaction.name,
      type: interaction.type,
      direction: rotateDirection(interaction.direction, object.rotation),
      cells,
      bounds,
      center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
    };
  });
}

export function getPlacedAssetInteraction(object: WorldObject, interactionId: string): PlacedAssetInteraction | undefined {
  return getPlacedAssetInteractions(object).find((interaction) => interaction.id === interactionId);
}

export function isPointInPlacedAsset(x: number, y: number, object: WorldObject): boolean {
  return getPlacedAssetCells(object).some((cell) => (
    x >= cell.worldX
    && x <= cell.worldX + ASSET_RASTER_SIZE
    && y >= cell.worldY
    && y <= cell.worldY + ASSET_RASTER_SIZE
  ));
}

export function isPointInPlacedInteraction(x: number, y: number, interaction: PlacedAssetInteraction): boolean {
  return interaction.cells.some((cell) => (
    x >= cell.worldX
    && x <= cell.worldX + ASSET_RASTER_SIZE
    && y >= cell.worldY
    && y <= cell.worldY + ASSET_RASTER_SIZE
  ));
}

export function rotateDirection(direction: FacingDirection, rotation: AssetRotation): FacingDirection {
  const directions: FacingDirection[] = ["up", "right", "down", "left"];
  const index = directions.indexOf(direction);
  return directions[(index + rotation / 90) % directions.length]!;
}

export function snapToAssetRaster(value: number): number {
  return Math.round(value / ASSET_RASTER_SIZE) * ASSET_RASTER_SIZE;
}

export function rasterCellKey(cell: RasterCell): string {
  return `${cell.x}:${cell.y}`;
}

function getUnrotatedAssetRasterSize(definition: AssetDefinition): { width: number; height: number } {
  const cells = definition.footprint.flatMap(expandRasterSelector);
  return {
    width: Math.max(...cells.map((cell) => cell.x)) + 1,
    height: Math.max(...cells.map((cell) => cell.y)) + 1,
  };
}

function expandRasterSelector(selector: RasterCellSelector): RasterCell[] {
  if (selector.cells) {
    return selector.cells.map((cell) => ({ ...cell }));
  }
  if (!selector.range) {
    throw new Error("ASSET_CELL_SELECTOR_INVALID");
  }
  const cells: RasterCell[] = [];
  for (let y = selector.range.y; y < selector.range.y + selector.range.height; y += 1) {
    for (let x = selector.range.x; x < selector.range.x + selector.range.width; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

function rotateRasterCell(cell: RasterCell, width: number, height: number, rotation: AssetRotation): RasterCell {
  switch (rotation) {
    case 0:
      return { ...cell };
    case 90:
      return { x: height - 1 - cell.y, y: cell.x };
    case 180:
      return { x: width - 1 - cell.x, y: height - 1 - cell.y };
    case 270:
      return { x: cell.y, y: width - 1 - cell.x };
  }
}

function boundsForPlacedCells(cells: PlacedAssetCell[]): Rect {
  if (cells.length === 0) {
    throw new Error("ASSET_FOOTPRINT_EMPTY");
  }
  const minX = Math.min(...cells.map((cell) => cell.worldX));
  const minY = Math.min(...cells.map((cell) => cell.worldY));
  const maxX = Math.max(...cells.map((cell) => cell.worldX)) + ASSET_RASTER_SIZE;
  const maxY = Math.max(...cells.map((cell) => cell.worldY)) + ASSET_RASTER_SIZE;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function validateAssetCatalog(catalog: AssetCatalog): void {
  if (
    !Number.isInteger(catalog.rasterSize)
    || catalog.rasterSize <= 0
    || !Array.isArray(catalog.themeSets)
    || !Array.isArray(catalog.categories)
    || !Array.isArray(catalog.assets)
  ) {
    throw new Error("ASSET_RASTER_INVALID");
  }
  const themeSetIds = new Set<string>();
  for (const themeSet of catalog.themeSets) {
    if (!themeSet.id || themeSetIds.has(themeSet.id) || !Array.isArray(themeSet.variants) || themeSet.variants.length < 2) {
      throw new Error("ASSET_THEME_SET_INVALID");
    }
    themeSetIds.add(themeSet.id);
    const variantIds = new Set<string>();
    for (const variant of themeSet.variants) {
      if (
        !variant.id
        || !variant.name
        || variantIds.has(variant.id)
        || !isHexColor(variant.color)
        || !isHexColor(variant.secondaryColor)
        || !isHexColor(variant.accentColor)
        || (variant.pattern !== undefined && !validPatterns.has(variant.pattern))
      ) {
        throw new Error("ASSET_VARIANT_INVALID");
      }
      variantIds.add(variant.id);
    }
  }
  const categoryIds = new Set<string>();
  for (const category of catalog.categories) {
    if (!category.id || !category.name || typeof category.buildable !== "boolean" || categoryIds.has(category.id)) {
      throw new Error("ASSET_CATEGORY_INVALID");
    }
    categoryIds.add(category.id);
  }
  const assetIds = new Set<string>();
  for (const asset of catalog.assets) {
    if (
      !asset.id
      || !asset.name
      || assetIds.has(asset.id)
      || !categoryIds.has(asset.category)
      || !themeSetIds.has(asset.themeSetId)
      || typeof asset.buildable !== "boolean"
      || (asset.shop !== undefined && (
        !Number.isSafeInteger(asset.shop.price)
        || asset.shop.price <= 0
        || typeof asset.shop.available !== "boolean"
        || !asset.buildable
      ))
      || !validAssetKinds.has(asset.kind)
      || (asset.radius !== undefined && (!Number.isFinite(asset.radius) || asset.radius <= 0))
      || !validLayers.has(asset.placement.layer)
      || !validPlacementTargets.has(asset.placement.requires)
      || (asset.placement.layer !== "surface" && asset.placement.requires !== "floor")
      || (asset.placement.layer === "surface" && asset.placement.requires === "floor")
    ) {
      throw new Error("ASSET_DEFINITION_INVALID");
    }
    assetIds.add(asset.id);
    if (asset.footprint.length === 0) {
      throw new Error("ASSET_DEFINITION_INVALID");
    }
    const variants = catalog.themeSets.find((themeSet) => themeSet.id === asset.themeSetId)!.variants;
    if (asset.kind === "floor-tile" && variants.some((variant) => !variant.pattern)) {
      throw new Error("ASSET_VARIANT_INVALID");
    }
    for (const region of asset.footprint) {
      validateRasterSelector(region);
      if (
        !validCellTypes.has(region.type)
        || typeof region.solid !== "boolean"
        || region.allows?.some((target) => !validPlacementTargets.has(target))
      ) {
        throw new Error("ASSET_CELL_METADATA_INVALID");
      }
    }
    const footprintKeys = new Set(asset.footprint.flatMap(expandRasterSelector).map(rasterCellKey));
    const interactionIds = new Set<string>();
    for (const interaction of asset.interactions ?? []) {
      validateRasterSelector(interaction);
      if (
        !interaction.id
        || !interaction.name
        || interaction.type !== "seat"
        || !validDirections.has(interaction.direction)
        || interactionIds.has(interaction.id)
        || expandRasterSelector(interaction).some((cell) => !footprintKeys.has(rasterCellKey(cell)))
      ) {
        throw new Error("ASSET_INTERACTION_OUTSIDE_FOOTPRINT");
      }
      interactionIds.add(interaction.id);
    }
  }
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function validateRasterSelector(selector: RasterCellSelector): void {
  if (Boolean(selector.cells) === Boolean(selector.range)) {
    throw new Error("ASSET_CELL_SELECTOR_INVALID");
  }
  const cells = expandRasterSelector(selector);
  if (cells.length === 0 || cells.some((cell) => !Number.isInteger(cell.x) || !Number.isInteger(cell.y) || cell.x < 0 || cell.y < 0)) {
    throw new Error("ASSET_CELL_SELECTOR_INVALID");
  }
  if (selector.range && (!Number.isInteger(selector.range.width) || !Number.isInteger(selector.range.height) || selector.range.width <= 0 || selector.range.height <= 0)) {
    throw new Error("ASSET_CELL_SELECTOR_INVALID");
  }
}
