import { Bot, CircleHelp, X as CloseIcon } from "lucide-react";
import { useId, useState } from "react";
import {
  TIC_TAC_TOE_VARIANTS,
  GAME_BOT_USER_ID,
  type Member,
  type TicTacToeCommand,
  type TicTacToeGameState,
} from "@workhard/shared";
import { GameResultActions } from "./GameResultActions";
import { GameExitPrompt } from "./GameExitPrompt";
import { useModalFocus } from "../hooks/useModalFocus";
import { IconButton } from "./IconButton";
import { ClassicBoard, StackingBoard } from "./TicTacToeBoards";
import { UltimateBoard } from "./TicTacToeUltimateBoard";
import { TicTacToeMark } from "./TicTacToeMark";
import { Avatar } from "./Avatar";

interface TicTacToeGameProps {
  state: TicTacToeGameState;
  members: Member[];
  currentUserId: string;
  pending?: boolean;
  onCommand: (command: TicTacToeCommand) => void;
  onClose: () => void;
  onPlayAgain?: (() => void) | undefined;
}

const RULES: Record<TicTacToeGameState["variantId"], string[]> = {
  classic: ["Place a mark on an empty square. Three in a row wins."],
  ultimate: [
    "The square you choose sends your opponent to the matching local board.",
    "If that board is closed, they may play on any open board. Win three local boards in a row.",
  ],
  stacking: [
    "Place a reserve piece or move one of your visible pieces. Larger pieces can cover smaller pieces.",
    "Three visible marks in a row wins. If moving a piece reveals your opponent's line, you lose unless that move covers another piece in the line.",
  ],
};

export function TicTacToeGame({ state, members, currentUserId, pending = false, onCommand, onClose, onPlayAgain }: TicTacToeGameProps) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesId = useId();
  const variantName = TIC_TAC_TOE_VARIANTS.find((variant) => variant.id === state.variantId)!.name;
  const status = getStatus(state, currentUserId, members);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const closeGame = () => state.status === "playing" ? setConfirmingExit(true) : onClose();
  const dialogRef = useModalFocus<HTMLElement>(closeGame);

  return (
    <div className="modal-backdrop game-backdrop">
      <section ref={dialogRef} className="arcade-game tic-tac-toe-game" role="dialog" aria-modal="true" aria-labelledby="tic-tac-toe-title" tabIndex={-1}>
        <header className="game-header">
          <div>
            <TicTacToeMark className="game-mini-mark" />
            <div>
              <h2 id="tic-tac-toe-title">Tic-Tac-Toe</h2>
              <span>{variantName}{state.bot ? " · " + state.bot.difficulty : ""}</span>
            </div>
          </div>
          <div className="tic-tac-toe-header-actions">
            <button type="button" aria-expanded={rulesOpen} aria-controls={rulesId} onClick={() => setRulesOpen((open) => !open)}>
              <CircleHelp size={16} />Rules
            </button>
            <IconButton label={state.status === "playing" ? "Forfeit game" : "Close game"} icon={CloseIcon} onClick={closeGame} />
          </div>
        </header>

        {confirmingExit && state.status === "playing" && <GameExitPrompt multiplayer={!state.bot} onLeave={onClose} onCancel={() => setConfirmingExit(false)} />}
        <div className="tic-tac-toe-content">
          <div className="tic-tac-toe-players" aria-label="Players">
            {state.players.map((player) => {
              const member = members.find((candidate) => candidate.id === player.userId);
              return (
                <div
                  key={player.userId}
                  className={state.status === "playing" && state.turnUserId === player.userId ? "is-active" : ""}
                  aria-current={state.status === "playing" && state.turnUserId === player.userId ? "true" : undefined}
                >
                  {player.userId === GAME_BOT_USER_ID ? <span className="game-bot-avatar" aria-hidden="true"><Bot size={20} /></span>
                    : <Avatar member={member} className="tic-tac-toe-player-avatar" />}
                  <strong>{player.userId === currentUserId ? "You" : player.userId === GAME_BOT_USER_ID ? "Bot" : member?.name ?? "Player"}</strong>
                  <span className={`tic-tac-toe-player-mark is-${player.mark}`} aria-hidden="true" />
                </div>
              );
            })}
          </div>

          <div className={`tic-tac-toe-status is-${state.status}`} role="status">{status}</div>

          {rulesOpen && (
            <section id={rulesId} className="tic-tac-toe-rules" aria-label={`${variantName} rules`}>
              {RULES[state.variantId].map((rule) => <p key={rule}>{rule}</p>)}
            </section>
          )}

          <div className="tic-tac-toe-playfield" aria-busy={pending} inert={pending || (confirmingExit && state.status === "playing")}>
            {state.variantId === "classic" && (
              <ClassicBoard state={state} currentUserId={currentUserId} onCommand={onCommand} />
            )}
            {state.variantId === "ultimate" && (
              <UltimateBoard state={state} currentUserId={currentUserId} onCommand={onCommand} />
            )}
            {state.variantId === "stacking" && (
              <StackingBoard state={state} currentUserId={currentUserId} onCommand={onCommand} />
            )}
          </div>
        </div>
        {state.status !== "playing" && <GameResultActions onClose={onClose} onPlayAgain={onPlayAgain} />}
      </section>
    </div>
  );
}

function getStatus(state: TicTacToeGameState, currentUserId: string, members: Member[]): string {
  if (state.status === "draw") {
    return "Draw";
  }
  if (state.winnerUserId) {
    if (state.winnerUserId === currentUserId) {
      return "You win";
    }
    return state.winnerUserId === GAME_BOT_USER_ID ? "Bot wins" : `${members.find((member) => member.id === state.winnerUserId)?.name ?? "Opponent"} wins`;
  }
  if (state.turnUserId === currentUserId) {
    return "Your turn";
  }
  if (state.turnUserId === GAME_BOT_USER_ID) return "Bot is thinking…";
  return `${members.find((member) => member.id === state.turnUserId)?.name ?? "Opponent"}'s turn`;
}
