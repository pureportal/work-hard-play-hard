import type { SVGProps } from "react";

interface NorthstarMarkProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

export function NorthstarMark({ size = 24, ...props }: NorthstarMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M104 40H212A28 28 0 0 1 240 68V90A150 150 0 0 1 90 240H68A28 28 0 0 1 40 212V104A64 64 0 0 1 104 40ZM408 40H300A28 28 0 0 0 272 68V90A150 150 0 0 0 422 240H444A28 28 0 0 0 472 212V104A64 64 0 0 0 408 40ZM104 472H212A28 28 0 0 0 240 444V422A150 150 0 0 0 90 272H68A28 28 0 0 0 40 300V408A64 64 0 0 0 104 472ZM408 472H300A28 28 0 0 1 272 444V422A150 150 0 0 1 422 272H444A28 28 0 0 1 472 300V408A64 64 0 0 1 408 472ZM256 154Q267 245 358 256Q267 267 256 358Q245 267 154 256Q245 245 256 154Z" />
    </svg>
  );
}
