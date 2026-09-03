import type { SVGProps } from "react";

interface NorthstarMarkProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

export function NorthstarMark({ size = 24, ...props }: NorthstarMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M16 2.5 19.15 12.85 29.5 16l-10.35 3.15L16 29.5l-3.15-10.35L2.5 16l10.35-3.15L16 2.5Z"
        fill="currentColor"
      />
      <path
        d="m16 10.1 1.38 4.52L21.9 16l-4.52 1.38L16 21.9l-1.38-4.52L10.1 16l4.52-1.38L16 10.1Z"
        fill="var(--mark-center, #6757e8)"
      />
    </svg>
  );
}
