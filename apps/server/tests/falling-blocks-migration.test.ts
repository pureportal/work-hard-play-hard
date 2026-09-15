import { createTestData } from "../src/testing/workspace-data.js";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import type { WorldObject } from "@workhard/shared";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Migration20260906100000 } from "../src/migrations/Migration20260906100000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { WorkspaceStore } from "../src/store.js";

let orm: MikroORM;
let entityManager: EntityManager;

beforeAll(async () => {
  orm = await MikroORM.init(createDatabaseConfig());
});

afterAll(async () => {
  await orm?.close(true);
});

beforeEach(async () => {
  entityManager = orm.em.fork();
  await entityManager.begin();
  await entityManager.execute("set local search_path = pg_temp");
  await entityManager.execute(`
    create temporary table "floor_layouts" (
      "floor_id" text primary key, "revision" integer not null, "objects" jsonb not null
    ) on commit drop;
    create temporary table "owned_assets" (
      "id" text primary key, "asset_id" text not null
    ) on commit drop;
    create temporary table "coin_transactions" (
      "id" text primary key, "asset_id" text, "kind" text not null, "operation_fingerprint" text not null
    ) on commit drop;
    create temporary table "game_scores" (
      "id" text primary key, "definition_id" text not null, "score" integer not null
    ) on commit drop;
    create temporary table "player_game_statistics" (
      "definition_id" text not null, "user_id" text not null,
      "games_played" integer not null, "multiplayer_games_played" integer not null,
      "multiplayer_wins" integer not null, "highest_score" integer not null,
      "highest_lines" integer not null, "total_score" integer not null,
      "total_lines" integer not null, "sort_order" integer not null,
      primary key ("definition_id", "user_id")
    ) on commit drop
  `);
});

afterEach(async () => {
  if (entityManager?.isInTransaction()) {
    await entityManager.rollback();
  }
});

async function migrate(): Promise<void> {
  const migration = new Migration20260906100000(orm.em.getDriver(), orm.config);
  migration.setTransactionContext(entityManager.getTransactionContext()!);
  migration.up();
  for (const query of migration.getQueries()) {
    await migration.execute(query);
  }
}

describe("Falling Blocks database migration", () => {
  it("restores saved layouts while preserving object order, IDs, designs, and custom labels", async () => {
    const state = new WorkspaceStore(createTestData()).exportMutableState();
    const studio = state.layouts.find((layout) => layout.floorId === "floor-studio")!;
    const table = studio.objects.find((object) => object.assetId === "equipment-falling-blocks")!;
    table.id = "object-tetris";
    const customTable: WorldObject = { ...table, id: "custom-table", label: "Lunch tournament", rotation: 90, variantId: "violet" };
    const unlabeledTable: WorldObject = { ...table, id: "unlabeled-table" };
    delete unlabeledTable.label;
    studio.objects.push(customTable, unlabeledTable, { ...table, id: "current-table", label: "Tetris" });
    const expected = structuredClone(state);
    const expectedStudio = expected.layouts.find((layout) => layout.floorId === "floor-studio")!;
    expectedStudio.revision += 1;
    for (const object of [table, customTable, unlabeledTable]) {
      object.assetId = "equipment-tetris";
    }
    table.label = "Tetris";
    for (const layout of state.layouts) {
      await entityManager.execute(
        'insert into "floor_layouts" values (?, ?, ?::jsonb)',
        [layout.floorId, layout.revision, JSON.stringify(layout.objects)],
      );
    }
    await entityManager.execute('insert into "floor_layouts" values (?, ?, ?::jsonb)', ["empty", 3, "[]"]);
    expect(() => new WorkspaceStore(createTestData()).restoreMutableState(state)).toThrow("LAYOUT_STATE_INVALID");

    await migrate();

    const migrated = await entityManager.execute<Array<{ floor_id: string; revision: number; objects: WorldObject[] }>>(
      'select * from "floor_layouts" order by "floor_id"',
    );
    for (const layout of state.layouts) {
      const saved = migrated.find((row) => row.floor_id === layout.floorId)!;
      layout.revision = saved.revision;
      layout.objects = saved.objects;
    }
    expect(state).toEqual(expected);
    expect(migrated.find((row) => row.floor_id === "empty")).toEqual({ floor_id: "empty", revision: 3, objects: [] });
    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState(state);
    expect(restored.exportMutableState()).toEqual(expected);

    await migrate();

    expect(await entityManager.execute('select * from "floor_layouts" order by "floor_id"')).toEqual(migrated);
  });

  it("retains purchases, scores, and statistics under the current identifiers", async () => {
    await entityManager.execute(`
      insert into "owned_assets" values ('table', 'equipment-tetris'), ('chair', 'chair-office');
      insert into "coin_transactions" values
        ('table-purchase', 'equipment-tetris', 'shop_purchase', 'shop_purchase:equipment-tetris'),
        ('chair-purchase', 'chair-office', 'shop_purchase', 'shop_purchase:chair-office'),
        ('reward', null, 'game_reward', 'game_reward:3:false');
      insert into "game_scores" values
        ('old-score', 'game-tetris', 500), ('current-score', 'game-falling-blocks', 900), ('chess-score', 'game-chess', 1);
      insert into "player_game_statistics" values
        ('game-tetris', 'player-one', 2, 1, 1, 500, 5, 700, 7, 0),
        ('game-falling-blocks', 'player-one', 3, 2, 1, 900, 4, 1100, 6, 2),
        ('game-tetris', 'player-two', 1, 1, 0, 400, 3, 400, 3, 1),
        ('game-chess', 'player-one', 1, 1, 1, 1, 0, 1, 0, 3)
    `);

    await migrate();

    expect(await entityManager.execute('select * from "owned_assets" order by "id"')).toEqual([
      { id: "chair", asset_id: "chair-office" },
      { id: "table", asset_id: "equipment-falling-blocks" },
    ]);
    expect(await entityManager.execute('select * from "coin_transactions" order by "id"')).toEqual([
      { id: "chair-purchase", asset_id: "chair-office", kind: "shop_purchase", operation_fingerprint: "shop_purchase:chair-office" },
      { id: "reward", asset_id: null, kind: "game_reward", operation_fingerprint: "game_reward:3:false" },
      {
        id: "table-purchase", asset_id: "equipment-falling-blocks", kind: "shop_purchase",
        operation_fingerprint: "shop_purchase:equipment-falling-blocks",
      },
    ]);
    expect(await entityManager.execute('select * from "game_scores" order by "id"')).toEqual([
      { id: "chess-score", definition_id: "game-chess", score: 1 },
      { id: "current-score", definition_id: "game-falling-blocks", score: 900 },
      { id: "old-score", definition_id: "game-falling-blocks", score: 500 },
    ]);
    const statistics = await entityManager.execute('select * from "player_game_statistics" order by "sort_order"');
    expect(statistics).toEqual([
      {
        definition_id: "game-falling-blocks", user_id: "player-one", games_played: 5,
        multiplayer_games_played: 3, multiplayer_wins: 2, highest_score: 900, highest_lines: 5,
        total_score: 1800, total_lines: 13, sort_order: 0,
      },
      {
        definition_id: "game-falling-blocks", user_id: "player-two", games_played: 1,
        multiplayer_games_played: 1, multiplayer_wins: 0, highest_score: 400, highest_lines: 3,
        total_score: 400, total_lines: 3, sort_order: 1,
      },
      {
        definition_id: "game-chess", user_id: "player-one", games_played: 1,
        multiplayer_games_played: 1, multiplayer_wins: 1, highest_score: 1, highest_lines: 0,
        total_score: 1, total_lines: 0, sort_order: 3,
      },
    ]);

    await migrate();

    expect(await entityManager.execute('select * from "player_game_statistics" order by "sort_order"')).toEqual(statistics);
  });
});
