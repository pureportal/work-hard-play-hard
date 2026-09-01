import { ArrowDown, ArrowLeft, ArrowRight, Pause, Play, RotateCw, X, Zap } from "lucide-react";
import { useEffect } from "react";
import type { GameState } from "@workhard/shared";
import { useModalFocus } from "../hooks/useModalFocus";
import { IconButton } from "./IconButton";

interface StackGameProps {
  state?: GameState | undefined;
  onCommand: (command: "left" | "right" | "rotate" | "down" | "drop" | "pause") => void;
  onClose: () => void;
}

const blockColors = ["transparent", "#5b8def", "#f4b942", "#b26fe8", "#ff7a66", "#25b99a", "#e36d9e", "#6c5ce7"];

export function StackGame({ state, onCommand, onClose }: StackGameProps) {
  const dialogRef = useModalFocus<HTMLElement>(onClose);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const commands: Partial<Record<string, Parameters<typeof onCommand>[0]>> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "rotate",
        ArrowDown: "down",
        " ": "drop",
        p: "pause",
        P: "pause",
      };
      const command = commands[event.key];
      if (command) {
        event.preventDefault();
        event.stopPropagation();
        onCommand(command);
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [onCommand]);

  return (
    <div className="modal-backdrop game-backdrop">
      <section ref={dialogRef} className="stack-game" role="dialog" aria-modal="true" aria-labelledby="stack-title" tabIndex={-1}>
        <header>
          <div><span className="game-mini-mark"><Zap size={16} fill="currentColor" /></span><h2 id="stack-title">Stack</h2></div>
          <IconButton label="Close game" icon={X} onClick={onClose} />
        </header>
        <div className="stack-content">
          <div className="stack-board" aria-label="Falling blocks board">
            {(state?.grid ?? Array.from({ length: 20 }, () => Array<number>(10).fill(0))).flatMap((row, rowIndex) =>
              row.map((cell, columnIndex) => (
                <span
                  key={`${rowIndex}-${columnIndex}`}
                  className={cell ? "filled" : ""}
                  style={{ background: blockColors[cell] }}
                />
              )),
            )}
            {state?.paused && <div className="board-state"><Pause size={20} />Paused</div>}
          </div>
          <aside className="stack-sidebar">
            <dl>
              <div><dt>Score</dt><dd>{(state?.score ?? 0).toLocaleString()}</dd></div>
              <div><dt>Lines</dt><dd>{state?.lines ?? 0}</dd></div>
              <div><dt>Level</dt><dd>{state?.level ?? 1}</dd></div>
            </dl>
            <div className="stack-controls" aria-label="Game controls">
              <button aria-label="Move left" onClick={() => onCommand("left")}><ArrowLeft size={19} /></button>
              <button aria-label="Rotate" onClick={() => onCommand("rotate")}><RotateCw size={19} /></button>
              <button aria-label="Move right" onClick={() => onCommand("right")}><ArrowRight size={19} /></button>
              <button aria-label="Move down" onClick={() => onCommand("down")}><ArrowDown size={19} /></button>
              <button className="wide" onClick={() => onCommand("drop")}>Drop</button>
              <button className="wide secondary" onClick={() => onCommand("pause")}>
                {state?.paused ? <Play size={16} /> : <Pause size={16} />}
                {state?.paused ? "Resume" : "Pause"}
              </button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
