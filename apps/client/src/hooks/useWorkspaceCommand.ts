import { useCallback, useRef, useState } from "react";
import type { ClientCommand, ServerEvent } from "@workhard/shared";

export function useWorkspaceCommand() {
  const requestId = useRef<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const clear = useCallback(() => { requestId.current = undefined; setPending(false); setError(undefined); }, []);
  const handleEvent = useCallback((event: ServerEvent) => {
    if ((event.type === "command.ack" || event.type === "command.error" || event.type === "layout.conflict" || event.type === "layout.updated"
      || event.type === "public_economy.updated" || event.type === "project.preview" || event.type === "project.submitted" || event.type === "economy.updated") && event.requestId && event.requestId === requestId.current) {
      clear();
      if (event.type === "command.error") setError(event.message);
      if (event.type === "layout.conflict") setError("The layout changed. Reopen the settings and try again.");
    }
  }, [clear]);
  const run = (send: (command: ClientCommand) => boolean, command: ClientCommand & { requestId: string }) => {
    if (requestId.current) return false;
    setError(undefined);
    requestId.current = command.requestId;
    setPending(true);
    if (!send(command)) { clear(); setError("Connection unavailable. Reconnect and try again."); return false; }
    return true;
  };
  return { pending, error, clear, handleEvent, run };
}
