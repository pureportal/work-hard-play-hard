import { createTestData } from "../src/testing/workspace-data.js";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { type GameSettings, type OrganisationState, type Room } from "@workhard/shared";
import { Migration20260915230000 } from "../src/migrations/Migration20260915230000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { WorkspaceStore } from "../src/store.js";

describe("organisation and permissions PostgreSQL migration", () => {
  it("preserves existing restrictions and round-trips an in-progress CEO vote", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute("create temporary table members (id text primary key, sort_order integer) on commit drop");
      await em.execute("create temporary table workspace_settings (id text primary key, game_settings jsonb) on commit drop");
      await em.execute("create temporary table floor_layouts (floor_id text primary key, rooms jsonb) on commit drop");
      await em.execute("insert into members values ('user-leo', 1), ('user-maya', 0)");
      await em.execute(`insert into workspace_settings values ('disabled', '{"allowPlayerAssetPlacementInPublicRooms":false}'), ('enabled', '{"allowPlayerAssetPlacementInPublicRooms":true}')`);
      const seed = new WorkspaceStore(createTestData());
      const rooms = [seed.getRoom("room-focus")!, seed.getRoom("room-product")!]
        .map(({ build: _build, organisationUnitId: _unitId, ...room }) => room);
      rooms[1]!.access = { mode: "open", assignedPersonIds: [], knockable: false };
      await em.execute("insert into floor_layouts values ('studio', ?::jsonb), ('empty', '[]'::jsonb)", [JSON.stringify(rooms)]);
      const migration = new Migration20260915230000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      const rows = await em.execute<{ id: string; game_settings: GameSettings; organisation: OrganisationState }[]>("select * from workspace_settings order by id");
      expect(rows[0]!.organisation.ceoIds).toEqual(["user-maya"]);
      expect(rows[0]!.organisation.assignments).toEqual([]);
      expect(rows[0]!.game_settings.roomBuild.mode).toBe("none");
      expect(rows[1]!.game_settings.roomBuild.mode).toBe("open");
      const savedRooms = await em.execute<{ rooms: Room[] }[]>("select rooms from floor_layouts where floor_id = 'studio'");
      expect(savedRooms[0]!.rooms[0]!.access).toEqual(rooms[0]!.access);
      expect(savedRooms[0]!.rooms[0]!.build).toEqual({ mode: "assigned", assignedPersonIds: rooms[0]!.access.assignedPersonIds });
      expect(savedRooms[0]!.rooms[1]!.build?.mode).toBe("default");
      expect(await em.execute("select rooms from floor_layouts where floor_id = 'empty'")).toEqual([{ rooms: [] }]);
      const change = (edit: Parameters<WorkspaceStore["editOrganisation"]>[2]) => seed.editOrganisation("user-maya", seed.getOrganisation().revision, edit);
      change({ type: "ceo.propose_removal", userId: "user-sam" });
      const voteId = seed.getOrganisation().removalVotes[0]!.id;
      change({ type: "ceo.vote", voteId, approve: true });
      await em.execute("update workspace_settings set organisation = ?::jsonb where id = 'disabled'", [JSON.stringify(seed.getOrganisation())]);
      const [saved] = await em.execute<{ organisation: OrganisationState }[]>("select organisation from workspace_settings where id = 'disabled'");
      const restored = new WorkspaceStore(createTestData());
      restored.restoreMutableState({ ...seed.exportMutableState(), organisation: saved!.organisation });
      expect(restored.getOrganisation().ceoIds).toContain("user-sam");
      restored.editOrganisation("user-noah", restored.getOrganisation().revision, { type: "ceo.vote", voteId, approve: true });
      expect(restored.getOrganisation().ceoIds).not.toContain("user-sam");
      expect(restored.getOrganisation().removalVotes[0]?.status).toBe("passed");
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
