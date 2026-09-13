interface TicTacToeMarkProps {
  className?: string;
}

export function TicTacToeMark({ className = "" }: TicTacToeMarkProps) {
  return (
    <span className={`tic-tac-toe-mark ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: 9 }, (_, cell) => (
        <span key={cell} className={cell === 0 || cell === 4 || cell === 8 ? "is-x" : cell === 2 || cell === 6 ? "is-o" : ""} />
      ))}
    </span>
  );
}
