import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { emptyFallingBlocksSpecialCounts } from "@workhard/shared";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { GameScoreEntity, PlayerGameStatisticsEntity } from "../src/persistence/entities/index.js";
import { Migration20260914120000 } from "../src/migrations/Migration20260914120000.js";

describe("Falling Blocks statistics PostgreSQL persistence", () => {
  it("migrates unknown history, round-trips counts and crown ownership, and enforces one crown", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute(`
        create temporary table "game_scores" (
          "id" text primary key, "round_id" text not null, "definition_id" text not null, "user_id" text not null,
          "score" integer not null, "lines" integer not null, "level" integer not null, "mode" text not null,
          "player_count" integer not null, "placement" integer not null, "won" boolean not null,
          "played_at" timestamptz not null, "sort_order" integer not null
        ) on commit drop;
        create temporary table "player_game_statistics" (
          "definition_id" text not null, "user_id" text not null, "games_played" integer not null,
          "multiplayer_games_played" integer not null, "multiplayer_wins" integer not null,
          "highest_score" integer not null, "highest_lines" integer not null,
          "total_score" integer not null, "total_lines" integer not null, "sort_order" integer not null,
          primary key ("definition_id", "user_id")
        ) on commit drop;
        insert into "player_game_statistics" values ('game-falling-blocks', 'player', 3, 2, 1, 100, 1, 300, 3, 0)
      `);
      const migration = new Migration20260914120000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      const history = await em.findOneOrFail(PlayerGameStatisticsEntity, { userId: "player" });
      expect(history.fallingBlocks).toBeNull();
      expect(history.holdsCrown).toBe(false);
      const counts = { ...emptyFallingBlocksSpecialCounts(), tSpins: 2, tSpinDoubles: 2, quads: 3, backToBackClears: 4 };
      history.fallingBlocks = { gamesPlayed: 1, totals: counts };
      history.holdsCrown = true;
      em.create(GameScoreEntity, {
        id: "score", roundId: "round", definitionId: "game-falling-blocks", userId: "player", score: 5200,
        lines: 16, level: 3, mode: "multiplayer", playerCount: 2, placement: 1, won: true,
        playedAt: new Date(), sortOrder: 0, fallingBlocks: counts,
      });
      await em.flush();
      em.clear();
      expect((await em.findOneOrFail(GameScoreEntity, { id: "score" })).fallingBlocks).toEqual(counts);
      const saved = await em.findOneOrFail(PlayerGameStatisticsEntity, { userId: "player" });
      expect(saved.fallingBlocks).toEqual({ gamesPlayed: 1, totals: counts });
      expect(saved.holdsCrown).toBe(true);
      await expect(em.execute(`insert into "player_game_statistics" ("definition_id", "user_id", "games_played", "multiplayer_games_played", "multiplayer_wins", "highest_score", "highest_lines", "total_score", "total_lines", "sort_order", "holds_crown") values ('game-falling-blocks', 'challenger', 1, 1, 1, 10, 0, 10, 0, 1, true)`)).rejects.toThrow(/unique|duplicate/i);
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
