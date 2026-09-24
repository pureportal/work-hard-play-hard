import { randomUUID } from "node:crypto";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { OwnedAssetEntity } from "../src/persistence/entities/index.js";
import { PostgreSqlWorkspaceRepository } from "../src/persistence/postgresql-workspace-repository.js";
import { WorkspaceStore } from "../src/store.js";
import { createTestData } from "../src/testing/workspace-data.js";

describe("starter inventory PostgreSQL persistence", () => {
  it("saves the grant once, restores its receipts, and preserves zero resale value without backfilling existing players", async () => {
    const databaseName = `workhard_starter_test_${randomUUID().replaceAll("-", "")}`;
    const admin = await MikroORM.init(createDatabaseConfig({ ...process.env, POSTGRES_DB_NAME: "postgres" }));
    let orm: MikroORM | undefined;
    let created = false;
    try {
      await admin.em.fork().execute(`create database "${databaseName}"`);
      created = true;
      const config = createDatabaseConfig({ ...process.env, POSTGRES_DB_NAME: databaseName });
      orm = await MikroORM.init({ ...config, migrations: { ...config.migrations, snapshot: false } });
      await orm.schema.create();
      const repository = new PostgreSqlWorkspaceRepository(orm);
      const existing = new WorkspaceStore(createTestData()).exportMutableState();
      for (const account of existing.economy.accounts) account.inventory = [];
      existing.economy.transactions = existing.economy.transactions.filter((transaction) => transaction.kind === "welcome");
      await repository.save({ players: [], store: existing });

      const store = new WorkspaceStore();
      store.restoreMutableState((await repository.load())!.store);
      const userId = "starter-player";
      store.addMember({ id: userId, username: "starter", email: "starter@example.com" });
      const inventory = store.getPlayerEconomy(userId).inventory;
      expect(inventory.map((asset) => asset.assetId)).toEqual(["desk-straight", "chair-office", "decor-monitor", "decor-coffee", "decor-laptop"]);
      const desk = inventory.find((asset) => asset.assetId === "desk-straight")!;
      const laptop = inventory.find((asset) => asset.assetId === "decor-laptop")!;
      const saved = { players: [], store: store.exportMutableState() };
      await repository.save(saved);
      await repository.save(saved);
      expect(await orm.em.fork().count(OwnedAssetEntity, { userId })).toBe(5);
      await orm.close(true);

      orm = await MikroORM.init(config);
      const reconnected = new PostgreSqlWorkspaceRepository(orm);
      const loaded = (await reconnected.load())!;
      expect(loaded).toEqual(saved);
      const restored = new WorkspaceStore();
      restored.restoreMutableState(loaded.store);
      expect(restored.getPlayerEconomy(userId)).toMatchObject({ coinBalance: 250, lifetimeEarned: 250, lifetimeSpent: 0, inventory });
      for (const member of existing.members) expect(restored.getPlayerEconomy(member.id).inventory).toEqual([]);
      expect(restored.disposeAsset(userId, desk.id, "asset_sale", "sell-starter").transaction.amount).toBe(0);
      expect(restored.disposeAsset(userId, laptop.id, "asset_donation", "donate-starter", "workspace").transaction.amount).toBe(0);
      await reconnected.save({ players: [], store: restored.exportMutableState() });

      const finalStore = new WorkspaceStore();
      finalStore.restoreMutableState((await reconnected.load())!.store);
      expect(finalStore.getPlayerEconomy(userId)).toMatchObject({ coinBalance: 250, inventory: inventory.filter((asset) => asset.id !== desk.id && asset.id !== laptop.id) });
      expect(finalStore.getPublicEconomy().inventory).toEqual([
        { id: laptop.id, assetId: "decor-laptop", fundId: "workspace", paid: 0 },
      ]);
      expect(finalStore.disposeAsset(userId, desk.id, "asset_sale", "sell-starter").replayed).toBe(true);
      expect(await orm.em.fork().count(OwnedAssetEntity, { userId })).toBe(3);
    } finally {
      await orm?.close(true);
      try {
        if (created) await admin.em.fork().execute(`drop database "${databaseName}"`);
      } finally {
        await admin.close(true);
      }
    }
  }, 60_000);
});
