import { useEffect, useRef, useState } from "react";
import type { FallingBlocksCommand, FallingBlocksGameState, FallingBlocksMode } from "@workhard/shared";
import { FallingBlocksPrediction } from "../falling-blocks-prediction";

export function useFallingBlocksPrediction(
  authoritativeState: FallingBlocksGameState | undefined,
  mode: FallingBlocksMode,
  onCommand: (command: FallingBlocksCommand, sequence: number, inputSessionId: string) => boolean | void,
  connected: boolean,
) {
  const prediction = useRef<FallingBlocksPrediction | undefined>(undefined);
  const onCommandRef = useRef(onCommand);
  const [state, setState] = useState(authoritativeState);
  onCommandRef.current = onCommand;

  useEffect(() => {
    if (!authoritativeState) return;
    if (!prediction.current || prediction.current.state.roundId !== authoritativeState.roundId) {
      prediction.current = new FallingBlocksPrediction(authoritativeState, mode);
      setState(prediction.current.state);
      return;
    }
    const corrected = prediction.current.reconcile(authoritativeState);
    if (corrected) setState(corrected);
  }, [authoritativeState, mode]);

  useEffect(() => {
    if (connected) prediction.current?.resendPending((command, sequence, inputSessionId) => onCommandRef.current(command, sequence, inputSessionId));
  }, [connected]);

  useEffect(() => {
    const tick = () => {
      const updated = prediction.current?.tick();
      if (updated) setState(updated);
    };
    const interval = window.setInterval(tick, 50);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const command = (input: FallingBlocksCommand) => {
    const updated = prediction.current?.command(input, (value, sequence, inputSessionId) => onCommandRef.current(value, sequence, inputSessionId));
    if (updated) setState(updated);
  };

  return { state: !authoritativeState || state?.roundId === authoritativeState.roundId ? state : authoritativeState, command };
}
