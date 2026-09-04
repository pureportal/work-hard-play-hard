import type { AssetRotation, AssetVariantDefinition, Rect } from "@workhard/shared";

export function FloorSurfaceShape({ bounds, variant, rotation }: {
  bounds: Rect;
  variant: AssetVariantDefinition;
  rotation: AssetRotation;
}) {
  return (
    <g className="asset-shape-floor-surface">
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        rx={3}
        fill={variant.color}
        stroke={variant.accentColor}
        strokeOpacity={0.72}
        strokeWidth={1}
      />
      <FloorSurfacePattern bounds={bounds} variant={variant} rotation={rotation} />
    </g>
  );
}

export function GongShape({ bounds, variant }: { bounds: Rect; variant: AssetVariantDefinition }) {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return (
    <g className="asset-shape-gong-artwork" transform={`translate(${centerX} ${centerY})`}>
      <rect x={-31} y={34} width={68} height={7} rx={3} fill="#24212d" fillOpacity={0.16} />
      <g className="asset-shape-gong-stand">
        <rect x={-32} y={-35} width={64} height={7} rx={3} fill={variant.accentColor} />
        <rect x={-31} y={-31} width={7} height={64} rx={3} fill={variant.accentColor} />
        <rect x={24} y={-31} width={7} height={64} rx={3} fill={variant.accentColor} />
        <rect x={-38} y={29} width={22} height={7} rx={3} fill={variant.color} />
        <rect x={16} y={29} width={22} height={7} rx={3} fill={variant.color} />
        <circle cx={0} cy={-29} r={3} fill={variant.secondaryColor} />
      </g>
      <g className="asset-shape-gong-disc">
        <circle cx={0} cy={0} r={24} fill={variant.color} stroke={variant.secondaryColor} strokeOpacity={0.95} strokeWidth={3} />
        <circle cx={0} cy={0} r={7} fill={variant.accentColor} stroke={variant.secondaryColor} strokeWidth={2} />
        <path d="M -12 -12 L 6 -18" stroke="#ffffff" strokeOpacity={0.42} strokeWidth={3} />
      </g>
      <g className="asset-shape-gong-mallet" transform="translate(34 -5) rotate(21.772396)">
        <rect x={-2} y={-15} width={4} height={29} rx={2} fill={variant.accentColor} />
        <circle cx={0} cy={-16} r={7} fill={variant.secondaryColor} stroke="#ffffff" strokeOpacity={0.32} strokeWidth={1} />
      </g>
    </g>
  );
}

function FloorSurfacePattern({ bounds, variant, rotation }: {
  bounds: Rect;
  variant: AssetVariantDefinition;
  rotation: AssetRotation;
}) {
  if (variant.pattern === "wood") {
    const lines = [];
    const horizontal = rotation === 0 || rotation === 180;
    if (horizontal) {
      for (let y = bounds.y + 16; y < bounds.y + bounds.height; y += 16) {
        lines.push(<path key={`row-${y}`} d={`M ${bounds.x + 2} ${y} H ${bounds.x + bounds.width - 2}`} />);
      }
      for (let row = 0, y = bounds.y; y < bounds.y + bounds.height; y += 16, row += 1) {
        const x = bounds.x + (row % 2 === 0 ? bounds.width * 0.36 : bounds.width * 0.68);
        lines.push(<path key={`seam-${y}`} d={`M ${x} ${y + 2} V ${Math.min(y + 14, bounds.y + bounds.height - 2)}`} />);
      }
    } else {
      for (let x = bounds.x + 16; x < bounds.x + bounds.width; x += 16) {
        lines.push(<path key={`column-${x}`} d={`M ${x} ${bounds.y + 2} V ${bounds.y + bounds.height - 2}`} />);
      }
      for (let column = 0, x = bounds.x; x < bounds.x + bounds.width; x += 16, column += 1) {
        const y = bounds.y + (column % 2 === 0 ? bounds.height * 0.36 : bounds.height * 0.68);
        lines.push(<path key={`seam-${x}`} d={`M ${x + 2} ${y} H ${Math.min(x + 14, bounds.x + bounds.width - 2)}`} />);
      }
    }
    return <g className="asset-shape-floor-pattern" fill="none" stroke={variant.accentColor} strokeOpacity={0.58} strokeWidth={1.25}>{lines}</g>;
  }

  if (variant.pattern === "stone") {
    const lines = [];
    for (let row = 0, y = bounds.y + 24; y < bounds.y + bounds.height; y += 24, row += 1) {
      const x = bounds.x + (row % 2 === 0 ? bounds.width * 0.38 : bounds.width * 0.64);
      lines.push(<path key={`row-${y}`} d={`M ${bounds.x + 2} ${y} H ${bounds.x + bounds.width - 2} M ${x} ${y - 22} V ${y - 2}`} />);
    }
    return (
      <g className="asset-shape-floor-pattern">
        <g fill="none" stroke={variant.accentColor} strokeOpacity={0.62} strokeWidth={1.5}>{lines}</g>
        <circle cx={bounds.x + bounds.width * 0.22} cy={bounds.y + bounds.height * 0.24} r={2.5} fill={variant.secondaryColor} fillOpacity={0.55} />
        <circle cx={bounds.x + bounds.width * 0.73} cy={bounds.y + bounds.height * 0.67} r={3} fill={variant.secondaryColor} fillOpacity={0.5} />
      </g>
    );
  }

  if (variant.pattern === "grass") {
    const blades = [];
    for (let y = bounds.y + 10, row = 0; y < bounds.y + bounds.height - 4; y += 14, row += 1) {
      for (let x = bounds.x + 9 + row % 2 * 6; x < bounds.x + bounds.width - 5; x += 18) {
        blades.push(<path key={`${x}:${y}`} d={`M ${x} ${y + 4} L ${x - 3} ${y - 3} M ${x} ${y + 4} L ${x + 3} ${y - 4}`} />);
      }
    }
    return <g className="asset-shape-floor-pattern" fill="none" stroke={variant.accentColor} strokeOpacity={0.68} strokeWidth={1.5}>{blades}</g>;
  }

  return null;
}
