import type { EntityManager, MikroORM } from "@mikro-orm/postgresql";
import type { AuthPersistenceState, WorkspacePersistenceState } from "../persistence/application-database.js";
import { databaseEntities } from "../persistence/entities/index.js";
import { PostgreSqlAuthRepository } from "../persistence/postgresql-auth-repository.js";
import { PostgreSqlWorkspaceRepository } from "../persistence/postgresql-workspace-repository.js";

export async function persistSimulatedWorkplace(orm: MikroORM, workspace: WorkspacePersistenceState, auth: AuthPersistenceState): Promise<void> {
  await orm.em.transactional(async (entityManager) => {
    await entityManager.execute("select pg_advisory_xact_lock(734219, 1)");
    await assertEmptyWorkplaceDatabase(entityManager);
    await new PostgreSqlWorkspaceRepository(orm).save(workspace);
    await new PostgreSqlAuthRepository(orm).save(auth);
  });
}

export async function assertEmptyWorkplaceDatabase(entityManager: EntityManager): Promise<void> {
  const tables = await entityManager.execute<{ table_name: string }[]>(
    "select table_name from information_schema.tables where table_schema = current_schema() and table_type = 'BASE TABLE'",
  );
  const existing = new Set(tables.map(({ table_name }) => table_name));
  for (const entity of databaseEntities) {
    if (existing.has(entity.meta.tableName) && await entityManager.count<object>(entity.meta.class, {}) > 0) {
      throw new Error("Seeding requires an empty database. Use a separate database that has not been started as a server.");
    }
  }
}
