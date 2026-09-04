import { ASSET_RASTER_SIZE } from "@workhard/shared";
import type {
  AssetDefinition,
  AssetVariantDefinition,
  PlacedAssetCell,
  PlacedAssetInteraction,
  Rect,
} from "@workhard/shared";

interface AssetShapeDetailsProps {
  asset: AssetDefinition;
  variant: AssetVariantDefinition;
  cells: PlacedAssetCell[];
  bounds: Rect;
  interactions: PlacedAssetInteraction[];
}

export function AssetShapeDetails({ asset, variant, cells, bounds, interactions }: AssetShapeDetailsProps) {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  if (asset.id === "table-round") {
    return (
      <g className="asset-shape-round-table-detail">
        <ellipse
          cx={centerX}
          cy={centerY}
          rx={Math.max(8, bounds.width / 2 - 5)}
          ry={Math.max(8, bounds.height / 2 - 5)}
          fill="#ffffff"
          fillOpacity={0.08}
          stroke="#ffffff"
          strokeOpacity={0.24}
          strokeWidth={2}
        />
        <circle cx={centerX} cy={centerY} r={5} fill={variant.accentColor} fillOpacity={0.55} />
      </g>
    );
  }

  if (asset.kind === "desk" || asset.kind === "table") {
    return (
      <g className="asset-shape-surface-details">
        {cells.filter((cell) => cell.allows.includes("decoration")).map((cell) => (
          <rect
            key={`${cell.x}:${cell.y}`}
            x={cell.worldX + 3}
            y={cell.worldY + 3}
            width={ASSET_RASTER_SIZE - 6}
            height={3}
            rx={1.5}
            fill={variant.secondaryColor}
            fillOpacity={0.36}
          />
        ))}
      </g>
    );
  }

  if (asset.kind === "chair" || asset.kind === "sofa") {
    return <SeatDetails interactions={interactions} variant={variant} />;
  }

  if (asset.kind === "plant") {
    const potWidth = Math.min(20, Math.max(10, bounds.width - 8));
    return (
      <g className="asset-shape-plant-details">
        {cells.map((cell, index) => {
          const offset = index % 2 === 0 ? 0 : 1;
          return (
            <g key={`${cell.x}:${cell.y}`}>
              <ellipse
                cx={cell.worldX + 6 + offset}
                cy={cell.worldY + 6}
                rx={6}
                ry={4}
                fill={variant.secondaryColor}
                fillOpacity={0.95}
              />
              <ellipse
                cx={cell.worldX + 10}
                cy={cell.worldY + 10 - offset}
                rx={4}
                ry={6}
                fill={variant.color}
                fillOpacity={0.98}
              />
              <circle cx={cell.worldX + 8} cy={cell.worldY + 8} r={2} fill={variant.accentColor} fillOpacity={0.8} />
            </g>
          );
        })}
        <rect
          x={centerX - potWidth / 2}
          y={bounds.y + bounds.height - 8}
          width={potWidth}
          height={8}
          rx={3}
          fill={`color-mix(in srgb, ${variant.accentColor} 55%, #8b5f45 45%)`}
          fillOpacity={0.94}
        />
      </g>
    );
  }

  if (asset.kind === "garden") {
    const flowerColors = ["#f4b942", "#ef8372", "#d9b6ed"];
    return (
      <g className="asset-shape-garden-details">
        {cells.map((cell, index) => (
          <g key={`${cell.x}:${cell.y}`}>
            <ellipse cx={cell.worldX + 5} cy={cell.worldY + 7} rx={4} ry={3} fill="#7fb77d" />
            <ellipse cx={cell.worldX + 11} cy={cell.worldY + 10} rx={3} ry={4} fill="#5f9d70" />
            <circle cx={cell.worldX + 9} cy={cell.worldY + 5} r={2.3} fill={flowerColors[index % flowerColors.length]} />
          </g>
        ))}
      </g>
    );
  }

  if (asset.kind === "pool") {
    const waves = [];
    for (let y = bounds.y + 28; y < bounds.y + bounds.height - 14; y += 28) {
      waves.push(
        <path
          key={y}
          d={`M ${bounds.x + 20} ${y} C ${bounds.x + bounds.width * 0.34} ${y - 8}, ${bounds.x + bounds.width * 0.4} ${y + 8}, ${bounds.x + bounds.width * 0.54} ${y} C ${bounds.x + bounds.width * 0.68} ${y - 8}, ${bounds.x + bounds.width * 0.75} ${y + 8}, ${bounds.x + bounds.width - 20} ${y}`}
        />,
      );
    }
    return (
      <g className="asset-shape-pool-details">
        <rect
          x={bounds.x + 6}
          y={bounds.y + 6}
          width={bounds.width - 12}
          height={bounds.height - 12}
          rx={13}
          fill={variant.secondaryColor}
          stroke={variant.accentColor}
          strokeOpacity={0.75}
          strokeWidth={3}
        />
        <g fill="none" stroke="#f4fbff" strokeOpacity={0.66} strokeWidth={3}>{waves}</g>
      </g>
    );
  }

  if (asset.kind === "arcade") {
    const vertical = bounds.height >= bounds.width;
    const screen = vertical
      ? { x: bounds.x + 9, y: bounds.y + 11, width: bounds.width - 18, height: Math.min(34, bounds.height * 0.38) }
      : { x: bounds.x + 11, y: bounds.y + 9, width: Math.min(34, bounds.width * 0.38), height: bounds.height - 18 };
    return (
      <g className="asset-shape-arcade-details">
        <rect
          x={screen.x}
          y={screen.y}
          width={screen.width}
          height={screen.height}
          rx={5}
          fill={variant.secondaryColor}
          stroke={variant.accentColor}
          strokeOpacity={0.72}
          strokeWidth={2}
        />
        {vertical ? (
          <>
            <circle cx={bounds.x + 18} cy={bounds.y + bounds.height * 0.62} r={4} fill="#ff7a66" />
            <circle cx={bounds.x + bounds.width - 18} cy={bounds.y + bounds.height * 0.62} r={4} fill="#f4b942" />
          </>
        ) : (
          <>
            <circle cx={bounds.x + bounds.width * 0.62} cy={bounds.y + 18} r={4} fill="#ff7a66" />
            <circle cx={bounds.x + bounds.width * 0.62} cy={bounds.y + bounds.height - 18} r={4} fill="#f4b942" />
          </>
        )}
      </g>
    );
  }

  if (asset.kind === "portal") {
    return (
      <g className="asset-shape-portal-details" fill="none">
        <rect
          x={bounds.x + 7}
          y={bounds.y + 7}
          width={bounds.width - 14}
          height={bounds.height - 14}
          rx={10}
          stroke={variant.secondaryColor}
          strokeOpacity={0.95}
          strokeWidth={3}
        />
        <rect
          x={bounds.x + 14}
          y={bounds.y + 14}
          width={bounds.width - 28}
          height={bounds.height - 28}
          rx={7}
          stroke={variant.accentColor}
          strokeOpacity={0.9}
          strokeWidth={2}
        />
      </g>
    );
  }

  if (asset.kind === "laptop") {
    return (
      <g className="asset-shape-laptop-details">
        <rect
          x={bounds.x + 3}
          y={bounds.y + 2}
          width={bounds.width - 6}
          height={bounds.height - 5}
          rx={2}
          fill={variant.accentColor}
          stroke={variant.secondaryColor}
          strokeOpacity={0.88}
          strokeWidth={2}
        />
        <path
          d={`M ${bounds.x + 2} ${bounds.y + bounds.height - 2} H ${bounds.x + bounds.width - 2}`}
          fill="none"
          stroke="#d4d9df"
          strokeOpacity={0.8}
          strokeWidth={2}
        />
      </g>
    );
  }

  if (asset.kind === "monitor") {
    const horizontal = bounds.width >= bounds.height;
    const screen = horizontal
      ? { x: bounds.x + 3, y: bounds.y + 2, width: bounds.width - 6, height: bounds.height - 5 }
      : { x: bounds.x + 2, y: bounds.y + 3, width: bounds.width - 5, height: bounds.height - 6 };
    return (
      <g className="asset-shape-monitor-details">
        <rect
          x={screen.x}
          y={screen.y}
          width={screen.width}
          height={screen.height}
          rx={2}
          fill={variant.accentColor}
          stroke={variant.secondaryColor}
          strokeOpacity={0.82}
          strokeWidth={2}
        />
        <circle cx={centerX} cy={centerY} r={2} fill="#d7f5fb" fillOpacity={0.9} />
      </g>
    );
  }

  if (asset.kind === "coffee") {
    return (
      <g className="asset-shape-coffee-details">
        <circle
          cx={centerX}
          cy={centerY}
          r={5.5}
          fill={variant.secondaryColor}
          stroke={variant.accentColor}
          strokeOpacity={0.85}
          strokeWidth={1.5}
        />
        <circle
          cx={centerX + 6}
          cy={centerY}
          r={3.5}
          fill="none"
          stroke={variant.secondaryColor}
          strokeOpacity={0.95}
          strokeWidth={2}
        />
        <circle cx={centerX} cy={centerY} r={2.7} fill={variant.accentColor} />
      </g>
    );
  }

  if (asset.kind === "lamp") {
    return (
      <g className="asset-shape-lamp-details">
        <circle cx={centerX} cy={centerY} r={10} fill={variant.secondaryColor} fillOpacity={0.24} />
        <circle
          cx={centerX}
          cy={centerY}
          r={6}
          fill={variant.secondaryColor}
          stroke="#ffffff"
          strokeOpacity={0.72}
          strokeWidth={2}
        />
      </g>
    );
  }

  if (asset.kind === "bookshelf") {
    return <BookshelfDetails bounds={bounds} variant={variant} />;
  }

  if (asset.kind === "whiteboard") {
    return <WhiteboardDetails bounds={bounds} variant={variant} />;
  }

  if (asset.kind === "game") {
    const blockColors = ["#5b8def", "#f4b942", "#ff7a66", "#25b99a"];
    const blocks = [[1, 0], [0, 1], [1, 1], [2, 1]];
    return (
      <g className="asset-shape-game-details">
        <rect
          x={bounds.x + 7}
          y={bounds.y + 7}
          width={bounds.width - 14}
          height={bounds.height - 14}
          rx={10}
          fill="none"
          stroke={variant.secondaryColor}
          strokeOpacity={0.64}
          strokeWidth={2}
        />
        {blocks.map(([column = 0, row = 0], index) => (
          <rect
            key={`${column}:${row}`}
            className="asset-shape-game-block"
            x={centerX - 29 + column * 20}
            y={centerY - 22 + row * 20}
            width={18}
            height={18}
            rx={4}
            fill={blockColors[index]}
            stroke="#ffffff"
            strokeOpacity={0.36}
            strokeWidth={1}
          />
        ))}
      </g>
    );
  }

  return null;
}

function SeatDetails({ interactions, variant }: {
  interactions: PlacedAssetInteraction[];
  variant: AssetVariantDefinition;
}) {
  return (
    <g className="asset-shape-seat-details">
      {interactions.map((interaction) => {
        const { x, y, width, height } = interaction.bounds;
        const edgePath = interaction.direction === "up" || interaction.direction === "down"
          ? `M ${x + 6} ${interaction.direction === "down" ? y + 6 : y + height - 6} H ${x + width - 6}`
          : `M ${interaction.direction === "left" ? x + width - 6 : x + 6} ${y + 6} V ${y + height - 6}`;
        return (
          <g key={interaction.id}>
            <rect
              x={x + 4}
              y={y + 4}
              width={width - 8}
              height={height - 8}
              rx={7}
              fill={variant.secondaryColor}
              fillOpacity={0.32}
              stroke={variant.accentColor}
              strokeOpacity={0.42}
              strokeWidth={1}
            />
            <path d={edgePath} fill="none" stroke={variant.accentColor} strokeOpacity={0.48} strokeWidth={3} />
          </g>
        );
      })}
    </g>
  );
}

function BookshelfDetails({ bounds, variant }: { bounds: Rect; variant: AssetVariantDefinition }) {
  const horizontal = bounds.width >= bounds.height;
  const bookColors = ["#d96f67", "#e2b458", "#6b91c8", "#71a47d", "#a77bc0"];
  const books = [];
  if (horizontal) {
    for (let x = bounds.x + 8, index = 0; x < bounds.x + bounds.width - 7; x += 11, index += 1) {
      books.push(
        <rect
          key={x}
          className="asset-shape-book"
          x={x}
          y={bounds.y + 6 + index % 2}
          width={7}
          height={bounds.height - 12 - index % 2}
          rx={1}
          fill={bookColors[index % bookColors.length]}
        />,
      );
    }
  } else {
    for (let y = bounds.y + 8, index = 0; y < bounds.y + bounds.height - 7; y += 11, index += 1) {
      books.push(
        <rect
          key={y}
          className="asset-shape-book"
          x={bounds.x + 6 + index % 2}
          y={y}
          width={bounds.width - 12 - index % 2}
          height={7}
          rx={1}
          fill={bookColors[index % bookColors.length]}
        />,
      );
    }
  }
  return (
    <g className="asset-shape-bookshelf-details">
      <rect
        x={bounds.x + 3}
        y={bounds.y + 3}
        width={bounds.width - 6}
        height={bounds.height - 6}
        rx={3}
        fill={variant.accentColor}
        fillOpacity={0.62}
        stroke={variant.secondaryColor}
        strokeOpacity={0.62}
        strokeWidth={2}
      />
      {books}
    </g>
  );
}

function WhiteboardDetails({ bounds, variant }: { bounds: Rect; variant: AssetVariantDefinition }) {
  const horizontal = bounds.width >= bounds.height;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return (
    <g className="asset-shape-whiteboard-details">
      <rect
        x={bounds.x + 3}
        y={bounds.y + 3}
        width={bounds.width - 6}
        height={bounds.height - 6}
        rx={3}
        fill={variant.secondaryColor}
        stroke={variant.accentColor}
        strokeWidth={2}
      />
      {horizontal ? (
        <>
          <path d={`M ${bounds.x + 13} ${centerY - 2} H ${bounds.x + bounds.width * 0.52}`} stroke="#8294c7" strokeOpacity={0.72} strokeWidth={2} />
          <path d={`M ${bounds.x + bounds.width * 0.6} ${centerY + 2} H ${bounds.x + bounds.width - 14}`} stroke="#e68a76" strokeOpacity={0.72} strokeWidth={2} />
        </>
      ) : (
        <>
          <path d={`M ${centerX - 2} ${bounds.y + 13} V ${bounds.y + bounds.height * 0.52}`} stroke="#8294c7" strokeOpacity={0.72} strokeWidth={2} />
          <path d={`M ${centerX + 2} ${bounds.y + bounds.height * 0.6} V ${bounds.y + bounds.height - 14}`} stroke="#e68a76" strokeOpacity={0.72} strokeWidth={2} />
        </>
      )}
    </g>
  );
}
