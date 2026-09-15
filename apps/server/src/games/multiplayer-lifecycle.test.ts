import { createTestData } from "../testing/workspace-data.js";
import { FALLING_BLOCKS_DEFINITION_ID, TIC_TAC_TOE_DEFINITION_ID, type ServerEvent, type WorldPlayer } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "../store.js";
import { FallingBlocksMultiplayerRuntime } from "./falling-blocks-multiplayer.js";
import { GamesRuntime } from "./games-runtime.js";
import { TicTacToeMultiplayerRuntime } from "./tic-tac-toe-multiplayer.js";
import { ChessMultiplayerRuntime } from "./chess-multiplayer.js";

const players: WorldPlayer[] = ["user-maya", "user-leo"].map((userId, index) => ({
  userId, floorId: "floor-studio", x: 1248 + index * 8, y: 636,
  facing: "down", availability: "available", connected: true,
}));
const connected = new Set(players.map((player) => player.userId));

describe("multiplayer lifecycle", () => {
  it("uses the selected Tic-Tac-Toe cabinet and closes a removed lobby", () => {
    const store = new WorkspaceStore(createTestData());
    const original = store.getObject("object-tic-tac-toe")!;
    const second = { ...original, id: "second-board", x: 600, y: 700 };
    store.getLayout(original.floorId)!.objects.push(second);
    const runtime = new TicTacToeMultiplayerRuntime(store);
    const gathered = players.map((player) => ({ ...player, x: 640, y: 730 }));
    runtime.syncLobbies(gathered, connected);
    expect(() => runtime.start("user-maya", original.id, "classic")).toThrow("GAME_TOO_FAR");
    const started = runtime.start("user-maya", second.id, "ultimate");
    expect(started.participantIds).toEqual(["user-maya", "user-leo"]);
    expect(started.deliveries.find(({ event }) => event.type === "game.round_started")?.event).toMatchObject({ round: { objectId: second.id } });
    runtime.leave("user-maya");
    runtime.syncLobbies(gathered, connected);
    store.getLayout(original.floorId)!.objects = store.getLayout(original.floorId)!.objects.filter((object) => object.id !== second.id);
    expect(runtime.syncLobbies(gathered, connected).map(({ event }) => event)).toContainEqual(expect.objectContaining({ type: "game.lobby_updated", lobby: expect.objectContaining({ objectId: second.id, participantIds: [] }) }));
  });

  it("opens chess at additional boards and restores a viewing session", () => {
    const store = new WorkspaceStore(createTestData());
    const original = store.getObject("object-chess")!;
    const second = { ...original, id: "second-chess", x: 600, y: 700 };
    store.getLayout(original.floorId)!.objects.push(second);
    const runtime = new ChessMultiplayerRuntime(store);
    runtime.syncLobby(players.map((player) => ({ ...player, x: 640, y: 730 })), connected);
    runtime.create("user-maya", { timeControl: "standard", pauseWeekends: false, access: "open" });
    const match = store.getChessMatches().find((match) => match.objectId === second.id)!;
    expect(match).toBeDefined();
    runtime.join("user-leo", match.id);
    runtime.open("user-maya", match.id);
    expect(runtime.getSessionEvents("user-maya")).toContainEqual(expect.objectContaining({ type: "chess.match_state", match: expect.objectContaining({ id: match.id }) }));
    runtime.stop();
  });

  it("lets a player leave a finished board and replay while the old round continues", () => {
    const store = new WorkspaceStore(createTestData());
    const runtime = new FallingBlocksMultiplayerRuntime(store);
    runtime.syncLobbies(players, connected);
    const first = runtime.start("user-maya", "object-falling-blocks");
    for (let drop = 0; drop < 30 && runtime.isPlaying("user-maya"); drop += 1) runtime.command("user-maya", "drop");
    expect(runtime.isPlaying("user-maya")).toBe(false);
    expect(runtime.isPlaying("user-leo")).toBe(true);
    runtime.leave("user-maya");
    runtime.syncLobbies(players, connected);
    const replay = runtime.start("user-maya", "object-falling-blocks", true);
    expect(roundId(replay.deliveries.map(({ event }) => event))).not.toBe(roundId(first.deliveries.map(({ event }) => event)));
    runtime.leave("user-leo");
    expect(runtime.isPlaying("user-maya")).toBe(true);
    expect(runtime.command("user-maya", "drop").some(({ event }) => event.type === "game.state")).toBe(true);
    expect(store.getScores().filter((score) => score.roundId === roundId(first.deliveries.map(({ event }) => event)))).toHaveLength(2);
  });

  it("removes all players from overlapping lobbies as soon as a round starts", () => {
    const runtime = new GamesRuntime(new WorkspaceStore(createTestData()));
    runtime.syncLobbies(players, connected);
    runtime.start("user-maya", FALLING_BLOCKS_DEFINITION_ID, undefined, { objectId: "object-falling-blocks" });
    expect(runtime.getSessionEvents("user-leo").filter((event) => event.type === "game.lobby_updated"
      && event.lobby.definitionId === TIC_TAC_TOE_DEFINITION_ID)).toEqual([]);
  });

  it("sends lateral movement immediately without resending unchanged standings", () => {
    const runtime = new FallingBlocksMultiplayerRuntime(new WorkspaceStore(createTestData()));
    runtime.syncLobbies(players, connected);
    runtime.start("user-maya", "object-falling-blocks");
    expect(runtime.command("user-maya", "left").map(({ event }) => event.type)).toEqual(["game.state"]);
    expect(runtime.command("user-maya", "down").map(({ event }) => event.type)).toContain("game.round_updated");
  });
});

function roundId(events: ServerEvent[]): string {
  const event = events.find((event) => event.type === "game.round_started");
  if (!event || event.type !== "game.round_started") throw new Error("Round did not start");
  return event.round.id;
}
