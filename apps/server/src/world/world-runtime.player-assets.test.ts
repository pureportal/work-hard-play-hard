import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootstrapData, ClientCommand, FloorLayout, Room, ServerEvent } from "@workhard/shared";
import { createTestData } from "../testing/workspace-data.js";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("WorldRuntime player-owned assets", () => {
  it("places the starter laptop on its desk, moves both, and stores them across reloads", () => {
    const store = new WorkspaceStore(workspace(room("assigned", ["user-jonas"])));
    const inventory = store.getPlayerEconomy("user-jonas").inventory;
    const desk = inventory.find((asset) => asset.assetId === "desk-straight")!;
    const laptop = inventory.find((asset) => asset.assetId === "decor-laptop")!;
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-jonas", "floor-player", (event) => events.push(event));
    try {
      send(runtime, peer, {
        type: "player_asset.place", requestId: "place-starter-desk", baseRevision: 1,
        ownedAssetId: desk.id, position: { x: 16, y: 16 }, variantId: "oak", rotation: 0,
      });
      const placedDesk = store.getLayout("floor-player")!.objects.find((object) => object.ownedAssetId === desk.id)!;
      send(runtime, peer, {
        type: "player_asset.move", requestId: "move-starter-desk", baseRevision: 2,
        objectId: placedDesk.id, position: { x: 16, y: 48 }, variantId: "navy", rotation: 0,
      });
      expect(store.getObject(placedDesk.id)).toMatchObject({ x: 16, y: 48, variantId: "navy" });
      send(runtime, peer, {
        type: "player_asset.place", requestId: "place-starter-laptop", baseRevision: 3,
        ownedAssetId: laptop.id, position: { x: 64, y: 64 }, variantId: "graphite", rotation: 0,
      });
      expect(events.filter((event) => event.type === "command.error")).toEqual([]);
      const placedLaptop = store.getLayout("floor-player")!.objects.find((object) => object.ownedAssetId === laptop.id)!;
      expect(store.getOwnedAsset("user-jonas", laptop.id).placement?.objectId).toBe(placedLaptop.id);
      send(runtime, peer, { type: "economy.sell_asset", requestId: "sell-placed", ownedAssetId: laptop.id });
      expect(events.at(-1)).toMatchObject({ type: "command.error", code: "ASSET_ALREADY_PLACED" });
      send(runtime, peer, {
        type: "player_asset.move", requestId: "move-occupied-desk", baseRevision: 4,
        objectId: placedDesk.id, position: { x: 16, y: 16 }, variantId: "navy", rotation: 0,
      });
      expect(events.at(-1)).toMatchObject({ type: "command.error", code: "ASSET_SUPPORT_OCCUPIED" });
      events.length = 0;
      send(runtime, peer, {
        type: "player_asset.move", requestId: "rotate-starter-laptop", baseRevision: 4,
        objectId: placedLaptop.id, position: { x: 64, y: 48 }, variantId: "ivory", rotation: 90,
      });
      expect(events.filter((event) => event.type === "command.error")).toEqual([]);
      expect(store.getObject(placedLaptop.id)).toMatchObject({ variantId: "ivory", rotation: 90 });
      const saved = store.exportMutableState();
      const restored = new WorkspaceStore();
      restored.restoreMutableState(saved);
      expect(restored.getPlayerEconomy("user-jonas").inventory).toEqual(store.getPlayerEconomy("user-jonas").inventory);
      const restoredRuntime = new WorldRuntime(restored);
      const restoredEvents: ServerEvent[] = [];
      try {
        const restoredPeer = restoredRuntime.connect("user-jonas", "floor-player", (event) => restoredEvents.push(event));
        send(restoredRuntime, restoredPeer, {
          type: "player_asset.remove", requestId: "store-starter-desk", baseRevision: 5, objectId: placedDesk.id,
        });
        expect(restoredEvents.filter((event) => event.type === "command.error")).toEqual([]);
        expect(restored.getLayout("floor-player")!.objects).toEqual([]);
        expect(restored.getPlayerEconomy("user-jonas").inventory).toEqual(inventory);
        send(restoredRuntime, restoredPeer, {
          type: "player_asset.place", requestId: "replace-starter-desk", baseRevision: 6,
          ownedAssetId: desk.id, position: { x: 16, y: 16 }, variantId: "sage", rotation: 90,
        });
        send(restoredRuntime, restoredPeer, {
          type: "player_asset.place", requestId: "replace-starter-laptop", baseRevision: 7,
          ownedAssetId: laptop.id, position: { x: 32, y: 32 }, variantId: "coral", rotation: 0,
        });
        expect(restoredEvents.filter((event) => event.type === "command.error")).toEqual([]);
        expect(restored.getPlayerEconomy("user-jonas").inventory).toHaveLength(5);
        expect(restored.getPlayerEconomy("user-jonas").coinBalance).toBe(250);
      } finally {
        restoredRuntime.stop();
      }
    } finally {
      runtime.stop();
    }
  });

  it("requires public ownership for permanent flooring", () => {
    const store = new WorkspaceStore(workspace(room("open", [])));
    expect(() => store.purchaseAsset("user-jonas", "floor-wood", "buy-floor")).toThrow("ASSET_UNAVAILABLE");
  });

  it("places, moves, and removes only the player's inventory in assigned rooms", () => {
    const store = new WorkspaceStore(workspace(room("assigned", ["user-jonas"])));
    const ownedAssetId = store.purchaseAsset("user-jonas", "chair-office", "buy-chair").transaction.ownedAssetId!;
    const otherAssetId = store.purchaseAsset("user-priya", "chair-office", "buy-other-chair").transaction.ownedAssetId!;
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-jonas", "floor-player", (event) => events.push(event));

    send(runtime, peer, {
      type: "player_asset.place",
      requestId: "place-chair",
      baseRevision: 1,
      ownedAssetId,
      position: { x: 32, y: 32 },
      variantId: "white",
      rotation: 0,
    });

    const placed = store.getLayout("floor-player")!.objects[0]!;
    expect(placed).toMatchObject({ assetId: "chair-office", ownerUserId: "user-jonas", ownedAssetId });
    expect(store.getOwnedAsset("user-jonas", ownedAssetId).placement?.objectId).toBe(placed.id);
    expect(events).toContainEqual(expect.objectContaining({ type: "layout.updated", requestId: "place-chair" }));
    expect(events).toContainEqual(expect.objectContaining({ type: "economy.updated", requestId: "place-chair" }));

    send(runtime, peer, {
      type: "player_asset.place",
      requestId: "stale-place",
      baseRevision: 1,
      ownedAssetId,
      position: { x: 64, y: 64 },
      variantId: "white",
      rotation: 0,
    });
    expect(events.at(-1)).toEqual({ type: "layout.conflict", requestId: "stale-place", revision: 2 });

    send(runtime, peer, {
      type: "player_asset.place",
      requestId: "place-stolen-chair",
      baseRevision: 2,
      ownedAssetId: otherAssetId,
      position: { x: 64, y: 64 },
      variantId: "white",
      rotation: 0,
    });
    expect(events.at(-1)).toMatchObject({ type: "command.error", code: "ASSET_NOT_OWNED" });

    send(runtime, peer, {
      type: "player_asset.move",
      requestId: "move-outside-room",
      baseRevision: 2,
      objectId: placed.id,
      position: { x: 112, y: 32 },
      variantId: "blue",
      rotation: 0,
    });
    expect(events.at(-1)).toMatchObject({ type: "command.error", code: "ASSET_ROOM_REQUIRED" });
    expect(store.getObject(placed.id)).toMatchObject({ x: 32, y: 32 });

    send(runtime, peer, {
      type: "player_asset.remove",
      requestId: "remove-chair",
      baseRevision: 2,
      objectId: placed.id,
    });
    expect(store.getObject(placed.id)).toBeUndefined();
    expect(store.getOwnedAsset("user-jonas", ownedAssetId).placement).toBeUndefined();
    runtime.stop();
  });

  it("returns the exact transaction for idempotent economy mutations", () => {
    const store = new WorkspaceStore(workspace(room("assigned", ["user-jonas"])));
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-jonas", "floor-player", (event) => events.push(event));

    send(runtime, peer, { type: "economy.claim_daily", requestId: "claim-daily" });
    const claim = events.find((event) => event.type === "economy.updated" && event.requestId === "claim-daily");
    expect(claim).toMatchObject({
      type: "economy.updated",
      economy: { coinBalance: 260 },
      transaction: { kind: "daily_bonus", amount: 10, balanceAfter: 260 },
    });

    send(runtime, peer, { type: "economy.purchase_asset", requestId: "buy-chair", assetId: "chair-office" });
    send(runtime, peer, { type: "economy.purchase_asset", requestId: "buy-chair", assetId: "chair-office" });
    const purchases = events.filter(
      (event): event is Extract<ServerEvent, { type: "economy.updated" }> =>
        event.type === "economy.updated" && event.requestId === "buy-chair",
    );
    expect(purchases).toHaveLength(2);
    expect(purchases[0]).toMatchObject({
      economy: { coinBalance: 190, inventory: expect.arrayContaining([expect.objectContaining({ assetId: "chair-office" })]) },
      transaction: { kind: "shop_purchase", amount: -70, balanceAfter: 190, assetId: "chair-office" },
    });
    expect(purchases[1]).toMatchObject({
      economy: { coinBalance: 190, inventory: expect.arrayContaining([expect.objectContaining({ assetId: "chair-office" })]) },
      transaction: { id: purchases[0]!.transaction?.id },
    });
    expect(purchases[0]!.economy.inventory).toHaveLength(6);
    expect(purchases[1]!.economy.inventory).toEqual(purchases[0]!.economy.inventory);
    runtime.stop();
  });

  it("denies moving or removing another player's placed asset", () => {
    const store = new WorkspaceStore(workspace(room("assigned", ["user-jonas", "user-priya"])));
    store.getRoom("room-player")!.ownerUserId = "user-priya";
    const ownedAssetId = store.purchaseAsset("user-priya", "plant-floor", "buy-priya-plant").transaction.ownedAssetId!;
    const runtime = new WorldRuntime(store);
    const ownerEvents: ServerEvent[] = [];
    const attackerEvents: ServerEvent[] = [];
    const ownerPeer = runtime.connect("user-priya", "floor-player", (event) => ownerEvents.push(event));
    const attackerPeer = runtime.connect("user-jonas", "floor-player", (event) => attackerEvents.push(event));

    send(runtime, ownerPeer, {
      type: "player_asset.place",
      requestId: "place-priya-plant",
      baseRevision: 1,
      ownedAssetId,
      position: { x: 32, y: 32 },
      variantId: "forest",
      rotation: 0,
    });
    const objectId = store.getLayout("floor-player")!.objects[0]!.id;
    const attackerLayoutUpdate = attackerEvents.find((event) => event.type === "layout.updated");
    expect(attackerLayoutUpdate).not.toHaveProperty("requestId");

    send(runtime, attackerPeer, {
      type: "player_asset.move",
      requestId: "move-priya-plant",
      baseRevision: 2,
      objectId,
      position: { x: 64, y: 64 },
      variantId: "sage",
      rotation: 0,
    });
    expect(attackerEvents.at(-1)).toMatchObject({ type: "command.error", code: "ASSET_NOT_OWNED" });

    send(runtime, attackerPeer, {
      type: "player_asset.remove",
      requestId: "remove-priya-plant",
      baseRevision: 2,
      objectId,
    });
    expect(attackerEvents.at(-1)).toMatchObject({ type: "command.error", code: "ASSET_NOT_OWNED" });
    expect(store.getObject(objectId)).toBeDefined();
    runtime.stop();
  });

  it("requires approval for global settings and personal items in public rooms", () => {
    const store = new WorkspaceStore(workspace(room("open", [])));
    store.updateGameSettings({ roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "none", assignedPersonIds: [] } });
    const ownedAssetId = store.purchaseAsset("user-jonas", "plant-floor", "buy-plant").transaction.ownedAssetId!;
    const runtime = new WorldRuntime(store);
    const playerEvents: ServerEvent[] = [];
    const adminEvents: ServerEvent[] = [];
    const playerPeer = runtime.connect("user-jonas", "floor-player", (event) => playerEvents.push(event));
    const adminPeer = runtime.connect("user-maya", "floor-player", (event) => adminEvents.push(event));

    send(runtime, playerPeer, {
      type: "player_asset.place",
      requestId: "place-public-disabled",
      baseRevision: 1,
      ownedAssetId,
      position: { x: 32, y: 32 },
      variantId: "forest",
      rotation: 0,
    });
    expect(playerEvents.at(-1)).toMatchObject({ type: "command.error", code: "ASSET_ROOM_FORBIDDEN" });

    send(runtime, playerPeer, {
      type: "game.settings_update",
      requestId: "player-setting",
      settings: { roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } },
    });
    expect(playerEvents.at(-1)).toMatchObject({ type: "command.error", code: "PROJECT_APPROVAL_REQUIRED" });

    send(runtime, adminPeer, {
      type: "game.settings_update",
      requestId: "admin-setting",
      settings: { roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } },
    });
    expect(adminEvents.at(-1)).toMatchObject({ type: "command.error", code: "PROJECT_APPROVAL_REQUIRED" });
    expect(store.getGameSettings().roomBuild.mode).toBe("none");
    store.updateGameSettings({ roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } });

    send(runtime, playerPeer, {
      type: "player_asset.place",
      requestId: "place-public-enabled",
      baseRevision: 1,
      ownedAssetId,
      position: { x: 32, y: 32 },
      variantId: "autumn",
      rotation: 0,
    });
    expect(playerEvents.at(-1)).toMatchObject({ type: "command.error", code: "PROJECT_APPROVAL_REQUIRED" });
    expect(store.getLayout("floor-player")!.objects).toEqual([]);
    runtime.stop();
  });

  it("publishes authoritative daily reward state after the UTC day changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T23:59:59.000Z"));
    const store = new WorkspaceStore(workspace(room("assigned", ["user-jonas"])));
    store.claimDailyReward("user-jonas", "claim-before-midnight");
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    runtime.connect("user-jonas", "floor-player", (event) => events.push(event));
    events.length = 0;

    vi.setSystemTime(new Date("2026-09-04T00:00:01.000Z"));
    for (let tick = 0; tick < 100; tick += 1) {
      runtime.runTickForTest();
    }

    expect(events).toContainEqual(expect.objectContaining({
      type: "economy.updated",
      economy: expect.objectContaining({
        dailyReward: expect.objectContaining({ claimable: true, streak: 1, amount: 15 }),
      }),
    }));
    runtime.stop();
  });
});

function send(runtime: WorldRuntime, peerId: string, command: ClientCommand): void {
  runtime.handleCommand(peerId, command);
}

function workspace(playerRoom: Room): BootstrapData {
  const data = createTestData("user-jonas", new Date("2026-09-01T12:00:00.000Z"));
  data.floors = [{
    id: "floor-player",
    officeId: data.office.id,
    name: "Player floor",
    level: 1,
    width: 256,
    height: 256,
    spawn: { x: 200, y: 200 },
    background: "#ffffff",
  }];
  data.layouts = [layout(playerRoom)];
  data.members = data.members.map((member) => ({
    ...member,
    floorId: "floor-player",
    position: { x: 200, y: 200 },
  }));
  return data;
}

function layout(playerRoom: Room): FloorLayout {
  return {
    floorId: "floor-player",
    revision: 1,
    walls: [],
    openings: [],
    tiles: [],
    objects: [],
    rooms: [playerRoom],
  };
}

function room(mode: Room["access"]["mode"], assignedPersonIds: string[]): Room {
  return {
    id: "room-player",
    floorId: "floor-player",
    name: "Player room",
    color: "#ffffff",
    capacity: 4,
    bounds: { x: 0, y: 0, width: 128, height: 128 },
    footprint: [{ x: 0, y: 0, width: 128, height: 128 }],
    boundary: [],
    doorIds: [],
    windowIds: [],
    privateEligible: true,
    access: { mode, assignedPersonIds, knockable: false },
    ...(mode === "assigned" ? { ownerUserId: assignedPersonIds[0]! } : {}),
    build: { mode: mode === "assigned" ? "assigned" : "default", assignedPersonIds },
  };
}
