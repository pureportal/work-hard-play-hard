import { describe, expect, it } from "vitest";
import { clientCommandSchema, corporateIdentityBodySchema, registrationSettingsBodySchema } from "./protocol.js";

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

describe("corporate identity protocol", () => {
  it("normalizes colors and rejects unknown settings", () => {
    expect(corporateIdentityBodySchema.parse({
      applicationName: " Acme Spaces ",
      primaryColor: "#123ABC",
      secondaryColor: "#F28C28",
      authenticationLayout: "centered",
    })).toEqual({
      applicationName: "Acme Spaces",
      primaryColor: "#123abc",
      secondaryColor: "#f28c28",
      authenticationLayout: "centered",
    });
    expect(corporateIdentityBodySchema.safeParse({
      applicationName: "Acme",
      primaryColor: "blue",
      secondaryColor: "#f28c28",
      authenticationLayout: "split",
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

describe("Falling Blocks protocol", () => {
  it("accepts the mode and target options and rejects unknown or client-controlled rules", () => {
    const start = { type: "game.start", requestId: "settings", definitionId: "game-falling-blocks", objectId: "object-falling-blocks" };
    for (const mode of ["classic", "speed-up", "sudden-death"]) {
      for (const attackTarget of ["random", "fewest-stones"]) {
        const command = { ...start, settings: { mode, attackTarget } };
        expect(clientCommandSchema.parse(command)).toEqual(command);
      }
    }
    for (const settings of [
      { mode: "unknown", attackTarget: "random" },
      { mode: "classic", attackTarget: "highest-score" },
      { mode: ["speed-up", "sudden-death"], attackTarget: "random" },
      { mode: "classic" },
      { mode: "classic", attackTarget: "random", delayMs: 0 },
      { mode: "classic", attackTarget: "random", targetUserId: "user-leo", rows: 20 },
    ]) expect(clientCommandSchema.safeParse({ ...start, settings }).success).toBe(false);
    expect(clientCommandSchema.safeParse({
      type: "game.start", requestId: "wrong-game", definitionId: "game-tic-tac-toe", objectId: "object-tic-tac-toe", variantId: "classic",
      settings: { mode: "classic", attackTarget: "random" },
    }).success).toBe(false);
  });

  it("accepts explicit solo play and rejects opponent options for the wrong game", () => {
    const start = { type: "game.start", requestId: "solo", definitionId: "game-falling-blocks", objectId: "object-falling-blocks", solo: true };
    expect(clientCommandSchema.safeParse(start).success).toBe(true);
    expect(clientCommandSchema.safeParse({ ...start, objectId: undefined }).success).toBe(false);
    expect(clientCommandSchema.safeParse({ ...start, objectId: "" }).success).toBe(false);
    expect(clientCommandSchema.safeParse({ ...start, bot: { difficulty: "easy" } }).success).toBe(false);
    expect(clientCommandSchema.safeParse({ ...start, definitionId: "game-tic-tac-toe", objectId: "object-tic-tac-toe", variantId: "classic", solo: true }).success).toBe(false);
  });

  it("accepts the hold command", () => {
    expect(clientCommandSchema.safeParse({
      type: "game.command", roundId: "11111111-1111-4111-8111-111111111111",
      requestId: "hold-piece",
      command: "hold",
    }).success).toBe(true);
  });
});

describe("Tic-Tac-Toe protocol", () => {
  it("validates bot difficulty without accepting client-controlled identities", () => {
    const start = { type: "game.start", requestId: "bot", definitionId: "game-tic-tac-toe", objectId: "object-tic-tac-toe", variantId: "ultimate" };
    for (const difficulty of ["easy", "medium", "hard"]) {
      expect(clientCommandSchema.safeParse({ ...start, bot: { difficulty } }).success).toBe(true);
    }
    expect(clientCommandSchema.safeParse({ ...start, bot: { difficulty: "expert" } }).success).toBe(false);
    expect(clientCommandSchema.safeParse({ ...start, bot: { difficulty: "easy", userId: "user-leo" } }).success).toBe(false);
  });

  it.each([
    { kind: "classic.place", cell: 0.5 },
    { kind: "ultimate.place", board: -1, cell: 0 },
    { kind: "ultimate.place", board: 0, cell: 9 },
    { kind: "stacking.place", cell: 0, size: "huge" },
    { kind: "stacking.move", fromCell: 0, toCell: -1 },
    { kind: "stacking.move", fromCell: 0 },
    { kind: "classic.place", cell: 0, mark: "o" },
    { kind: "unknown", cell: 0 },
  ])("rejects malformed or client-controlled moves: %j", (command) => {
    expect(clientCommandSchema.safeParse({ type: "game.command", roundId: "11111111-1111-4111-8111-111111111111", requestId: "invalid", command }).success).toBe(false);
  });

  it("rejects unknown variants and variants on another game", () => {
    expect(clientCommandSchema.safeParse({ type: "game.start", requestId: "invalid", definitionId: "game-tic-tac-toe", objectId: "object-tic-tac-toe", variantId: "unknown" }).success).toBe(false);
    expect(clientCommandSchema.safeParse({ type: "game.start", requestId: "invalid", definitionId: "game-falling-blocks", objectId: "object-falling-blocks", variantId: "classic" }).success).toBe(false);
  });

  it("accepts a variant start and each move shape", () => {
    expect(clientCommandSchema.safeParse({
      type: "game.start",
      requestId: "start-stacking",
      definitionId: "game-tic-tac-toe", objectId: "object-tic-tac-toe",
      variantId: "stacking",
    }).success).toBe(true);

    for (const command of [
      { kind: "classic.place", cell: 4 },
      { kind: "ultimate.place", board: 2, cell: 7 },
      { kind: "stacking.place", cell: 1, size: "large" },
      { kind: "stacking.move", fromCell: 1, toCell: 8 },
    ]) {
      expect(clientCommandSchema.safeParse({
        type: "game.command", roundId: "11111111-1111-4111-8111-111111111111",
        requestId: "move",
        command,
      }).success).toBe(true);
    }
  });

  it("rejects missing variants and out-of-range cells", () => {
    expect(clientCommandSchema.safeParse({
      type: "game.start",
      requestId: "start",
      definitionId: "game-tic-tac-toe", objectId: "object-tic-tac-toe",
    }).success).toBe(false);
    expect(clientCommandSchema.safeParse({
      type: "game.command", roundId: "11111111-1111-4111-8111-111111111111",
      requestId: "move",
      command: { kind: "classic.place", cell: 9 },
    }).success).toBe(false);
  });
});

describe("chess protocol", () => {
  const matchId = "11111111-1111-4111-8111-111111111111";

  it("requires bot games to have a private seat without a human invitation", () => {
    const command = { type: "chess.match_create", requestId: "bot" };
    const settings = { timeControl: "standard", pauseWeekends: false, access: "locked", bot: { difficulty: "medium" } };
    expect(clientCommandSchema.safeParse({ ...command, settings }).success).toBe(true);
    expect(clientCommandSchema.safeParse({ ...command, settings: { ...settings, access: "open" } }).success).toBe(false);
    expect(clientCommandSchema.safeParse({ ...command, settings: { ...settings, opponentUserId: "user-leo" } }).success).toBe(false);
    expect(clientCommandSchema.safeParse({ ...command, settings: { ...settings, bot: { difficulty: "expert" } } }).success).toBe(false);
  });

  it("accepts open, locked, timed, and promotion commands", () => {
    for (const settings of [
      { timeControl: "standard", pauseWeekends: false, access: "open" },
      { timeControl: "rapid", pauseWeekends: false, access: "open" },
      {
        timeControl: "daily",
        pauseWeekends: true,
        access: "locked",
        opponentUserId: "user-leo",
      },
    ]) {
      expect(clientCommandSchema.safeParse({
        type: "chess.match_create",
        requestId: "create-chess",
        settings,
      }).success).toBe(true);
    }
    expect(clientCommandSchema.safeParse({
      type: "chess.move",
      requestId: "promote",
      matchId,
      move: { from: "a7", to: "a8", promotion: "knight" },
    }).success).toBe(true);
    expect(clientCommandSchema.safeParse({
      type: "chess.draw_respond",
      requestId: "draw",
      matchId,
      accept: true,
    }).success).toBe(true);
  });

  it("rejects invalid settings, squares, match IDs, and extra fields", () => {
    for (const command of [
      {
        type: "chess.match_create",
        requestId: "weekend-rapid",
        settings: { timeControl: "rapid", pauseWeekends: true, access: "open" },
      },
      {
        type: "chess.match_create",
        requestId: "locked-without-player",
        settings: { timeControl: "standard", pauseWeekends: false, access: "locked" },
      },
      {
        type: "chess.move",
        requestId: "bad-square",
        matchId,
        move: { from: "e9", to: "e4" },
      },
      {
        type: "chess.match_open",
        requestId: "bad-id",
        matchId: "not-a-match-id",
      },
      {
        type: "chess.match_create",
        requestId: "extra",
        settings: { timeControl: "standard", pauseWeekends: false, access: "open" },
        spectatorMode: true,
      },
    ]) {
      expect(clientCommandSchema.safeParse(command).success).toBe(false);
    }
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
      sessionId: "11111111-1111-4111-8111-111111111111",
      requestId: "media-state",
      microphone: true,
      camera: false,
    }).success).toBe(true);
  });

  it("requires both device states", () => {
    expect(clientCommandSchema.safeParse({
      type: "proximity.set_media",
      sessionId: "11111111-1111-4111-8111-111111111111",
      requestId: "media-state",
      microphone: true,
    }).success).toBe(false);
  });
});

describe("asset protocol", () => {
  it("accepts raster asset placement and seating commands", () => {
    expect(clientCommandSchema.safeParse({
      type: "project.edit", fundId: "workspace",
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
      type: "project.edit", fundId: "workspace",
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
        type: "project.edit", fundId: "workspace",
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
      settings: { roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } },
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
