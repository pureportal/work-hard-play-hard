import { useEffect, useRef } from "react";
import type { FallingBlocksCommand } from "@workhard/shared";

interface FallingBlocksKeyboardOptions {
  enabled: boolean;
  paused: boolean;
  allowPause: boolean;
  allowHold: boolean;
  onCommand: (command: FallingBlocksCommand) => void;
}

interface PressedDirection {
  command: "left" | "right";
  order: number;
}

const HORIZONTAL_REPEAT_DELAY_MS = 110;
const HORIZONTAL_REPEAT_INTERVAL_MS = 32;
const SOFT_DROP_REPEAT_INTERVAL_MS = 36;

const lateralCommands: Partial<Record<string, PressedDirection["command"]>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
};

const actionCommands: Partial<Record<string, FallingBlocksCommand>> = {
  ArrowUp: "rotate",
  KeyX: "rotate",
  KeyZ: "rotate-counterclockwise",
  Space: "drop",
  KeyC: "hold",
  ShiftLeft: "hold",
  ShiftRight: "hold",
  Numpad0: "hold",
  KeyP: "pause",
};

export function useFallingBlocksKeyboard({ enabled, paused, allowPause, allowHold, onCommand }: FallingBlocksKeyboardOptions): void {
  const onCommandRef = useRef(onCommand);
  const permissionsRef = useRef({ allowHold, allowPause });

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    permissionsRef.current = { allowHold, allowPause };
  }, [allowHold, allowPause]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const pressedKeys = new Set<string>();
    const pressedDirections = new Map<string, PressedDirection>();
    let pressOrder = 0;
    let activeDirectionCode: string | undefined;
    let horizontalDelayTimer: number | undefined;
    let horizontalRepeatTimer: number | undefined;
    let softDropTimer: number | undefined;

    const dispatch = (command: FallingBlocksCommand) => onCommandRef.current(command);

    const stopHorizontalRepeat = () => {
      window.clearTimeout(horizontalDelayTimer);
      window.clearInterval(horizontalRepeatTimer);
      horizontalDelayTimer = undefined;
      horizontalRepeatTimer = undefined;
    };

    const startHorizontalRepeat = (code: string, command: PressedDirection["command"], moveImmediately: boolean) => {
      stopHorizontalRepeat();
      activeDirectionCode = code;
      if (moveImmediately) {
        dispatch(command);
      }
      horizontalDelayTimer = window.setTimeout(() => {
        if (activeDirectionCode !== code || !pressedDirections.has(code)) {
          return;
        }
        dispatch(command);
        horizontalRepeatTimer = window.setInterval(() => {
          if (activeDirectionCode === code && pressedDirections.has(code)) {
            dispatch(command);
          }
        }, HORIZONTAL_REPEAT_INTERVAL_MS);
      }, HORIZONTAL_REPEAT_DELAY_MS);
    };

    const stopSoftDrop = () => {
      window.clearInterval(softDropTimer);
      softDropTimer = undefined;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("button, input, select, textarea, [contenteditable='true']")) return;
      const lateralCommand = lateralCommands[event.code];
      const actionCommand = actionCommands[event.code];
      const isSoftDrop = event.code === "ArrowDown";
      if (paused && actionCommand !== "pause") return;
      if (!lateralCommand && !actionCommand && !isSoftDrop) {
        return;
      }
      if (actionCommand === "pause" && !permissionsRef.current.allowPause) {
        return;
      }
      if (actionCommand === "hold" && !permissionsRef.current.allowHold) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || pressedKeys.has(event.code)) {
        return;
      }
      pressedKeys.add(event.code);

      if (lateralCommand) {
        pressedDirections.set(event.code, { command: lateralCommand, order: pressOrder });
        pressOrder += 1;
        startHorizontalRepeat(event.code, lateralCommand, true);
        return;
      }
      if (isSoftDrop) {
        dispatch("down");
        stopSoftDrop();
        softDropTimer = window.setInterval(() => dispatch("down"), SOFT_DROP_REPEAT_INTERVAL_MS);
        return;
      }
      if (actionCommand) {
        dispatch(actionCommand);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!pressedKeys.delete(event.code)) {
        return;
      }
      if (event.code === "ArrowDown") {
        stopSoftDrop();
        return;
      }
      if (!pressedDirections.delete(event.code) || activeDirectionCode !== event.code) {
        return;
      }

      stopHorizontalRepeat();
      const remainingDirection = [...pressedDirections.entries()]
        .sort(([, left], [, right]) => right.order - left.order)[0];
      if (remainingDirection) {
        const [code, direction] = remainingDirection;
        startHorizontalRepeat(code, direction.command, true);
      } else {
        activeDirectionCode = undefined;
      }
    };

    const clearInput = () => {
      pressedKeys.clear();
      pressedDirections.clear();
      activeDirectionCode = undefined;
      stopHorizontalRepeat();
      stopSoftDrop();
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", clearInput);
    return () => {
      clearInput();
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("blur", clearInput);
      document.removeEventListener("visibilitychange", clearInput);
    };
  }, [enabled, paused]);
}
