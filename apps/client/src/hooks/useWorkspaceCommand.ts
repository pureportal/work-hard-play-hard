import { useCallback, useRef, useState } from "react";
import type { ClientCommand, ServerEvent } from "@workhard/shared";

export function useWorkspaceCommand() {
  const requestId = useRef<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const clear = useCallback(() => { requestId.current = undefined; setPending(false); }, []);
  const handleEvent = useCallback((event: ServerEvent) => {
    if ((event.type === "command.ack" || event.type === "command.error" || event.type === "layout.conflict" || event.type === "layout.updated") && event.requestId === requestId.current) clear();
  }, [clear]);
  const run = (send: (command: ClientCommand) => boolean, command: ClientCommand & { requestId: string }) => {
    if (requestId.current) return;
    requestId.current = command.requestId;
    setPending(true);
    if (!send(command)) clear();
  };
  return { pending, clear, handleEvent, run };
}
