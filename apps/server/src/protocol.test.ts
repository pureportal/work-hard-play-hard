import { describe, expect, it } from "vitest";
import { clientCommandSchema, registrationSettingsBodySchema } from "./protocol.js";

describe("registration settings protocol", () => {
  it("normalizes valid domains and rejects duplicates and owner defaults", () => {
    const parsed = registrationSettingsBodySchema.safeParse({
      enabled: true,
      invitationRequired: true,
      whitelistedDomains: [" Example.COM "],
      defaultRole: "member",
    });

    expect(parsed.success && parsed.data.whitelistedDomains).toEqual(["example.com"]);
    expect(registrationSettingsBodySchema.safeParse({
      enabled: true,
      invitationRequired: true,
      whitelistedDomains: ["example.com", "EXAMPLE.COM"],
      defaultRole: "member",
    }).success).toBe(false);
    expect(registrationSettingsBodySchema.safeParse({
      enabled: true,
      invitationRequired: true,
      whitelistedDomains: [],
      defaultRole: "owner",
    }).success).toBe(false);
  });
});

describe("movement protocol", () => {
  it("requires the destination floor with every click-to-move command", () => {
    expect(clientCommandSchema.safeParse({
      type: "movement.set_destination",
      requestId: "move",
      floorId: "floor-studio",
      x: 320,
      y: 480,
    }).success).toBe(true);
    expect(clientCommandSchema.safeParse({
      type: "movement.set_destination",
      requestId: "move",
      x: 320,
      y: 480,
    }).success).toBe(false);
  });

  it("accepts an explicit movement stop", () => {
    expect(clientCommandSchema.safeParse({
      type: "movement.stop",
      requestId: "stop",
    }).success).toBe(true);
  });
});

describe("Tetris protocol", () => {
  it("accepts the hold command", () => {
    expect(clientCommandSchema.safeParse({
      type: "game.command",
      requestId: "hold-piece",
      command: "hold",
    }).success).toBe(true);
  });
});

describe("kidnapping protocol", () => {
  it("accepts pickup, stop, and scoped settings commands", () => {
    expect(clientCommandSchema.safeParse({
      type: "kidnapping.start",
      requestId: "pickup",
      targetUserId: "user-leo",
    }).success).toBe(true);
    expect(clientCommandSchema.safeParse({ type: "kidnapping.stop", requestId: "stop" }).success).toBe(true);
    expect(clientCommandSchema.safeParse({
      type: "kidnapping.global_settings_update",
      requestId: "global-settings",
      settings: {
        enabled: true,
        targetPolicy: { mode: "block_list", userIds: ["user-leo"] },
      },
    }).success).toBe(true);
    expect(clientCommandSchema.safeParse({
      type: "kidnapping.player_settings_update",
      requestId: "player-settings",
      settings: {
        carrierPolicy: { mode: "allow_list", userIds: ["user-maya"] },
      },
    }).success).toBe(true);
  });

  it("rejects unknown policy modes and duplicate user IDs", () => {
    expect(clientCommandSchema.safeParse({
      type: "kidnapping.player_settings_update",
      requestId: "bad-mode",
      settings: { carrierPolicy: { mode: "sometimes", userIds: [] } },
    }).success).toBe(false);
    expect(clientCommandSchema.safeParse({
      type: "kidnapping.global_settings_update",
      requestId: "duplicates",
      settings: {
        enabled: true,
        targetPolicy: { mode: "allow_list", userIds: ["user-leo", "user-leo"] },
      },
    }).success).toBe(false);
  });
});

describe("proximity media protocol", () => {
  it("accepts explicit microphone and camera readiness", () => {
    expect(clientCommandSchema.safeParse({
      type: "proximity.set_media",
      requestId: "media-state",
      microphone: true,
      camera: false,
    }).success).toBe(true);
  });

  it("requires both device states", () => {
    expect(clientCommandSchema.safeParse({
      type: "proximity.set_media",
      requestId: "media-state",
      microphone: true,
    }).success).toBe(false);
  });
});

describe("asset protocol", () => {
  it("accepts raster asset placement and seating commands", () => {
    expect(clientCommandSchema.safeParse({
      type: "layout.apply",
      requestId: "place",
      baseRevision: 1,
      edit: { tool: "asset", position: { x: 32, y: 48 }, assetId: "desk-corner", variantId: "sage", rotation: 90 },
    }).success).toBe(true);
    expect(clientCommandSchema.safeParse({
      type: "asset.interact",
      requestId: "sit",
      objectId: "chair",
      interactionId: "seat",
    }).success).toBe(true);
  });

  it("rejects arbitrary asset rotations", () => {
    expect(clientCommandSchema.safeParse({
      type: "layout.apply",
      requestId: "place",
      baseRevision: 1,
      edit: { tool: "asset", position: { x: 32, y: 48 }, assetId: "desk-corner", variantId: "sage", rotation: 45 },
    }).success).toBe(false);
  });

  it("accepts selection-based layout edits", () => {
    for (const edit of [
      { tool: "asset.move", objectId: "asset", position: { x: -32, y: 64 }, variantId: "sage", rotation: 90 },
      { tool: "wall.move", wallId: "wall", start: { x: 32, y: 64 }, end: { x: 96, y: 64 } },
      { tool: "opening.move", openingId: "door", position: { x: 64, y: 64 } },
      { tool: "item.remove", item: { type: "opening", id: "door" } },
    ]) {
      expect(clientCommandSchema.safeParse({
        type: "layout.apply",
        requestId: "edit",
        baseRevision: 1,
        edit,
      }).success).toBe(true);
    }
  });

  it("accepts inventory-instance placement without a client-selected asset definition", () => {
    const command = {
      type: "player_asset.place",
      requestId: "place-owned",
      baseRevision: 2,
      ownedAssetId: "05e07cb8-4909-44f3-898b-3f0e1d10cd10",
      position: { x: 32, y: 48 },
      variantId: "white",
      rotation: 90,
    };
    expect(clientCommandSchema.safeParse(command).success).toBe(true);
    expect(clientCommandSchema.safeParse({ ...command, assetId: "outdoor-pool" }).success).toBe(false);
  });
});

describe("economy protocol", () => {
  it("accepts claims, catalog purchases, and the single global placement setting", () => {
    expect(clientCommandSchema.safeParse({ type: "economy.claim_daily", requestId: "daily" }).success).toBe(true);
    expect(clientCommandSchema.safeParse({ type: "economy.purchase_asset", requestId: "buy", assetId: "chair-office" }).success).toBe(true);
    expect(clientCommandSchema.safeParse({
      type: "game.settings_update",
      requestId: "settings",
      settings: { allowPlayerAssetPlacementInPublicRooms: true },
    }).success).toBe(true);
    expect(clientCommandSchema.safeParse({
      type: "economy.purchase_asset",
      requestId: "buy",
      assetId: "chair-office",
      price: 1,
    }).success).toBe(false);
  });
});

describe("room settings protocol", () => {
  it("requires the layout revision for concurrent updates", () => {
    const command = {
      type: "room.update_settings",
      requestId: "update-room",
      baseRevision: 4,
      roomId: "room-focus",
      settings: {
        name: "Focus",
        color: "#d9cdf4",
        access: { mode: "open", assignedPersonIds: [], knockable: false },
      },
    };

    expect(clientCommandSchema.safeParse(command).success).toBe(true);
    expect(clientCommandSchema.safeParse({ ...command, baseRevision: undefined }).success).toBe(false);
  });
});

describe("gong protocol", () => {
  it("accepts a ring request for a placed gong", () => {
    expect(clientCommandSchema.safeParse({
      type: "interaction.ring_gong",
      requestId: "ring-gong",
      objectId: "object-commons-gong",
    }).success).toBe(true);
  });
});
