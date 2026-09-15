import { ArrowDown, ArrowLeft, ArrowRight, ChevronsDown, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { FallingBlocksCommand } from "@workhard/shared";

interface FallingBlocksControlsProps {
  id: string;
  paused: boolean;
  canHold: boolean;
  multiplayer: boolean;
  onCommand: (command: FallingBlocksCommand) => void;
}

export function FallingBlocksControls({ id, paused, canHold, multiplayer, onCommand }: FallingBlocksControlsProps) {
  return (
    <div id={id} className="falling-blocks-controls" role="group" aria-label="Game controls">
      <ControlButton command="hold" label="Hold" shortcut="C / Shift" disabled={paused || !canHold} onCommand={onCommand}>Hold</ControlButton>
      <ControlButton command="rotate-counterclockwise" label="Rotate counterclockwise" shortcut="Z" disabled={paused} onCommand={onCommand}><RotateCcw size={20} /></ControlButton>
      <ControlButton command="rotate" label="Rotate clockwise" shortcut="↑ / X" disabled={paused} onCommand={onCommand}><RotateCw size={20} /></ControlButton>
      <ControlButton command="left" label="Move left" shortcut="←" repeat disabled={paused} onCommand={onCommand}><ArrowLeft size={20} /></ControlButton>
      <ControlButton command="down" label="Soft drop" shortcut="↓" repeat disabled={paused} onCommand={onCommand}><ArrowDown size={20} /></ControlButton>
      <ControlButton command="right" label="Move right" shortcut="→" repeat disabled={paused} onCommand={onCommand}><ArrowRight size={20} /></ControlButton>
      <ControlButton command="drop" label="Drop" shortcut="Space" disabled={paused} onCommand={onCommand}><ChevronsDown size={20} /><span>Drop</span></ControlButton>
      {!multiplayer && <ControlButton command="pause" label={paused ? "Resume" : "Pause"} shortcut="P" onCommand={onCommand}>
        {paused ? <Play size={18} /> : <Pause size={18} />}
      </ControlButton>}
    </div>
  );
}

interface ControlButtonProps {
  command: FallingBlocksCommand;
  label: string;
  shortcut: string;
  repeat?: boolean;
  disabled?: boolean;
  onCommand: (command: FallingBlocksCommand) => void;
  children: ReactNode;
}

function ControlButton({ command, label, shortcut, repeat, disabled, onCommand, children }: ControlButtonProps) {
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;
  const pointer = useRef<number | null>(null);
  const delay = useRef<number | undefined>(undefined);
  const interval = useRef<number | undefined>(undefined);
  const stop = () => {
    window.clearTimeout(delay.current);
    window.clearInterval(interval.current);
    pointer.current = null;
  };

  useEffect(() => {
    if (disabled) stop();
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      stop();
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [disabled]);

  return (
    <button type="button" aria-label={label} className={`control-${command}`} disabled={disabled}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0 || pointer.current !== null) return;
        event.preventDefault();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        onCommandRef.current(command);
        if (repeat) {
          delay.current = window.setTimeout(() => {
            onCommandRef.current(command);
            interval.current = window.setInterval(() => onCommandRef.current(command), command === "down" ? 36 : 32);
          }, command === "down" ? 36 : 110);
        }
      }}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => { if (event.detail === 0) onCommand(command); }}
    >
      <span>{children}</span><kbd>{shortcut}</kbd>
    </button>
  );
}
