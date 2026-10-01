import { useCallback, useRef, useState } from "react";
import type { ClientCommand, ServerEvent } from "@workhard/shared";

export function useWorkspaceCommand() {
  const pendingRequest = useRef<{ id: string; type: ClientCommand["type"] } | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const clear = useCallback(() => { pendingRequest.current = undefined; setPending(false); setError(undefined); }, []);
  const clearError = useCallback(() => setError(undefined), []);
  const handleEvent = useCallback((event: ServerEvent) => {
    if ((event.type === "command.ack" || event.type === "command.error" || event.type === "layout.conflict" || event.type === "layout.updated"
      || event.type === "public_economy.updated" || event.type === "project.preview" || event.type === "project.submitted" || event.type === "economy.updated") && event.requestId && event.requestId === pendingRequest.current?.id) {
      if (pendingRequest.current.type === "project.submit" && event.type !== "project.submitted"
        && event.type !== "command.error" && event.type !== "layout.conflict") return false;
      clear();
      if (event.type === "command.error") setError(event.message);
      if (event.type === "layout.conflict") setError("The layout changed. Try again.");
      return true;
    }
    return false;
  }, [clear]);
  const run = (send: (command: ClientCommand) => boolean, command: ClientCommand & { requestId: string }) => {
    if (pendingRequest.current) return false;
    setError(undefined);
    pendingRequest.current = { id: command.requestId, type: command.type };
    setPending(true);
    if (!send(command)) { clear(); setError("Connection unavailable. Reconnect and try again."); return false; }
    return true;
  };
  return { pending, error, clear, clearError, handleEvent, run };
}
