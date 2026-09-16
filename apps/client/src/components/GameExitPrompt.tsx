import { ConfirmationDialog } from "./ConfirmationDialog";

export function GameExitPrompt({ multiplayer, onLeave, onCancel }: { multiplayer: boolean; onLeave: () => void; onCancel: () => void }) {
  return <ConfirmationDialog
    title={multiplayer ? "Leave this game?" : "End this game?"}
    description={multiplayer ? "You will forfeit." : undefined}
    confirmLabel="Leave game"
    cancelLabel="Keep playing"
    onConfirm={onLeave}
    onCancel={onCancel}
  />;
}
