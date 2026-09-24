import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import type { ClientCommand, ServerEvent } from "@workhard/shared";
import WebSocket from "ws";
import type { ApplicationContext } from "../app.js";
import { createTestApplication } from "./application.js";
import { MemoryDatabase } from "../persistence/memory-database.js";

export async function multiplayerFixture(position: { x: number; y: number }, chessNow?: () => Date) {
  const application = await createTestApplication({ database: new MemoryDatabase(), fixture: true, ...(chessNow ? { chessNow } : {}) });
  application.runtime.restorePlayers(application.runtime.serializePlayers().map((player) => ({ ...player, ...position })));
  await application.app.listen({ host: "127.0.0.1", port: 0 });
  const clients: RealtimeClient[] = [];
  return {
    ...application,
    async connect(identifier: string) {
      const login = await application.app.inject({ method: "POST", url: "/v1/auth/login", payload: { identifier, password: "northstar" } });
      if (login.statusCode !== 200) throw new Error(`Login failed: ${login.statusCode}`);
      const header = login.headers["set-cookie"];
      const cookie = (Array.isArray(header) ? header[0] : header)?.split(";", 1)[0];
      if (!cookie) throw new Error("Missing session cookie");
      const client = new RealtimeClient(application, cookie);
      clients.push(client);
      await client.waitFor((event) => event.type === "session.synced");
      return client;
    },
    async close() {
      for (const client of clients) client.socket.terminate();
      await application.app.close();
    },
  };
}

export class RealtimeClient {
  readonly socket: WebSocket;
  readonly events: ServerEvent[] = [];
  private sequence = 0;
  private readonly inputSessionId = randomUUID();

  constructor(application: ApplicationContext, cookie: string) {
    const { port } = application.app.server.address() as AddressInfo;
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/v1/realtime?floorId=floor-studio`, {
      origin: "http://127.0.0.1:5173", headers: { cookie },
    });
    this.socket.on("message", (data) => this.events.push(JSON.parse(data.toString()) as ServerEvent));
  }

  async request(command: ClientCommand): Promise<ServerEvent> {
    if (!("requestId" in command)) throw new Error("Request ID required");
    const response = this.waitFor((event) => (event.type === "command.ack" || event.type === "command.error") && event.requestId === command.requestId);
    this.socket.send(JSON.stringify(command));
    return response;
  }

  async drop(roundId: string): Promise<ServerEvent> {
    const response = this.waitFor((event) => event.type === "game.state" && event.roundId === roundId, this.events.length);
    this.socket.send(JSON.stringify({ type: "game.command", requestId: randomUUID(), roundId, command: "drop", sequence: ++this.sequence, inputSessionId: this.inputSessionId }));
    return response;
  }

  waitFor(predicate: (event: ServerEvent) => boolean, after = 0): Promise<ServerEvent> {
    const existing = this.events.slice(after).find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, event?: ServerEvent) => {
        clearTimeout(timer);
        this.socket.off("message", onMessage);
        this.socket.off("close", onClose);
        this.socket.off("error", onError);
        if (error) reject(error);
        else resolve(event!);
      };
      const onMessage = (data: WebSocket.RawData) => {
        const event = JSON.parse(data.toString()) as ServerEvent;
        if (predicate(event)) finish(undefined, event);
      };
      const onClose = () => finish(new Error("Socket closed before response"));
      const onError = (error: Error) => finish(error);
      const timer = setTimeout(() => finish(new Error("Timed out waiting for multiplayer event")), 5000);
      this.socket.on("message", onMessage);
      this.socket.once("close", onClose);
      this.socket.once("error", onError);
    });
  }
}
