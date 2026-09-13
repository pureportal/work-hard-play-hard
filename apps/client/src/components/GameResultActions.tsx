import { RotateCw } from "lucide-react";

export function GameResultActions({ onClose, onPlayAgain }: { onClose: () => void; onPlayAgain?: (() => void) | undefined }) {
  return (
    <footer className="game-result-actions">
      {onPlayAgain && <button className="primary-button" onClick={onPlayAgain}><RotateCw size={16} />Play again</button>}
      <button className="secondary-button" onClick={onClose}>Back to lobby</button>
    </footer>
  );
}
