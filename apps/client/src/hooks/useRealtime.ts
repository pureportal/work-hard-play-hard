import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientCommand, ServerEvent, WorldSnapshot } from "@workhard/shared";
import { resolveRealtimeUrl } from "../server-url";

export type ConnectionState = "connecting" | "online" | "offline";

interface UseRealtimeOptions {
  floorId: string;
  onEvent: (event: ServerEvent) => void;
  onUnauthorized?: (() => void) | undefined;
}

export function useRealtime({ floorId, onEvent, onUnauthorized }: UseRealtimeOptions) {
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const eventHandlerRef = useRef(onEvent);
  const unauthorizedHandlerRef = useRef(onUnauthorized);
  const floorIdRef = useRef(floorId);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [snapshot, setSnapshot] = useState<WorldSnapshot>();

  eventHandlerRef.current = onEvent;
  unauthorizedHandlerRef.current = onUnauthorized;
  floorIdRef.current = floorId;

  useEffect(() => {
    let active = true;
    let currentSocket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let connectionTimer: number | undefined;
    let reconnectAttempt = 0;

    const clearTimers = () => {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      if (connectionTimer !== undefined) {
        window.clearTimeout(connectionTimer);
        connectionTimer = undefined;
      }
    };

    const scheduleReconnect = () => {
      if (!active || reconnectTimer !== undefined || !navigator.onLine) {
        return;
      }
      const delay = Math.min(8_000, 500 * 2 ** reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (!active || !navigator.onLine) {
        setConnection("offline");
        return;
      }
      setConnection("connecting");
      let socket: WebSocket;
      try {
        socket = new WebSocket(resolveRealtimeUrl("/v1/realtime?floorId=" + encodeURIComponent(floorIdRef.current)));
      } catch {
        setConnection("offline");
        scheduleReconnect();
        return;
      }
      currentSocket = socket;
      socketRef.current = socket;
      connectionTimer = window.setTimeout(() => {
        if (active && currentSocket === socket && socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }, 6_000);

      socket.addEventListener("open", () => {
        if (active && currentSocket === socket) {
          if (connectionTimer !== undefined) {
            window.clearTimeout(connectionTimer);
            connectionTimer = undefined;
          }
          reconnectAttempt = 0;
          setConnection("online");
        }
      });
      socket.addEventListener("message", (message) => {
        if (!active || currentSocket !== socket) {
          return;
        }
        let event: ServerEvent;
        try {
          event = JSON.parse(String(message.data)) as ServerEvent;
        } catch {
          return;
        }
        if (event.type === "world.snapshot") {
          setSnapshot(event);
        }
        eventHandlerRef.current(event);
      });
      socket.addEventListener("close", (event) => {
        if (!active || currentSocket !== socket) {
          return;
        }
        if (connectionTimer !== undefined) {
          window.clearTimeout(connectionTimer);
          connectionTimer = undefined;
        }
        setConnection("offline");
        setSnapshot(undefined);
        if (socketRef.current === socket) {
          socketRef.current = undefined;
        }
        if (event.code === 1008) {
          unauthorizedHandlerRef.current?.();
          return;
        }
        scheduleReconnect();
      });
      socket.addEventListener("error", () => socket.close());
    };

    const handleOnline = () => {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      reconnectAttempt = 0;
      if (currentSocket?.readyState !== WebSocket.OPEN && currentSocket?.readyState !== WebSocket.CONNECTING) {
        connect();
      }
    };
    const handleOffline = () => {
      clearTimers();
      setConnection("offline");
      setSnapshot(undefined);
      currentSocket?.close();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    connect();
    return () => {
      active = false;
      clearTimers();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      currentSocket?.close();
      if (socketRef.current === currentSocket) {
        socketRef.current = undefined;
      }
    };
  }, []);

  const send = useCallback((command: ClientCommand): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      socket.send(JSON.stringify(command));
      return true;
    } catch {
      socket.close();
      return false;
    }
  }, []);

  return { connection, snapshot, send };
}
