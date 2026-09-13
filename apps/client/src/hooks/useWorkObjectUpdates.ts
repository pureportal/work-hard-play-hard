import { useCallback, useEffect, useRef } from "react";
import type { ClientCommand, ServerEvent } from "@workhard/shared";

interface PendingUpdate {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: number;
}

export function useWorkObjectUpdates() {
  const pending = useRef(new Map<string, PendingUpdate>());
  const disconnect = useCallback(() => {
    for (const update of pending.current.values()) {
      window.clearTimeout(update.timer);
      update.reject(new Error("Connection lost. Reconnect and try again."));
    }
    pending.current.clear();
  }, []);
  useEffect(() => disconnect, [disconnect]);

  const handleEvent = useCallback((event: ServerEvent) => {
    if ((event.type !== "layout.updated" && event.type !== "command.error") || !event.requestId) return false;
    const update = pending.current.get(event.requestId);
    if (!update) return false;
    pending.current.delete(event.requestId);
    window.clearTimeout(update.timer);
    if (event.type === "command.error") update.reject(new Error(event.message));
    else update.resolve();
    return event.type === "command.error";
  }, []);

  const update = useCallback((send: (command: ClientCommand) => boolean, command: Extract<ClientCommand, { type: "work.update" }>) =>
    new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pending.current.delete(command.requestId);
        reject(new Error("No response. Check your connection and try again."));
      }, 10_000);
      pending.current.set(command.requestId, { resolve, reject, timer });
      if (!send(command)) {
        window.clearTimeout(timer);
        pending.current.delete(command.requestId);
        reject(new Error("Connection unavailable. Reconnect and try again."));
      }
    }), []);

  return { update, handleEvent, disconnect };
}
