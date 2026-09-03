import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapData, ClientCommand, ServerEvent } from "@workhard/shared";
import { useRealtime } from "./useRealtime";
import { createTestEconomy, createTestGameSettings, createTestKidnappingConfiguration } from "../test-fixtures";

class MockWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  bufferedAmount = 0;
  sent: string[] = [];

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    MockWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(event: ServerEvent | string): void {
    const data = typeof event === "string" ? event : JSON.stringify(event);
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new DOMException("Socket is not open.", "InvalidStateError");
    }
    this.sent.push(data);
  }

  close(code = 1000): void {
    if (this.readyState === MockWebSocket.CLOSED) {
      return;
    }
    this.readyState = MockWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close", { code }));
  }

  stallWhileClosing(): void {
    this.readyState = MockWebSocket.CLOSING;
  }
}

let online = true;

const workspaceSnapshot: BootstrapData = {
  currentUserId: "user-one",
  team: { id: "team-one", name: "Team", slug: "team", accent: "#000000" },
  office: { id: "office-one", teamId: "team-one", name: "Office" },
  floors: [],
  members: [],
  layouts: [],
  miniGames: [],
  scores: [],
  gameStatistics: [],
  economy: createTestEconomy(),
  gameSettings: createTestGameSettings(),
  kidnapping: createTestKidnappingConfiguration(),
  invitations: [],
  meetings: [],
  conversations: [],
  messages: [],
};

function synchronize(socket: MockWebSocket, tick = 1): void {
  socket.receive({ type: "session.ready", userId: "user-one", floorId: "floor-one" });
  socket.receive({
    type: "world.snapshot",
    tick,
    floorId: "floor-one",
    layoutRevision: 1,
    players: [],
  });
  socket.receive({ type: "workspace.snapshot", data: workspaceSnapshot });
  socket.receive({ type: "session.synced" });
}

beforeEach(() => {
  online = true;
  MockWebSocket.instances = [];
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useRealtime", () => {
  it("waits for authoritative synchronization before enabling commands", () => {
    const onEvent = vi.fn();
    const { result, unmount } = renderHook(() => useRealtime({ floorId: "floor-one", onEvent }));
    const socket = MockWebSocket.instances[0]!;
    const command: ClientCommand = {
      type: "presence.set_availability",
      requestId: "request-one",
      availability: "busy",
    };

    act(() => socket.open());
    expect(result.current.connection).toBe("connecting");
    expect(result.current.send(command)).toBe(false);

    act(() => {
      socket.receive({ type: "session.ready", userId: "user-one", floorId: "floor-one" });
      socket.receive({
        type: "world.snapshot",
        tick: 1,
        floorId: "floor-one",
        layoutRevision: 1,
        players: [],
      });
      socket.receive({ type: "workspace.snapshot", data: workspaceSnapshot });
    });
    expect(result.current.connection).toBe("connecting");
    expect(result.current.snapshot).toBeUndefined();

    act(() => socket.receive({ type: "session.synced" }));
    expect(result.current.connection).toBe("online");
    expect(result.current.snapshot?.tick).toBe(1);
    expect(result.current.send(command)).toBe(true);
    expect(JSON.parse(socket.sent[0]!)).toEqual(command);
    expect(onEvent).toHaveBeenLastCalledWith({ type: "session.synced" });
    unmount();
  });

  it("recovers from a dropped connection and keeps commands blocked during recovery", () => {
    const { result, unmount } = renderHook(() => useRealtime({ floorId: "floor-one", onEvent: vi.fn() }));
    const firstSocket = MockWebSocket.instances[0]!;

    act(() => {
      firstSocket.open();
      synchronize(firstSocket);
      firstSocket.close(1006);
    });
    expect(result.current.connection).toBe("offline");
    expect(result.current.send({
      type: "interaction.react",
      requestId: "request-two",
      reaction: "wave",
    })).toBe(false);

    act(() => vi.advanceTimersByTime(500));
    const recoveredSocket = MockWebSocket.instances[1]!;
    expect(recoveredSocket).toBeDefined();
    act(() => recoveredSocket.open());
    expect(result.current.connection).toBe("offline");

    act(() => synchronize(recoveredSocket, 2));
    expect(result.current.connection).toBe("online");
    unmount();
  });

  it("uses browser offline and online signals for immediate recovery", () => {
    online = false;
    const { result, unmount } = renderHook(() => useRealtime({ floorId: "floor-one", onEvent: vi.fn() }));

    expect(result.current.connection).toBe("offline");
    expect(MockWebSocket.instances).toHaveLength(1);
    act(() => MockWebSocket.instances[0]!.close(1006));

    act(() => {
      online = true;
      window.dispatchEvent(new Event("online"));
    });
    expect(MockWebSocket.instances).toHaveLength(2);
    const socket = MockWebSocket.instances[1]!;

    act(() => {
      socket.open();
      synchronize(socket);
    });
    expect(result.current.connection).toBe("online");

    act(() => {
      online = false;
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.connection).toBe("offline");
    unmount();
  });

  it("probes occasionally when the browser remains incorrectly marked offline", () => {
    online = false;
    const { unmount } = renderHook(() => useRealtime({ floorId: "floor-one", onEvent: vi.fn() }));
    act(() => MockWebSocket.instances[0]!.close(1006));

    act(() => vi.advanceTimersByTime(29_999));
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1));
    expect(MockWebSocket.instances).toHaveLength(2);
    unmount();
  });

  it("does not reconnect an unauthorized session", () => {
    const onUnauthorized = vi.fn();
    const { result, unmount } = renderHook(() => useRealtime({
      floorId: "floor-one",
      onEvent: vi.fn(),
      onUnauthorized,
    }));
    const socket = MockWebSocket.instances[0]!;

    act(() => {
      socket.open();
      socket.close(4_401);
      vi.advanceTimersByTime(20_000);
    });

    expect(result.current.connection).toBe("offline");
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances).toHaveLength(1);
    unmount();
  });

  it("replaces a socket that remains stuck while closing", () => {
    const { result, unmount } = renderHook(() => useRealtime({ floorId: "floor-one", onEvent: vi.fn() }));
    const socket = MockWebSocket.instances[0]!;

    act(() => {
      socket.open();
      synchronize(socket);
      socket.stallWhileClosing();
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.connection).toBe("offline");
    expect(MockWebSocket.instances).toHaveLength(2);
    unmount();
  });

  it("reconnects instead of enabling commands after an incomplete synchronization", () => {
    const { result, unmount } = renderHook(() => useRealtime({ floorId: "floor-one", onEvent: vi.fn() }));
    const socket = MockWebSocket.instances[0]!;

    act(() => {
      socket.open();
      socket.receive({ type: "session.ready", userId: "user-one", floorId: "floor-one" });
      socket.receive({
        type: "world.snapshot",
        tick: 1,
        floorId: "floor-one",
        layoutRevision: 1,
        players: [],
      });
      socket.receive({ type: "session.synced" });
    });

    expect(result.current.connection).toBe("offline");
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    act(() => vi.advanceTimersByTime(500));
    expect(MockWebSocket.instances).toHaveLength(2);
    unmount();
  });

  it("rejects commands when the browser send buffer is saturated", () => {
    const { result, unmount } = renderHook(() => useRealtime({ floorId: "floor-one", onEvent: vi.fn() }));
    const socket = MockWebSocket.instances[0]!;
    act(() => {
      socket.open();
      synchronize(socket);
    });
    socket.bufferedAmount = 64 * 1024;

    let sent = true;
    act(() => {
      sent = result.current.send({
        type: "chat.send",
        requestId: "buffered-message",
        conversationId: "conversation-one",
        body: "Keep this draft",
      });
    });
    expect(sent).toBe(false);
    expect(socket.sent).toHaveLength(0);
    expect(result.current.connection).toBe("offline");
    unmount();
  });
});
