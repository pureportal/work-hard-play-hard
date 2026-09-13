interface FallingBlocksMarkProps {
  className?: string;
}

export function FallingBlocksMark({ className = "" }: FallingBlocksMarkProps) {
  return (
    <span className={`falling-blocks-mark ${className}`.trim()} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
