import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { ClientCommand, ServerEvent } from "@workhard/shared";

type CallCommand = Extract<ClientCommand, { type: "call.request" | "movement.approach_user" }>;

export interface CallRequestStatus {
  command: CallCommand;
  error?: string;
}

export function useCallRequest(send: RefObject<(command: ClientCommand) => boolean>) {
  const current = useRef<CallRequestStatus | undefined>(undefined);
  const [status, setStatus] = useState<CallRequestStatus>();

  const update = useCallback((next: CallRequestStatus | undefined) => {
    current.current = next;
    setStatus(next);
  }, []);

  const clear = useCallback(() => update(undefined), [update]);
  const fail = useCallback((error: string) => {
    if (current.current && !current.current.error) update({ ...current.current, error });
  }, [update]);

  const run = useCallback((targetUserId: string, type: CallCommand["type"] = "call.request") => {
    if (current.current && !current.current.error) return false;
    const command: CallCommand = { type, targetUserId, requestId: crypto.randomUUID() };
    update({ command });
    if (send.current(command)) return true;
    fail("Connection unavailable. Reconnect and try again.");
    return false;
  }, [send, update, fail]);

  const handle = useCallback((event: ServerEvent) => {
    const command = current.current?.command;
    if (!command) return false;
    if (event.type === "command.error" && event.requestId === command.requestId) {
      fail(event.message);
      return true;
    }
    if (event.type === "call.state" && event.direction === "outgoing" && event.peerUserId === command.targetUserId) clear();
    return false;
  }, [clear, fail]);

  useEffect(() => {
    if (!status || status.error) return;
    const timer = window.setTimeout(() => fail("The call did not start. Try again."), status.command.type === "movement.approach_user" ? 60_000 : 10_000);
    return () => window.clearTimeout(timer);
  }, [status, fail]);

  return { status, pending: Boolean(status && !status.error), run, handle, clear, fail };
}
