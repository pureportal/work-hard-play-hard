import {
  getAssetFootprintCells,
  getDefaultAssetVariantId,
  requireAssetVariant,
  type AssetDefinition,
  type AssetRotation,
} from "@workhard/shared";

export function AssetShape({ asset, rotation = 0, variantId = getDefaultAssetVariantId(asset) }: {
  asset: AssetDefinition;
  rotation?: AssetRotation;
  variantId?: string;
}) {
  const cells = getAssetFootprintCells(asset, rotation);
  const variant = requireAssetVariant(asset, variantId);
  const width = Math.max(...cells.map((cell) => cell.x)) + 1;
  const height = Math.max(...cells.map((cell) => cell.y)) + 1;
  const cellSize = 8;
  return (
    <svg
      className="asset-shape"
      aria-hidden="true"
      focusable="false"
      viewBox={`-2 -2 ${width * cellSize + 4} ${height * cellSize + 4}`}
    >
      <g className="asset-shape-shadow" transform="translate(1.5 1.5)">
        {cells.map((cell) => (
          <rect key={`${cell.x}:${cell.y}`} x={cell.x * cellSize} y={cell.y * cellSize} width={cellSize} height={cellSize} rx={cell.type === "foliage" ? 3.5 : 1.8} />
        ))}
      </g>
      <g>
        {cells.map((cell) => (
          <g key={`${cell.x}:${cell.y}`} opacity={cell.type === "support" ? 0.76 : 1}>
            <rect
              x={cell.x * cellSize}
              y={cell.y * cellSize}
              width={cellSize}
              height={cellSize}
              rx={cell.type === "foliage" ? 3.5 : 1.8}
              fill={variant.color}
              stroke={variant.accentColor}
              strokeWidth={0.65}
            />
            <path
              className="asset-shape-highlight"
              d={`M ${cell.x * cellSize + 2} ${cell.y * cellSize + 2} H ${cell.x * cellSize + cellSize - 2}`}
            />
          </g>
        ))}
      </g>
      {asset.kind === "floor-tile" && variant.pattern === "wood" && (
        <path className="asset-shape-detail" d={`M 0 ${height * 4} H ${width * 8} M ${width * 4} 0 V ${height * 4} M ${width * 2} ${height * 4} V ${height * 8}`} />
      )}
      {asset.kind === "floor-tile" && variant.pattern === "stone" && (
        <path className="asset-shape-detail" d={`M 0 ${height * 4} H ${width * 8} M ${width * 3} 0 V ${height * 4} M ${width * 5} ${height * 4} V ${height * 8}`} />
      )}
      {asset.kind === "floor-tile" && variant.pattern === "grass" && (
        <path className="asset-shape-detail" d={`M 5 ${height * 8 - 4} l 2 -5 l 2 5 M ${width * 8 - 10} 9 l 2 -5 l 2 5 M ${width * 4} ${height * 4 + 4} l 2 -5 l 2 5`} />
      )}
    </svg>
  );
}
