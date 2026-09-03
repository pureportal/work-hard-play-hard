interface TetrisMarkProps {
  className?: string;
}

export function TetrisMark({ className = "" }: TetrisMarkProps) {
  return (
    <span className={`tetris-mark ${className}`.trim()} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
