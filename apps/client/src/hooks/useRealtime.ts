import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientCommand, ServerEvent, WorldSnapshot } from "@workhard/shared";
import { resolveRealtimeUrl } from "../server-url";

export type ConnectionState = "connecting" | "online" | "offline";

const CONNECTION_TIMEOUT_MS = 8_000;
const STALE_CONNECTION_MS = 15_000;
const CONNECTION_WATCH_INTERVAL_MS = 5_000;
const OFFLINE_PROBE_INTERVAL_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 8_000;
const MAX_BUFFERED_COMMAND_BYTES = 64 * 1024;
const AUTHENTICATION_CLOSE_CODE = 4_401;
const PROTOCOL_ERROR_CLOSE_CODE = 4_002;

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
  const [connection, setConnection] = useState<ConnectionState>(() => navigator.onLine ? "connecting" : "offline");
  const [snapshot, setSnapshot] = useState<WorldSnapshot>();

  eventHandlerRef.current = onEvent;
  unauthorizedHandlerRef.current = onUnauthorized;
  floorIdRef.current = floorId;

  useEffect(() => {
    let active = true;
    let currentSocket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let connectionTimer: number | undefined;
    let watchTimer: number | undefined;
    let reconnectAttempt = 0;
    let attemptedConnection = false;
    let reconnectEnabled = true;
    let lastMessageAt = 0;
    let lastConnectionAttemptAt = 0;
    let latestSnapshot: WorldSnapshot | undefined;
    let synchronizedFloorId: string | undefined;
    let workspaceSnapshotReceived = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
    };

    const clearConnectionTimer = () => {
      if (connectionTimer !== undefined) {
        window.clearTimeout(connectionTimer);
        connectionTimer = undefined;
      }
    };

    const markUnavailable = () => {
      socketRef.current = undefined;
      setConnection("offline");
      setSnapshot(undefined);
    };

    const armConnectionTimer = (socket: WebSocket) => {
      clearConnectionTimer();
      connectionTimer = window.setTimeout(() => {
        if (active && currentSocket === socket && socketRef.current !== socket) {
          socket.close();
        }
      }, CONNECTION_TIMEOUT_MS);
    };

    const scheduleReconnect = () => {
      if (
        !active
        || reconnectTimer !== undefined
        || !navigator.onLine
        || document.visibilityState === "hidden"
      ) {
        return;
      }
      const backoff = Math.min(
        MAX_RECONNECT_DELAY_MS,
        INITIAL_RECONNECT_DELAY_MS * 2 ** Math.min(reconnectAttempt, 4),
      );
      const delay = Math.round(backoff * (0.8 + Math.random() * 0.4));
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    };

    const connect = (ignoreBrowserStatus = false) => {
      if (!active || !reconnectEnabled || (!navigator.onLine && !ignoreBrowserStatus)) {
        markUnavailable();
        return;
      }
      if (
        currentSocket?.readyState === WebSocket.OPEN
        || currentSocket?.readyState === WebSocket.CONNECTING
      ) {
        return;
      }

      clearReconnectTimer();
      lastConnectionAttemptAt = Date.now();
      if (!attemptedConnection) {
        attemptedConnection = true;
        setConnection(navigator.onLine ? "connecting" : "offline");
      } else {
        markUnavailable();
      }

      let socket: WebSocket;
      try {
        socket = new WebSocket(resolveRealtimeUrl(`/v1/realtime?floorId=${encodeURIComponent(floorIdRef.current)}`));
      } catch {
        markUnavailable();
        scheduleReconnect();
        return;
      }

      currentSocket = socket;
      latestSnapshot = undefined;
      synchronizedFloorId = undefined;
      workspaceSnapshotReceived = false;
      lastMessageAt = Date.now();
      armConnectionTimer(socket);

      socket.addEventListener("open", () => {
        if (active && currentSocket === socket) {
          lastMessageAt = Date.now();
        }
      });

      socket.addEventListener("message", (message) => {
        if (!active || currentSocket !== socket) {
          return;
        }
        const event = parseServerEvent(message.data);
        if (!event) {
          socket.close();
          return;
        }

        lastMessageAt = Date.now();
        if (socketRef.current !== socket) {
          armConnectionTimer(socket);
        }
        if (event.type === "session.ready") {
          synchronizedFloorId = event.floorId;
        }
        if (event.type === "world.snapshot") {
          latestSnapshot = event;
          if (socketRef.current === socket) {
            setSnapshot(event);
          }
        }
        if (event.type === "workspace.snapshot") {
          workspaceSnapshotReceived = true;
        }

        if (event.type === "session.synced") {
          if (
            !workspaceSnapshotReceived
            || !synchronizedFloorId
            || latestSnapshot?.floorId !== synchronizedFloorId
          ) {
            socket.close(PROTOCOL_ERROR_CLOSE_CODE, "Synchronization incomplete");
            return;
          }
          clearConnectionTimer();
          reconnectAttempt = 0;
          socketRef.current = socket;
          setSnapshot(latestSnapshot);
          setConnection("online");
        }
        eventHandlerRef.current(event);
      });

      socket.addEventListener("close", (event) => {
        if (!active || currentSocket !== socket) {
          return;
        }
        clearConnectionTimer();
        currentSocket = undefined;
        markUnavailable();
        if (event.code === AUTHENTICATION_CLOSE_CODE) {
          reconnectEnabled = false;
          unauthorizedHandlerRef.current?.();
          return;
        }
        scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        if (currentSocket === socket) {
          socket.close();
        }
      });
    };

    const ensureActiveConnection = () => {
      if (!active || !reconnectEnabled || document.visibilityState === "hidden") {
        return;
      }
      const browserReportsOffline = !navigator.onLine;
      if (browserReportsOffline && Date.now() - lastConnectionAttemptAt < OFFLINE_PROBE_INTERVAL_MS) {
        return;
      }
      if (!currentSocket || currentSocket.readyState === WebSocket.CLOSED) {
        connect(browserReportsOffline);
        return;
      }
      if (
        currentSocket.readyState === WebSocket.CLOSING
        && Date.now() - lastMessageAt >= CONNECTION_TIMEOUT_MS
      ) {
        currentSocket = undefined;
        connect(browserReportsOffline);
        return;
      }
      if (
        currentSocket.readyState === WebSocket.OPEN
        && Date.now() - lastMessageAt >= STALE_CONNECTION_MS
      ) {
        currentSocket.close();
      }
    };

    const handleOnline = () => {
      reconnectAttempt = 0;
      clearReconnectTimer();
      ensureActiveConnection();
    };

    const handleOffline = () => {
      clearReconnectTimer();
      clearConnectionTimer();
      lastConnectionAttemptAt = Date.now();
      markUnavailable();
      currentSocket?.close();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        clearReconnectTimer();
        ensureActiveConnection();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pageshow", ensureActiveConnection);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    watchTimer = window.setInterval(ensureActiveConnection, CONNECTION_WATCH_INTERVAL_MS);
    connect(true);

    return () => {
      active = false;
      clearReconnectTimer();
      clearConnectionTimer();
      if (watchTimer !== undefined) {
        window.clearInterval(watchTimer);
      }
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pageshow", ensureActiveConnection);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      currentSocket?.close();
      socketRef.current = undefined;
    };
  }, []);

  const send = useCallback((command: ClientCommand): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    const closeUnavailableSocket = () => {
      if (socketRef.current === socket) {
        socketRef.current = undefined;
        setConnection("offline");
        setSnapshot(undefined);
      }
      try {
        socket.close();
      } catch {
        return;
      }
    };
    try {
      const payload = JSON.stringify(command);
      if (socket.bufferedAmount + payload.length > MAX_BUFFERED_COMMAND_BYTES) {
        closeUnavailableSocket();
        return false;
      }
      socket.send(payload);
      return true;
    } catch {
      closeUnavailableSocket();
      return false;
    }
  }, []);

  return { connection, snapshot, send };
}

function parseServerEvent(source: unknown): ServerEvent | undefined {
  if (typeof source !== "string") {
    return undefined;
  }
  try {
    const candidate = JSON.parse(source) as unknown;
    if (
      typeof candidate !== "object"
      || candidate === null
      || !("type" in candidate)
      || typeof candidate.type !== "string"
    ) {
      return undefined;
    }
    return candidate as ServerEvent;
  } catch {
    return undefined;
  }
}
