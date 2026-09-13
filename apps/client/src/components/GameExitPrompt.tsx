export function GameExitPrompt({ multiplayer, onLeave, onCancel }: { multiplayer: boolean; onLeave: () => void; onCancel: () => void }) {
  return (
    <div className="game-exit-prompt" role="alert">
      <p>{multiplayer ? "Leave this game? You will forfeit." : "End this game?"}</p>
      <button className="secondary-button" onClick={onCancel}>Keep playing</button>
      <button className="primary-button" onClick={onLeave}>Leave game</button>
    </div>
  );
}
