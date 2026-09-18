import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createOrganisation, createPublicEconomy, getAssetDefinition, getFloorPortals, getTeleporterPrice, type BuildProject, type ClientCommand, type FloorLayout, type LayoutEdit, type ServerEvent } from "@workhard/shared";
import { createTestData } from "../testing/workspace-data.js";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";
import { clientCommandSchema } from "../protocol.js";

const runtimes: WorldRuntime[] = [];
afterEach(() => runtimes.splice(0).forEach((runtime) => runtime.stop()));

function fixture() {
  const data = createTestData();
  data.floors = [{ ...data.floors[0]!, spawn: { x: 160, y: 224 } }];
  data.layouts = [{ floorId: data.floors[0]!.id, revision: 0, walls: [], openings: [], rooms: [], tiles: [], objects: [
    { id: "pad", floorId: data.floors[0]!.id, assetId: "floor-wood", variantId: "oak", rotation: 0, x: 320, y: 320 },
    { id: "pad-two", floorId: data.floors[0]!.id, assetId: "floor-wood", variantId: "oak", rotation: 0, x: 448, y: 320 },
  ] }];
  data.members = data.members.filter((member) => ["user-maya", "user-jonas"].includes(member.id));
  for (const member of data.members) { delete member.position; member.online = false; }
  data.organisation = createOrganisation();
  data.publicEconomy = createPublicEconomy();
  data.gameSettings = { roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } };
  const store = new WorkspaceStore(data);
  store.publicEconomy.record("workspace", "user-maya", "donation", 1_000_000, "fund-fixture");
  const runtime = new WorldRuntime(store);
  runtimes.push(runtime);
  const events: ServerEvent[] = [];
  const peer = runtime.connect("user-maya", data.floors[0]!.id, (event) => events.push(event));
  const voter = runtime.connect("user-jonas", data.floors[0]!.id, () => undefined);
  const send = (command: ClientCommand) => runtime.handleCommand(peer, command);
  const draft = (edit: LayoutEdit, previous?: BuildProject) => {
    const requestId = randomUUID();
    send({ type: "project.edit", requestId, fundId: "workspace", baseRevision: store.getLayouts()[0]!.revision,
      ...(previous ? { draftId: previous.id } : {}), edit });
    const event = events.find((event) => event.type === "project.preview" && event.requestId === requestId);
    if (event?.type !== "project.preview") throw new Error(JSON.stringify(events.at(-1)));
    return event.project;
  };
  const approve = (project: BuildProject) => {
    send({ type: "project.submit", requestId: randomUUID(), draftId: project.id, title: "Expand" });
    const proposal = store.getPublicEconomy().proposals.at(-1)!;
    runtime.handleCommand(voter, { type: "public_economy.vote", requestId: randomUUID(), proposalId: proposal.id, approve: true });
    expect(store.publicEconomy.proposal(proposal.id).status).toBe("approved");
    return proposal.id;
  };
  const execute = (proposalId: string) => send({ type: "public_economy.execute", requestId: randomUUID(), proposalId });
  return { data, store, runtime, events, send, draft, approve, execute };
}

const placement: LayoutEdit = { tool: "asset", assetId: "infrastructure-portal", variantId: "violet", rotation: 0, position: { x: 320, y: 320 } };

describe("teleporter construction", () => {
  it("creates one permanent bidirectional floor only after approval, charges once and survives restore", () => {
    const { store, runtime, events, send, draft, approve, execute } = fixture();
    const project = draft(placement);
    expect(project.quote.cost).toBe(10_000);
    expect(store.getFloors()).toHaveLength(1);
    const id = approve(project);
    expect(store.getFloors()).toHaveLength(1);
    execute(id);
    execute(id);
    expect(events.filter((event) => event.type === "command.error")).toEqual([]);
    expect(store.getFloors()).toHaveLength(2);
    expect(store.publicEconomy.fund("workspace").balance).toBe(990_000);
    const portals = getFloorPortals(store.getFloors(), store.getLayouts());
    expect(portals).toHaveLength(2);
    expect(portals[0]!.floorId).toBe(portals[1]!.destinationFloorId);
    const destination = store.getFloors()[1]!;
    expect(events).toContainEqual({ type: "floor.updated", floor: destination });
    expect(events).toContainEqual(expect.objectContaining({ type: "layout.updated", layout: expect.objectContaining({ floorId: destination.id }) }));
    send({ type: "movement.set_destination", requestId: "travel", floorId: destination.id, ...destination.spawn });
    for (let tick = 0; tick < 200; tick++) runtime.runTickForTest();
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")).toMatchObject({ floorId: destination.id, ...destination.spawn });
    send({ type: "player.rescue", requestId: "rescue" });
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")).toMatchObject({ floorId: store.getFloors()[0]!.id, ...store.getFloors()[0]!.spawn });
    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState(store.exportMutableState());
    expect(getFloorPortals(restored.getFloors(), restored.getLayouts())).toEqual(portals);
    expect(draft({ ...placement, position: { x: 448, y: 320 } }).quote.cost).toBe(40_000);
  });

  it("prices every new floor in a multi-teleporter draft", () => {
    const { draft } = fixture();
    const first = draft(placement);
    const second = draft({ ...placement, position: { x: 448, y: 320 } }, first);
    expect(second.quote.cost).toBe(50_000);
    expect(second.quote.assetChanges.map(({ object }) => object.label)).toEqual(["2", "3"]);
    expect([1, 2, 3, 4].map(getTeleporterPrice)).toEqual([10_000, 40_000, 90_000, 160_000]);
  });

  it("moves with approval without creating or charging for another floor, and rejects both removal tools", () => {
    const { store, events, send, draft, approve, execute } = fixture();
    execute(approve(draft(placement)));
    const portal = store.getLayouts()[0]!.objects.find((object) => getAssetDefinition(object.assetId)?.kind === "portal")!;
    const move = draft({ tool: "asset.move", objectId: portal.id, position: { x: 448, y: 320 }, variantId: "violet", rotation: 0 });
    expect(move.quote.cost).toBe(0);
    expect(portal.x).toBe(320);
    execute(approve(move));
    expect(store.getFloors()).toHaveLength(2);
    expect(store.getLayouts()[0]!.objects.find((object) => object.id === portal.id)!.x).toBe(448);
    for (const edit of [{ tool: "item.remove", item: { type: "asset", id: portal.id } }, { tool: "erase", position: { x: 480, y: 352 } }] as const) {
      send({ type: "project.edit", requestId: randomUUID(), baseRevision: store.getLayouts()[0]!.revision, fundId: "workspace", edit });
      expect(events.at(-1)).toMatchObject({ type: "command.error", code: "TELEPORTER_PERMANENT" });
    }
  });

  it("rechecks access at execution and leaves money and floors unchanged on failure", () => {
    const { store, events, draft, approve, execute } = fixture();
    const id = approve(draft(placement));
    store.getGameSettings = () => ({ roomAccess: { mode: "none", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } });
    const proposal = store.publicEconomy.proposal(id);
    if (proposal.action.kind !== "project") throw new Error("Missing project");
    proposal.action.project.layout.rooms.push(roomAroundPortal("default"));
    execute(id);
    expect(events.at(-1)).toMatchObject({ type: "command.error", code: "TELEPORTER_PUBLIC_ONLY" });
    expect(store.getFloors()).toHaveLength(1);
    expect(store.publicEconomy.fund("workspace").balance).toBe(1_000_000);
  });

  it.each(["portal", "spawn"])("rejects proposals that privatize the %s", (target) => {
    const { store, events, send, draft, approve, execute } = fixture();
    execute(approve(draft(placement)));
    const room = roomAroundPortal("open");
    if (target === "spawn") {
      room.bounds = { x: 96, y: 160, width: 128, height: 128 };
      room.footprint = [room.bounds];
    }
    store.getLayouts()[0]!.rooms.push(room);
    send({ type: "public_economy.propose", requestId: "restrict", title: "Private room", action: {
      kind: "room.settings", roomId: room.id, baseRevision: store.getLayouts()[0]!.revision,
      settings: { name: room.name, color: room.color, access: { mode: "assigned", assignedPersonIds: ["user-maya"], knockable: true } },
    } });
    expect(events.at(-1)).toMatchObject({ type: "command.error", code: target === "portal" ? "TELEPORTER_PUBLIC_ONLY" : "SPAWN_RESTRICTED" });
    expect(store.getPublicEconomy().proposals.filter((proposal) => proposal.status === "open")).toEqual([]);
    expect(store.getFloors()).toHaveLength(2);
  });

  it("blocks construction over an unoccupied starting point", () => {
    const { store, runtime, send, events } = fixture();
    runtime.restorePlayers(runtime.serializePlayers().map((player) => ({ ...player, x: 640, y: 640 })));
    send({ type: "project.edit", requestId: "block-spawn", baseRevision: store.getLayouts()[0]!.revision, fundId: "workspace",
      edit: { tool: "wall", start: { x: 96, y: 224 }, end: { x: 224, y: 224 } } });
    expect(events.at(-1)).toMatchObject({ type: "command.error", code: "SPAWN_BLOCKED" });
    expect(store.getLayouts()[0]!.walls).toEqual([]);
  });

  it("rejects a quote when another floor was created on a different floor", () => {
    const { store, events, draft, approve, execute } = fixture();
    const id = approve(draft(placement));
    const floor = { ...store.getFloors()[0]!, id: "concurrent", level: 2 };
    store.addFloor(floor, { ...store.getLayouts()[0]!, floorId: floor.id, objects: [] });
    execute(id);
    expect(events.at(-1)).toMatchObject({ type: "command.error", code: "PROJECT_STALE" });
    expect(store.publicEconomy.proposal(id).status).toBe("cancelled");
    expect(store.publicEconomy.fund("workspace").balance).toBe(1_000_000);
  });

  it("validates rescue commands and clears an active destination", () => {
    const { runtime, send, store } = fixture();
    expect(clientCommandSchema.safeParse({ type: "player.rescue", requestId: "rescue" }).success).toBe(true);
    expect(clientCommandSchema.safeParse({ type: "player.rescue", requestId: "rescue", userId: "someone-else" }).success).toBe(false);
    send({ type: "movement.set_destination", requestId: "walk", floorId: store.getFloors()[0]!.id, x: 640, y: 640 });
    runtime.runTickForTest();
    send({ type: "player.rescue", requestId: "rescue" });
    for (let tick = 0; tick < 20; tick++) runtime.runTickForTest();
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")).toMatchObject(store.getFloors()[0]!.spawn);
  });
});

function roomAroundPortal(mode: "open" | "default" | "assigned"): FloorLayout["rooms"][number] {
  return { id: "portal-room", floorId: "floor-studio", name: "Room", color: "#ffffff", capacity: 8,
    bounds: { x: 288, y: 288, width: 128, height: 128 }, footprint: [{ x: 288, y: 288, width: 128, height: 128 }],
    boundary: [], doorIds: [], windowIds: [], privateEligible: true,
    access: { mode, assignedPersonIds: ["user-maya"], knockable: false } };
}
