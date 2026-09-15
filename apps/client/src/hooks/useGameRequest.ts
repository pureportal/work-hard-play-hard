import { useCallback, useRef, useState } from "react";
import type { ClientCommand, ServerEvent } from "@workhard/shared";

export function useGameRequest() {
  const pendingId = useRef<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const clear = useCallback(() => {
    pendingId.current = undefined;
    setPending(false);
  }, []);
  const handleEvent = useCallback((event: ServerEvent) => {
    if ((event.type === "command.ack" || event.type === "command.error") && event.requestId === pendingId.current) clear();
  }, [clear]);
  const run = useCallback((send: (command: ClientCommand) => boolean, command: ClientCommand & { requestId: string }) => {
    if (pendingId.current) return false;
    pendingId.current = command.requestId;
    setPending(true);
    if (send(command)) return true;
    clear();
    return false;
  }, [clear]);
  return { pending, run, handleEvent, clear };
}
